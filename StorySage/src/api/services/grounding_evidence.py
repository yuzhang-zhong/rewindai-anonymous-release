import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from api.services.biography_text import extract_biography_text
from api.services.privacy import classify_sensitive_content, sanitize_privacy_safe_text
from database.database import SessionLocal
from database.models import DBMessage, DBSession


MAX_TRANSCRIPT_MESSAGES = 80
MAX_MEMORY_ITEMS = 60


def _data_root() -> Path:
    return Path(os.getenv("DATA_DIR", "data"))


def _logs_root() -> Path:
    return Path(os.getenv("LOGS_DIR", "logs"))


def _read_json(path: Path) -> Optional[Dict[str, Any]]:
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as f:
        payload = json.load(f)
    return payload if isinstance(payload, dict) else None


def _latest_biography_path(user_id: str) -> Optional[Path]:
    user_dir = _data_root() / user_id
    if not user_dir.exists():
        return None

    bio_files = [
        p
        for p in user_dir.glob("biography_*.json")
        if p.is_file() and p.stem.split("_")[-1].isdigit()
    ]
    if not bio_files:
        return None
    return sorted(bio_files, key=lambda p: int(p.stem.split("_")[-1]))[-1]


def _load_biography_text(user_id: str) -> Optional[Dict[str, Any]]:
    latest_path = _latest_biography_path(user_id)
    if not latest_path:
        return None
    payload = _read_json(latest_path)
    if not payload:
        return None
    raw_text = extract_biography_text(payload).strip()
    if not raw_text:
        return None
    return {
        "kind": "confirmed_autobiographical_grounding",
        "status": "confirmed",
        "source_id": "privacy_safe_autobiography",
        "description": (
            "Latest StorySage biography after baseline privacy sanitization. "
            "Use this as the primary source for user-lived events, relationships, and self-narrative."
        ),
        "raw_text": raw_text,
    }


def _load_memory_bank_text(user_id: str) -> Optional[str]:
    memory_path = _logs_root() / user_id / "memory_bank_content.json"
    payload = _read_json(memory_path)
    memories = payload.get("memories") if payload else None
    if not isinstance(memories, list):
        return None

    lines: List[str] = []
    for index, memory in enumerate(memories[:MAX_MEMORY_ITEMS], start=1):
        if not isinstance(memory, dict):
            continue
        title = str(memory.get("title") or f"Memory {index}").strip()
        text = str(memory.get("text") or "").strip()
        source = str(memory.get("source_interview_response") or "").strip()
        if not text and not source:
            continue
        lines.append(
            f"{index}. {title}\n"
            f"Summary: {text}\n"
            f"Source response: {source}"
        )

    return "\n\n".join(lines).strip() or None


def _load_transcript_text(user_id: str) -> Optional[str]:
    db = SessionLocal()
    try:
        sessions = (
            db.query(DBSession)
            .filter(DBSession.user_id == user_id)
            .order_by(DBSession.created_at.desc())
            .limit(5)
            .all()
        )
        session_ids = [session.id for session in sessions]
        if not session_ids:
            return None

        messages = (
            db.query(DBMessage)
            .filter(DBMessage.session_id.in_(session_ids))
            .order_by(DBMessage.created_at.desc())
            .limit(MAX_TRANSCRIPT_MESSAGES)
            .all()
        )
    finally:
        db.close()

    lines: List[str] = []
    for message in reversed(messages):
        role = str(message.role or "Unknown").strip()
        content = str(message.content or "").strip()
        if not content or role == "Feedback":
            continue
        lines.append(f"{role}: {content}")

    return "\n".join(lines).strip() or None


def load_grounding_evidence(user_id: str) -> Dict[str, Any]:
    """Load best available user grounding for graph and mental model builders."""
    biography = _load_biography_text(user_id)
    if biography:
        raw_text = biography["raw_text"]
        return {
            **biography,
            "available": True,
            "biography_available": True,
            "raw_text": raw_text,
            "safe_text": sanitize_privacy_safe_text(raw_text),
            "privacy_signals": classify_sensitive_content(raw_text),
        }

    memory_text = _load_memory_bank_text(user_id)
    transcript_text = _load_transcript_text(user_id)
    parts = []
    if memory_text:
        parts.append("# Deferred Interview Memories\n\n" + memory_text)
    if transcript_text:
        parts.append("# Interview Transcript\n\n" + transcript_text)

    raw_text = "\n\n".join(parts).strip()
    if not raw_text:
        raise FileNotFoundError(f"No biography or interview grounding found for user: {user_id}")

    return {
        "available": True,
        "biography_available": False,
        "kind": "provisional_interview_grounding",
        "status": "provisional",
        "source_id": "privacy_safe_interview_transcript",
        "description": (
            "Recent StorySage interview transcript and deferred memories. "
            "Use as provisional grounding until a full biography is finalized."
        ),
        "raw_text": raw_text,
        "safe_text": sanitize_privacy_safe_text(raw_text),
        "privacy_signals": classify_sensitive_content(raw_text),
    }
