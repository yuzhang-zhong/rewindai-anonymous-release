from datetime import datetime
from typing import Any, Dict, Optional
from uuid import uuid4

from sqlalchemy.exc import OperationalError, SQLAlchemyError

from api.services.user_profile import load_user_profile
from database.database import SessionLocal, engine
from database.models import DBDataCollectionEvent


def record_data_collection_event(
    *,
    user_id: str,
    event_type: str,
    data_category: str,
    source: Optional[str] = None,
    session_id: Optional[str] = None,
    count: int = 1,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    """Record compact admin-only collection metadata without duplicating raw user content."""
    db = SessionLocal()
    try:
        profile = load_user_profile(user_id)
        DBDataCollectionEvent.__table__.create(bind=engine, checkfirst=True)
        db.add(
            DBDataCollectionEvent(
                id=f"collection-{uuid4().hex}",
                user_id=user_id,
                study_group=profile.get("study_group", "experiment"),
                event_type=event_type,
                data_category=data_category,
                source=source,
                session_id=session_id,
                count=max(0, int(count or 0)),
                metadata_json=metadata or {},
                created_at=datetime.utcnow(),
            )
        )
        db.commit()
    except (OperationalError, SQLAlchemyError) as exc:
        db.rollback()
        print(f"data collection event persistence failed: {exc.__class__.__name__}")
    finally:
        db.close()
