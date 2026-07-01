from datetime import datetime
import json
import os
from pathlib import Path
import uuid

from fastapi import APIRouter, Body, Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import func
from sqlalchemy.orm import Session

from api.core.auth import get_payload_from_token
from api.services.user_profile import load_user_profile, normalize_study_group
from database.database import get_db
from database.models import DBMessage, DBSession, DBUser, DBUserProfile


router = APIRouter(tags=["user-profile"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="user/login")


def _safe_text(value: object, limit: int = 4000) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.split()).strip()[:limit]


def _normalize_section(section: dict, fallback_title: str) -> dict:
    now = datetime.utcnow().isoformat()
    title = _safe_text(section.get("title"), 180) or fallback_title
    subsections = section.get("subsections")
    if not isinstance(subsections, dict):
        subsections = {}
    return {
        "id": _safe_text(section.get("id"), 120) or str(uuid.uuid4()),
        "title": title,
        "content": _safe_text(section.get("content"), 12000),
        "created_at": _safe_text(section.get("created_at"), 80) or now,
        "last_edit": _safe_text(section.get("last_edit"), 80) or now,
        "memory_ids": section.get("memory_ids") if isinstance(section.get("memory_ids"), list) else [],
        "subsections": {
            _safe_text(key, 180) or f"{index + 1} Section": _normalize_section(value if isinstance(value, dict) else {}, _safe_text(key, 180) or f"{index + 1} Section")
            for index, (key, value) in enumerate(subsections.items())
        },
    }


def _has_biography_content(payload: dict | None) -> bool:
    if not isinstance(payload, dict):
        return False
    if _safe_text(payload.get("content")):
        return True
    subsections = payload.get("subsections")
    return isinstance(subsections, dict) and len(subsections) > 0


def _latest_biography_payload(user_dir: Path) -> dict | None:
    files = sorted(user_dir.glob("biography_*.json"))
    for path in reversed(files):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if _has_biography_content(payload):
            return payload
    return None


def _next_biography_path(user_dir: Path) -> Path:
    versions = []
    for path in user_dir.glob("biography_*.json"):
        try:
            versions.append(int(path.stem.split("_", 1)[1]))
        except Exception:
            continue
    return user_dir / f"biography_{(max(versions) if versions else 0) + 1}.json"


def _build_biography_from_messages(user_id: str, messages: list[dict]) -> dict | None:
    user_messages = [
        _safe_text(item.get("content"), 1200)
        for item in messages
        if isinstance(item, dict) and item.get("role") == "User" and _safe_text(item.get("content"))
    ][-8:]
    if not user_messages:
        return None

    now = datetime.utcnow().isoformat()
    transcript = "\n".join(f"{index + 1}. {content}" for index, content in enumerate(user_messages))
    return {
        "id": str(uuid.uuid4()),
        "title": f"Biography of {user_id}",
        "content": "",
        "created_at": now,
        "last_edit": now,
        "memory_ids": [],
        "subsections": {
            "1 Interview-Based Draft": {
                "id": str(uuid.uuid4()),
                "title": "1 Interview-Based Draft",
                "content": (
                    "This editable draft was restored from the browser because "
                    "the online demo backend may switch serverless instances.\n\n"
                    f"{transcript}"
                ),
                "created_at": now,
                "last_edit": now,
                "memory_ids": [],
                "subsections": {},
            },
            "2 Emerging Decision Themes": {
                "id": str(uuid.uuid4()),
                "title": "2 Emerging Decision Themes",
                "content": (
                    "Early signals from the interview suggest focusing on concrete "
                    "turning points, trade-offs, relationships, and the conditions "
                    "that changed the user's decisions."
                ),
                "created_at": now,
                "last_edit": now,
                "memory_ids": [],
                "subsections": {},
            },
        },
    }


def _normalize_biography(user_id: str, biography: dict) -> dict:
    now = datetime.utcnow().isoformat()
    root = _normalize_section(biography, f"Biography of {user_id}")
    root["title"] = _safe_text(biography.get("title"), 180) or f"Biography of {user_id}"
    root["created_at"] = _safe_text(biography.get("created_at"), 80) or now
    root["last_edit"] = _safe_text(biography.get("last_edit"), 80) or now
    return root


def _parse_datetime(value: object) -> datetime:
    if not isinstance(value, str):
        return datetime.utcnow()
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return datetime.utcnow()


def _ensure_user(db: Session, user_id: str) -> bool:
    existing = db.query(DBUser).filter(DBUser.user_id == user_id).first()
    if existing:
        return False
    db.add(DBUser(user_id=user_id, password_hash="restored-from-browser-evidence"))
    return True


def _ensure_profile(db: Session, user_id: str, study_group: str) -> bool:
    normalized_group = normalize_study_group(study_group)
    existing = db.query(DBUserProfile).filter(DBUserProfile.user_id == user_id).first()
    if existing:
        if existing.study_group != normalized_group:
            existing.study_group = normalized_group
            existing.updated_at = datetime.utcnow()
            return True
        return False
    db.add(DBUserProfile(user_id=user_id, study_group=normalized_group))
    return True


def _restore_messages(db: Session, user_id: str, messages: list[dict]) -> int:
    normalized_messages: list[dict] = []
    for item in messages[-120:]:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = _safe_text(item.get("content"), 6000)
        if role not in {"User", "Interviewer"} or not content:
            continue
        normalized_messages.append({
            "id": _safe_text(item.get("id"), 180),
            "role": role,
            "content": content,
            "created_at": _parse_datetime(item.get("created_at")),
        })

    if not normalized_messages:
        return 0

    existing_pairs = {
        (message.role, _safe_text(message.content, 6000))
        for message in (
            db.query(DBMessage)
            .join(DBSession, DBMessage.session_id == DBSession.id)
            .filter(DBSession.user_id == user_id)
            .all()
        )
    }
    to_restore = [
        item for item in normalized_messages
        if (item["role"], item["content"]) not in existing_pairs
    ]
    if not to_restore:
        return 0

    next_seq_id = (
        db.query(func.max(DBSession.seq_id))
        .filter(DBSession.user_id == user_id)
        .scalar()
        or 0
    ) + 1
    session = DBSession(
        id=f"restored-{uuid.uuid4()}",
        seq_id=next_seq_id,
        user_id=user_id,
        created_at=min(item["created_at"] for item in to_restore),
    )
    db.add(session)
    db.flush()

    restored = 0
    for item in to_restore:
        candidate_id = item["id"] if item["id"] and not db.query(DBMessage).filter(DBMessage.id == item["id"]).first() else str(uuid.uuid4())
        db.add(DBMessage(
            id=candidate_id,
            session_id=session.id,
            content=item["content"],
            role=item["role"],
            created_at=item["created_at"],
        ))
        restored += 1
    return restored


@router.get("/user/profile")
async def get_user_profile(token: str = Depends(oauth2_scheme)):
    payload = get_payload_from_token(token)
    user_id = payload.get("sub", "")
    token_group = payload.get("study_group")
    if token_group:
      return {
          "user_id": user_id,
          "study_group": normalize_study_group(token_group),
      }
    return load_user_profile(user_id)


@router.post("/user/evidence-sync")
async def sync_user_evidence(
    payload: dict | None = Body(default=None),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Restore same-browser demo evidence into the current serverless instance."""
    token_payload = get_payload_from_token(token)
    user_id = token_payload.get("sub", "")
    if not user_id:
        return {"status": "ignored", "reason": "missing user"}

    payload = payload or {}
    study_group = normalize_study_group(token_payload.get("study_group"))
    user_restored = _ensure_user(db, user_id)
    profile_restored = _ensure_profile(db, user_id, study_group)
    messages = payload.get("messages") if isinstance(payload.get("messages"), list) else []
    messages_restored = _restore_messages(db, user_id, messages)
    db.commit()

    data_dir = Path(os.getenv("DATA_DIR", "data"))
    user_dir = data_dir / user_id
    user_dir.mkdir(parents=True, exist_ok=True)

    existing = _latest_biography_payload(user_dir)
    if existing:
        return {
            "status": "ok",
            "created": False,
            "biography_available": True,
            "user_restored": user_restored,
            "profile_restored": profile_restored,
            "messages_restored": messages_restored,
            "message": "Biography already exists on this instance.",
        }

    biography = payload.get("biography") if isinstance(payload.get("biography"), dict) else None
    candidate = biography if _has_biography_content(biography) else _build_biography_from_messages(user_id, messages)

    if not candidate:
        return {
            "status": "ok",
            "created": False,
            "biography_available": False,
            "user_restored": user_restored,
            "profile_restored": profile_restored,
            "messages_restored": messages_restored,
            "message": "No local evidence to sync.",
        }

    normalized = _normalize_biography(user_id, candidate)
    path = _next_biography_path(user_dir)
    path.write_text(json.dumps(normalized, indent=2, ensure_ascii=False), encoding="utf-8")
    return {
        "status": "ok",
        "created": True,
        "biography_available": True,
        "user_restored": user_restored,
        "profile_restored": profile_restored,
        "messages_restored": messages_restored,
        "sections": len(normalized.get("subsections", {})),
    }
