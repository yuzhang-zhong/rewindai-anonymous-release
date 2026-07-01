from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional
from uuid import uuid4

import os
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.orm import Session

from api.core.auth import get_current_user
from api.services.data_collection import record_data_collection_event
from api.services.user_profile import load_user_profile
from database.database import engine, get_db
from database.models import DBExperienceFeedback


router = APIRouter(tags=["experience"], prefix="/experience-feedback")


class ExperienceFeedbackRequest(BaseModel):
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    feedback: str = Field(..., min_length=1, max_length=3000)
    page_context: Optional[str] = Field(default=None, max_length=120)


def _feedback_dir(user_id: str) -> Path:
    return Path(os.getenv("DATA_DIR", "data")) / user_id / "experience_feedback"


def _write_file_fallback(user_id: str, payload: Dict[str, Any]) -> None:
    path = _feedback_dir(user_id)
    path.mkdir(parents=True, exist_ok=True)
    target = path / f"{payload['id']}.json"
    target.write_text(__import__("json").dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


@router.post("")
async def submit_experience_feedback(
    request: ExperienceFeedbackRequest,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    profile = load_user_profile(current_user)
    now = datetime.utcnow()
    payload = {
        "id": f"feedback-{uuid4().hex}",
        "user_id": current_user,
        "study_group": profile.get("study_group", "experiment"),
        "rating": request.rating,
        "feedback": request.feedback.strip(),
        "page_context": request.page_context or "home",
        "created_at": now.isoformat(),
    }

    try:
        DBExperienceFeedback.__table__.create(bind=engine, checkfirst=True)
        db.add(
            DBExperienceFeedback(
                id=payload["id"],
                user_id=current_user,
                study_group=payload["study_group"],
                rating=request.rating,
                feedback=payload["feedback"],
                page_context=payload["page_context"],
                created_at=now,
            )
        )
        db.commit()
        stored = "sql"
    except (OperationalError, SQLAlchemyError):
        db.rollback()
        _write_file_fallback(current_user, payload)
        stored = "file_fallback"

    record_data_collection_event(
        user_id=current_user,
        event_type="experience_feedback_submitted",
        data_category="survey_feedback",
        source="storysage_home",
        metadata={
            "stored": stored,
            "rating_present": request.rating is not None,
            "feedback_length": len(payload["feedback"]),
            "page_context": payload["page_context"],
        },
    )

    return {
        "ok": True,
        "id": payload["id"],
        "stored": stored,
    }
