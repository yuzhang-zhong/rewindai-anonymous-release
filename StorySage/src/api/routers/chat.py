from typing import List
from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session
import asyncio
import uuid
from pathlib import Path
import os
import json
from dotenv import load_dotenv

load_dotenv()

from api.schemas.chat import (
    MessageRequest, MessageResponse, EndSessionResponse, UserMessagesResponse, TopicsResponse, TopicsFeedbackRequest, SessionStatus
)
from database.models import DBSession, DBMessage
from database.database import get_db
from interview_session.interview_session import InterviewSession
from api.core.errors import internal_server_error, sanitize_public_error_text
from api.core.auth import get_current_user
from api.core.model_settings import get_user_model_settings
from api.core.session_manager import session_manager
from api.services.fast_biography import (
    is_placeholder_biography_payload,
    save_fast_biography,
)
from api.services.mental_model import try_mark_mental_model_stale
from api.services.mirofish_graph_sync import trigger_graph_rebuild
from api.services.user_profile import load_user_profile
from interview_session.session_models import MessageType
from utils.constants.colors import RESET, RED

router = APIRouter(
    tags=["chat"]
)

BASELINE_ACCOUNTS_PREFIX = "1m2kl5"
MIN_REQUIRED_TURNS_BY_GROUP = {
    "experiment": 20,
    "anonymous": 20,
}
INTERVIEWER_RESPONSE_TIMEOUT_SEC = float(
    os.getenv("INTERVIEWER_RESPONSE_TIMEOUT_SEC", "45")
)
BIOGRAPHY_FINALIZE_TIMEOUT_SEC = float(
    os.getenv("BIOGRAPHY_FINALIZE_TIMEOUT_SEC", "45")
)
PREPARE_END_TIMEOUT_SEC = float(
    os.getenv("PREPARE_END_TIMEOUT_SEC", "12")
)
_inactive_cleanup_task: asyncio.Task | None = None


def _timeout_fallback_response(user_text: str) -> str:
    """Return a safe local prompt when the live model response is too slow."""
    has_cjk = any("\u4e00" <= char <= "\u9fff" for char in user_text)
    if has_cjk:
        return (
            "我刚刚生成得有点慢，我们先不中断。你可以继续讲这个场景里最具体的一刻："
            "当时你最难权衡的是什么？如果重来一次，哪个变量会让你改变选择？"
        )
    return (
        "I am still with you. To keep the interview moving, could you zoom in "
        "on the most concrete moment in that scene: what was the hardest "
        "trade-off, and what variable might have changed your decision?"
    )


def _cancel_slow_interviewer_turn(session: InterviewSession | None) -> None:
    if not session:
        return
    try:
        session.cancel_pending_interviewer_response()
    except Exception as exc:
        print(
            f"{RED}cancel slow interviewer turn failed: "
            f"{sanitize_public_error_text(exc)}{RESET}"
        )


def _has_saved_biography(user_id: str) -> bool:
    user_dir = Path(os.getenv("DATA_DIR", "data")) / user_id
    if not user_dir.exists():
        return False

    for biography_path in user_dir.glob("biography_*.json"):
        try:
            payload = json.loads(biography_path.read_text(encoding="utf-8"))
        except Exception as exc:
            print(
                f"{RED}Skipping unreadable biography fallback check: "
                f"{sanitize_public_error_text(exc)}{RESET}"
            )
            continue

        content = str(payload.get("content") or "").strip()
        subsections = payload.get("subsections") or {}
        if (
            content or (isinstance(subsections, dict) and len(subsections) > 0)
        ) and not is_placeholder_biography_payload(payload):
            return True

    return False


def _transcript_from_session(session: InterviewSession) -> list[dict[str, str]]:
    return [
        {
            "role": message.role,
            "content": message.content.strip(),
        }
        for message in getattr(session, "chat_history", [])
        if message.type == MessageType.CONVERSATION and message.content.strip()
    ]


def _transcript_from_feedback(
    transcript: list[MessageResponse] | None,
) -> list[dict[str, str]]:
    if not transcript:
        return []
    return [
        {
            "role": message.role,
            "content": message.content.strip(),
        }
        for message in transcript
        if message.content.strip()
    ]


def _transcript_from_db(db: Session, user_id: str) -> list[dict[str, str]]:
    rows = (
        db.query(DBMessage)
        .join(DBSession, DBMessage.session_id == DBSession.id)
        .filter(
            DBSession.user_id == user_id,
            DBMessage.role.in_(["User", "Interviewer"]),
            DBMessage.content != "",
        )
        .order_by(DBSession.seq_id, DBMessage.created_at)
        .all()
    )
    return [
        {
            "role": row.role,
            "content": row.content.strip(),
        }
        for row in rows
        if row.content and row.content.strip()
    ]


async def _write_fast_biography_if_needed(
    user_id: str,
    transcript: list[dict[str, str]],
    *,
    force: bool = False,
) -> bool:
    """Create a coherent fast biography when the full writer is unavailable."""
    if not force and _has_saved_biography(user_id):
        return False
    if not any(item["role"] == "User" for item in transcript):
        return False
    await save_fast_biography(
        user_id,
        transcript,
        model_settings=get_user_model_settings(user_id),
    )
    return True


async def _write_fallback_biography_if_missing(
    session: InterviewSession,
    user_id: str,
) -> bool:
    """Create a coherent editable biography draft when the full writer produced none."""
    return await _write_fast_biography_if_needed(
        user_id,
        _transcript_from_session(session),
    )


async def _write_fallback_biography_from_transcript(
    user_id: str,
    transcript: list[MessageResponse] | None,
    selected_topics: list[str],
    db: Session | None = None,
    *,
    force: bool = False,
) -> bool:
    """Create a coherent draft if serverless memory lost the active interview session."""
    db_transcript = _transcript_from_db(db, user_id) if db is not None else []
    feedback_transcript = _transcript_from_feedback(transcript)
    return await _write_fast_biography_if_needed(
        user_id,
        db_transcript if len(db_transcript) >= len(feedback_transcript) else feedback_transcript,
        force=force,
    )


async def _finalize_biography_or_fallback(
    session: InterviewSession,
    user_id: str,
    selected_topics: list[str],
    db: Session | None = None,
) -> dict:
    """Run the final biography update with a demo-safe fallback."""
    if not hasattr(session, "final_update_biography_and_notes"):
        db_transcript = _transcript_from_db(db, user_id) if db is not None else []
        fallback_created = await _write_fallback_biography_if_missing(
            session,
            user_id,
        ) if not db_transcript else await _write_fast_biography_if_needed(
            user_id,
            db_transcript,
            force=True,
        )
        return {"completed": False, "fallback_created": fallback_created}

    try:
        await asyncio.wait_for(
            session.final_update_biography_and_notes(
                selected_topics=selected_topics
            ),
            timeout=BIOGRAPHY_FINALIZE_TIMEOUT_SEC,
        )
        db_transcript = _transcript_from_db(db, user_id) if db is not None else []
        fallback_created = (
            await _write_fast_biography_if_needed(user_id, db_transcript, force=True)
            if db_transcript
            else await _write_fallback_biography_if_missing(session, user_id)
        )
        return {"completed": True, "fallback_created": fallback_created}
    except Exception as exc:
        print(
            f"{RED}finalize biography failed or timed out: "
            f"{sanitize_public_error_text(exc)}{RESET}"
        )
        db_transcript = _transcript_from_db(db, user_id) if db is not None else []
        fallback_created = (
            await _write_fast_biography_if_needed(user_id, db_transcript, force=True)
            if db_transcript
            else await _write_fallback_biography_if_missing(session, user_id)
        )
        return {"completed": False, "fallback_created": fallback_created}


def _release_finished_session(user_id: str) -> None:
    """Clear active/ending session state without depending on a test double."""
    if hasattr(session_manager, "mark_session_ending"):
        session_manager.mark_session_ending(user_id)
    if hasattr(session_manager, "end_session"):
        session_manager.end_session(user_id)
    elif hasattr(session_manager, "remove_inactive_sessions"):
        session_manager.remove_inactive_sessions()


def _raise_internal_chat_error(context: str, exc: Exception) -> None:
    safe_error = sanitize_public_error_text(exc)
    print(f"{RED}{context} failed: {safe_error}{RESET}")
    raise internal_server_error()


def _required_interview_turns(user_id: str) -> int:
    try:
        study_group = load_user_profile(user_id).get("study_group", "experiment")
    except Exception as exc:
        print(
            f"{RED}load study group failed; using experiment rules: "
            f"{sanitize_public_error_text(exc)}{RESET}"
        )
        study_group = "experiment"
    return MIN_REQUIRED_TURNS_BY_GROUP.get(study_group, 1)


def _count_user_turns_from_session(session: InterviewSession | None) -> int:
    if not session:
        return 0
    return sum(
        1
        for message in getattr(session, "chat_history", [])
        if message.role == "User"
        and message.type == MessageType.CONVERSATION
        and message.content.strip()
    )


def _count_user_turns_from_transcript(
    transcript: list[MessageResponse] | None,
) -> int:
    if not transcript:
        return 0
    return sum(
        1
        for message in transcript
        if message.role == "User" and message.content.strip()
    )


def _count_user_turns_from_db(db: Session, user_id: str) -> int:
    return (
        db.query(DBMessage)
        .join(DBSession, DBMessage.session_id == DBSession.id)
        .filter(
            DBSession.user_id == user_id,
            DBMessage.role == "User",
            DBMessage.content != "",
        )
        .count()
    )


def _ensure_required_interview_turns(user_id: str, current_turns: int) -> None:
    required_turns = _required_interview_turns(user_id)
    if current_turns >= required_turns:
        return
    remaining = required_turns - current_turns
    raise HTTPException(
        status_code=409,
        detail=(
            f"Please complete {required_turns} interview replies before ending. "
            f"{remaining} more to go."
        ),
    )


async def remove_inactive_sessions():
    while True:
        try:
            # Get and remove inactive/completed sessions
            removed_users = session_manager.remove_inactive_sessions()
            
            if removed_users:
                print(f"{RED}Removed interview sessions for users: {removed_users}{RESET}")
                    
        except Exception as e:
            print(
                f"{RED}remove_inactive_sessions failed: "
                f"{sanitize_public_error_text(e)}{RESET}"
            )
            
        await asyncio.sleep(60)  # Check every 1 minute


def _ensure_inactive_cleanup_task() -> None:
    """Start the cleanup loop once per process, not once per interview."""
    global _inactive_cleanup_task
    if _inactive_cleanup_task and not _inactive_cleanup_task.done():
        return
    _inactive_cleanup_task = asyncio.create_task(remove_inactive_sessions())


def _clear_api_response_queue(session: InterviewSession) -> None:
    """Drop stale responses before a new user turn, never after generation."""
    participant = getattr(session, "api_participant", None)
    if participant and hasattr(participant, "clear_pending_responses"):
        participant.clear_pending_responses()


def _ensure_api_session_accepts_messages(session: InterviewSession) -> None:
    """Avoid a serverless race where the first API message arrives before run()."""
    if not getattr(session, "session_in_progress", False):
        session.session_in_progress = True


def _safe_add_interview_message(
    session: InterviewSession | None,
    role: str,
    content: str,
) -> None:
    if not session:
        return
    try:
        _ensure_api_session_accepts_messages(session)
        session.add_message_to_chat_history(role, content)
    except Exception as exc:
        print(
            f"{RED}add interview message failed: "
            f"{sanitize_public_error_text(exc)}{RESET}"
        )


def _persist_interviewer_message(
    db: Session,
    session_id: str,
    content: str,
    role: str = "Interviewer",
) -> MessageResponse:
    response_id = str(uuid.uuid4())
    db_response = DBMessage(
        id=response_id,
        session_id=session_id,
        content=content,
        role=role,
    )
    db.add(db_response)
    db.commit()
    return MessageResponse(
        id=response_id,
        content=content,
        role=role,
        created_at=db_response.created_at,
    )


def _next_db_session_seq_id(
    db: Session,
    current_user: str,
    fallback_seq_id: int | None,
) -> int:
    latest = (
        db.query(DBSession.seq_id)
        .filter(DBSession.user_id == current_user)
        .order_by(DBSession.seq_id.desc())
        .first()
    )
    next_from_db = (latest[0] + 1) if latest else 1
    if fallback_seq_id is None:
        return next_from_db
    return max(int(fallback_seq_id), next_from_db)


def _ensure_db_session_record(
    db: Session,
    current_user: str,
    session: InterviewSession | None,
    session_id: str | None,
) -> str:
    """Guarantee DBMessage has a valid parent session, even after stale memory."""
    seq_id = _next_db_session_seq_id(
        db,
        current_user,
        getattr(session, "session_id", None),
    )
    if session_id:
        existing = db.query(DBSession).filter(
            DBSession.id == session_id,
            DBSession.user_id == current_user,
        ).first()
        if existing:
            return session_id

    repaired_session_id = str(uuid.uuid4())
    db.add(DBSession(
        id=repaired_session_id,
        seq_id=seq_id,
        user_id=current_user,
    ))
    db.commit()
    if session:
        try:
            session.set_db_session_id(repaired_session_id)
        except Exception as exc:
            print(
                f"{RED}repair db session id failed: "
                f"{sanitize_public_error_text(exc)}{RESET}"
            )
    return repaired_session_id

@router.post("/messages", response_model=MessageResponse)
async def send_message(
    request: MessageRequest,
    http_request: Request,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """Send a message to the active session or create a new one"""
    session = None
    session_id = None
    try:
        # Check if user has a session that's still ending
        if session_manager.get_session_status(current_user) == SessionStatus.ENDING:
            # Try to remove the ending session
            removed_users = session_manager.remove_inactive_sessions()
            if current_user not in removed_users:
                raise HTTPException(
                    status_code=409,  # Conflict
                    detail="Generating the session agenda for the subsequent session. "
                            "Please try again in a moment. Thanks!"
                )
        
        session = session_manager.get_active_session(current_user)

        # Get session ID
        if not session:
            model_settings = get_user_model_settings(current_user)
            if not model_settings:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "System model is not configured. Please ask the demo "
                        "host to set REWINDAI_OPENAI_API_KEY on the backend."
                    )
                )

            # Create a new session if none exists
            session = InterviewSession(
                interaction_mode='api',
                user_config={
                    "user_id": current_user,
                    "model_provider": model_settings.provider,
                    "model_name": model_settings.model_name,
                    "api_key": model_settings.api_key,
                    "max_tokens": 380,
                    "max_events_len": 8,
                    "max_consideration_iterations": 1,
                    "max_retries": 1,
                    "timeout": 18,
                    "auto_biography_update": False,
                    "defer_scribe_processing": True,
                },
                use_baseline=current_user.startswith(BASELINE_ACCOUNTS_PREFIX)
            )
            
            # Get sequence ID from interview session
            seq_id = _next_db_session_seq_id(db, current_user, session.session_id)
            session_id = str(uuid.uuid4())
            
            # Create database session record
            db_session = DBSession(
                id=session_id,
                seq_id=seq_id,
                user_id=current_user
            )
            db.add(db_session)
            db.commit()

            # Sync database session ID with interview session
            session.set_db_session_id(session_id)
            _ensure_api_session_accepts_messages(session)
            
            # Start session in the background
            asyncio.create_task(session.run())
            
            # Store session in manager after initialization
            session_manager.set_active_session(current_user, session) 
            
            # Start the inactive session checker if it's not already running
            _ensure_inactive_cleanup_task()
        else:
            # Get session ID from interview session if it exists
            session_id = session.get_db_session_id()

            session_id = _ensure_db_session_record(
                db,
                current_user,
                session,
                session_id,
            )
        
        # Store user message. Repair once if a stale serverless session points
        # at a missing parent DB session.
        try:
            db_message = DBMessage(
                id=str(uuid.uuid4()),
                session_id=session_id,
                content=request.content,
                role="User"
            )
            db.add(db_message)
            db.commit()
        except Exception as exc:
            db.rollback()
            print(
                f"{RED}user message persistence failed; repairing session: "
                f"{sanitize_public_error_text(exc)}{RESET}"
            )
            session_id = _ensure_db_session_record(
                db,
                current_user,
                session,
                None,
            )
            db_message = DBMessage(
                id=str(uuid.uuid4()),
                session_id=session_id,
                content=request.content,
                role="User"
            )
            db.add(db_message)
            db.commit()
        
        response = None
        try:
            # Add user message to interview session
            _clear_api_response_queue(session)
            _safe_add_interview_message(session, "User", request.content)

            # Get response
            response = await session.api_participant.wait_for_response(
                timeout=INTERVIEWER_RESPONSE_TIMEOUT_SEC
            )
        except Exception as exc:
            print(
                f"{RED}interviewer turn failed; using fallback: "
                f"{sanitize_public_error_text(exc)}{RESET}"
            )

        if not response:
            _cancel_slow_interviewer_turn(session)
            fallback_content = _timeout_fallback_response(request.content)
            _safe_add_interview_message(session, "Interviewer", fallback_content)
            return _persist_interviewer_message(
                db,
                session_id,
                fallback_content,
            )
        
        # Store interviewer response
        return _persist_interviewer_message(
            db,
            session_id,
            response.content,
            response.role,
        )
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        db.rollback()
        if session_id:
            fallback_content = _timeout_fallback_response(request.content)
            try:
                _safe_add_interview_message(session, "Interviewer", fallback_content)
                return _persist_interviewer_message(db, session_id, fallback_content)
            except Exception as fallback_exc:
                print(
                    f"{RED}send_message fallback persistence failed: "
                    f"{sanitize_public_error_text(fallback_exc)}{RESET}"
                )
        _raise_internal_chat_error("send_message", e)

@router.post("/skip", response_model=MessageResponse)
async def skip_message(
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """Send a skip signal to the active session"""
    session = None
    try:
        session = session_manager.get_active_session(current_user)
        if not session:
            raise HTTPException(
                status_code=404,
                detail="No active session found"
            )

        session_id = session.get_db_session_id()
        
        # Add skip signal to interview session
        _clear_api_response_queue(session)
        session.add_message_to_chat_history("User", message_type=MessageType.SKIP)

        # Store skip action in database
        user_skip_message = DBMessage(
            id=str(uuid.uuid4()),
            session_id=session_id,
            content="[Skip]",
            role="Feedback"
        )
        db.add(user_skip_message)
        db.commit()
        
        # Get response
        response = await session.api_participant.wait_for_response(
            timeout=INTERVIEWER_RESPONSE_TIMEOUT_SEC
        )
        if not response:
            _cancel_slow_interviewer_turn(session)
            fallback_content = _timeout_fallback_response("Skip the question")
            session.add_message_to_chat_history("Interviewer", fallback_content)
            response_id = str(uuid.uuid4())
            db_response = DBMessage(
                id=response_id,
                session_id=session_id,
                content=fallback_content,
                role="Interviewer"
            )
            db.add(db_response)
            db.commit()
            return MessageResponse(
                id=response_id,
                content=fallback_content,
                role="Interviewer",
                created_at=db_response.created_at
            )
        
        # Store interviewer response
        response_id = str(uuid.uuid4())
        db_response = DBMessage(
            id=response_id,
            session_id=session_id,
            content=response.content,
            role="Interviewer"
        )
        db.add(db_response)
        db.commit()
        
        return MessageResponse(
            id=response_id,
            content=response.content,
            role=response.role,
            created_at=db_response.created_at
        )
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        if session:
            session_manager.end_session(current_user)
        _raise_internal_chat_error("skip_message", e)

@router.post("/like", response_model=MessageResponse)
async def like_message(
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """Send a like signal to the active session"""
    session = None
    try:
        session = session_manager.get_active_session(current_user)
        if not session:
            raise HTTPException(
                status_code=404,
                detail="No active session found"
            )

        session_id = session.get_db_session_id()
        
        # Add like signal to interview session
        session.add_message_to_chat_history("User", message_type=MessageType.LIKE)
        
        # Store like action in database
        response_id = str(uuid.uuid4())
        db_response = DBMessage(
            id=response_id,
            session_id=session_id,
            content="[Like]",
            role="Feedback"
        )
        db.add(db_response)
        db.commit()
        
        return MessageResponse(
            id=response_id,
            content="[Like]",
            role="User",
            created_at=db_response.created_at
        )
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        if session:
            session_manager.end_session(current_user)
        _raise_internal_chat_error("like_message", e)

@router.post("/sessions/prepare-end", response_model=TopicsResponse)
async def prepare_end_session(
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """First stage of ending session - get topics covered"""
    try:
        if session_manager.get_session_status(current_user) != SessionStatus.ACTIVE:
            _ensure_required_interview_turns(
                current_user,
                _count_user_turns_from_db(db, current_user),
            )
            return TopicsResponse(
                topics=[],
                status="success"
            )
        
        # Get the active session
        session = session_manager.get_active_session(current_user)
        _ensure_required_interview_turns(
            current_user,
            max(
                _count_user_turns_from_session(session),
                _count_user_turns_from_db(db, current_user),
            ),
        )

        # Wait briefly for session scribe, but do not block ending forever.
        start_time = asyncio.get_event_loop().time()
        while session.session_scribe.processing_in_progress:
            await asyncio.sleep(0.1)
            if asyncio.get_event_loop().time() - start_time > PREPARE_END_TIMEOUT_SEC:
                break
        
        # Get topics from new memories
        try:
            topics = await asyncio.wait_for(
                session.biography_orchestrator.get_session_topics(),
                timeout=PREPARE_END_TIMEOUT_SEC,
            )
        except Exception as exc:
            print(
                f"{RED}prepare_end topic extraction skipped: "
                f"{sanitize_public_error_text(exc)}{RESET}"
            )
            topics = []
        
        return TopicsResponse(
            topics=topics,
            status="success"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        _raise_internal_chat_error("prepare_end_session", e)

@router.post("/sessions/end", response_model=EndSessionResponse)
async def end_session(
    feedback: TopicsFeedbackRequest,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """End the active session with user's topic feedback"""
    try:
        if session_manager.get_session_status(current_user) != SessionStatus.ACTIVE:
            _ensure_required_interview_turns(
                current_user,
                max(
                    _count_user_turns_from_transcript(feedback.transcript),
                    _count_user_turns_from_db(db, current_user),
                ),
            )
            fallback_created = await _write_fallback_biography_from_transcript(
                current_user,
                feedback.transcript,
                feedback.selected_topics,
                db,
                force=True,
            )
            if fallback_created:
                try_mark_mental_model_stale(
                    current_user,
                    reason="Biography regenerated from persisted interview transcript after session loss.",
                )
                try:
                    trigger_graph_rebuild(current_user, source="end_session_regenerated")
                except Exception as sync_error:
                    print(f"{RED}Graph sync trigger failed:\n{sync_error}\n{RESET}")
                return EndSessionResponse(
                    status="success",
                    message="Session ended; a transcript-based biography was generated."
                )
            raise HTTPException(
                status_code=404,
                detail="Sorry. You have no active session. Please start a new one."
            )
        
        # Get the active session
        session = session_manager.get_active_session(current_user)
        _ensure_required_interview_turns(
            current_user,
            max(
                _count_user_turns_from_session(session),
                _count_user_turns_from_db(db, current_user),
            ),
        )
        
        # Set selected topics to unblock session note update
        await session.biography_orchestrator.\
            set_selected_topics(feedback.selected_topics)
        
        # Store general session feedback if provided
        if feedback.feedback:
            # Create feedback directory if it doesn't exist
            logs_dir = Path(os.getenv("LOGS_DIR", "logs"))
            feedback_dir = logs_dir / current_user / "feedback"
            feedback_dir.mkdir(parents=True, exist_ok=True)
            
            # Get session sequence ID
            session_id = session.session_id
            
            # Write feedback to file
            feedback_file = feedback_dir / f"session_{session_id}.txt"
            feedback_content = (
                f"Session Rating: {feedback.feedback.rating}\n"
                f"Detailed Feedback:\n{feedback.feedback.feedback}\n"
                f"Selected Topics: {feedback.selected_topics}\n"
            )
            
            with open(feedback_file, "w", encoding="utf-8") as f:
                f.write(feedback_content)
        
        # End session without triggering another biography update from run().
        session.end_session()

        finalize_result = await _finalize_biography_or_fallback(
            session,
            current_user,
            feedback.selected_topics,
            db,
        )

        # Release the UI immediately after finalize/fallback so /messages and
        # a new interview are not blocked by a stale in-memory ending state.
        _release_finished_session(current_user)

        stale_result = try_mark_mental_model_stale(
            current_user,
            reason=f"Biography updated after interview session {session.session_id}.",
        )
        if stale_result["warning"]:
            print(f"{RED}{stale_result['warning']}{RESET}")

        # Trigger graph rebuild in background after biography update is done.
        # Any graph sync failure should not fail session ending.
        try:
            trigger_graph_rebuild(current_user, source="end_session")
        except Exception as sync_error:
            print(f"{RED}Graph sync trigger failed:\n{sync_error}\n{RESET}")
        
        return EndSessionResponse(
            status="success",
            message=(
                "Session ended successfully"
                if finalize_result["completed"]
                else "Session ended; a draft biography fallback was created."
            )
        )
        
    except HTTPException:
        raise
    except Exception as e:
        _raise_internal_chat_error("end_session", e)

@router.get("/sessions/{seq_id}/messages", response_model=List[MessageResponse])
async def list_session_messages(
    seq_id: int,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """Retrieve all messages for a specific session (active or not)"""
    try:
        db_session = db.query(DBSession).filter(
            DBSession.seq_id == seq_id,
            DBSession.user_id == current_user
        ).first()

        if not db_session:
            raise HTTPException(
                status_code=404, 
                detail="Session not found."
            )
        
        messages = (
            db.query(DBMessage)
            .filter(DBMessage.session_id == db_session.id)
            .order_by(DBMessage.created_at)
            .all()
        )
        
        return messages
        
    except HTTPException:
        raise
    except Exception as e:
        _raise_internal_chat_error("list_session_messages", e)

@router.get("/messages", response_model=UserMessagesResponse)
async def list_user_messages(
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """Retrieve all messages for the current user"""
    try:
        # A finishing session should never make message history unreadable.
        if session_manager.get_session_status(current_user) == SessionStatus.ENDING:
            session_manager.remove_inactive_sessions()
        
        # Get all sessions for this user
        sessions = (
            db.query(DBSession)
            .filter(DBSession.user_id == current_user)
            .all()
        )
        
        # Get all messages from these sessions
        session_ids = [session.id for session in sessions]
        db_messages = (
            db.query(DBMessage)
            .filter(DBMessage.session_id.in_(session_ids))
            .order_by(DBMessage.created_at.desc())
            .limit(50)
            .all()
        )
        
        # Convert DB messages to MessageResponse objects
        messages = [
            MessageResponse(
                id=msg.id,
                content=msg.content,
                role=msg.role,
                created_at=msg.created_at
            ) 
            for msg in reversed(db_messages)  # Reverse to get chronological order
        ]

        return UserMessagesResponse(
            messages=messages,
            session_status=session_manager.get_session_status(current_user)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        _raise_internal_chat_error("list_user_messages", e)
