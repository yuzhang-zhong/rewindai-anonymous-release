from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Dict, Literal

from sqlalchemy.exc import OperationalError, SQLAlchemyError

from database.database import SessionLocal
from database.models import DBUserProfile


StudyGroup = Literal["blank", "contrast", "experiment", "anonymous"]
DEFAULT_STUDY_GROUP: StudyGroup = "experiment"
VALID_STUDY_GROUPS = {"blank", "contrast", "experiment", "anonymous"}


def _is_missing_table_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "no such table" in message or "does not exist" in message


def _data_root() -> Path:
    return Path(os.getenv("DATA_DIR", "data"))


def _profile_file(user_id: str) -> Path:
    return _data_root() / user_id / "profile.json"


def normalize_study_group(value: str | None) -> StudyGroup:
    normalized = (value or DEFAULT_STUDY_GROUP).strip().lower()
    if normalized not in VALID_STUDY_GROUPS:
        return DEFAULT_STUDY_GROUP
    return normalized  # type: ignore[return-value]


def save_user_profile(user_id: str, study_group: str | None = None) -> Dict[str, str]:
    profile = {
        "user_id": user_id,
        "study_group": normalize_study_group(study_group),
    }
    path = _profile_file(user_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(profile, f, ensure_ascii=False, indent=2)
    _save_profile_to_db(profile)
    return profile


def load_user_profile(user_id: str) -> Dict[str, str]:
    db_profile = _load_profile_from_db(user_id)
    if db_profile:
        return db_profile

    path = _profile_file(user_id)
    if not path.exists():
        return save_user_profile(user_id, DEFAULT_STUDY_GROUP)
    try:
        with path.open("r", encoding="utf-8") as f:
            raw = json.load(f)
    except Exception:
        return save_user_profile(user_id, DEFAULT_STUDY_GROUP)

    study_group = normalize_study_group(raw.get("study_group"))
    profile = {
        "user_id": user_id,
        "study_group": study_group,
    }
    _save_profile_to_db(profile)
    return profile


def _save_profile_to_db(profile: Dict[str, str]) -> None:
    db = SessionLocal()
    try:
        existing = (
            db.query(DBUserProfile)
            .filter(DBUserProfile.user_id == profile["user_id"])
            .first()
        )
        if existing:
            existing.study_group = profile["study_group"]
        else:
            db.add(
                DBUserProfile(
                    user_id=profile["user_id"],
                    study_group=profile["study_group"],
                )
            )
        db.commit()
    except OperationalError as exc:
        db.rollback()
        if not _is_missing_table_error(exc):
            print(f"user profile SQL persistence failed: {exc.__class__.__name__}")
    except SQLAlchemyError as exc:
        db.rollback()
        print(f"user profile SQL persistence failed: {exc.__class__.__name__}")
    finally:
        db.close()


def _load_profile_from_db(user_id: str) -> Dict[str, str] | None:
    db = SessionLocal()
    try:
        profile = (
            db.query(DBUserProfile)
            .filter(DBUserProfile.user_id == user_id)
            .first()
        )
        if not profile:
            return None
        return {
            "user_id": user_id,
            "study_group": normalize_study_group(profile.study_group),
        }
    except OperationalError as exc:
        if not _is_missing_table_error(exc):
            print(f"user profile SQL load failed: {exc.__class__.__name__}")
        return None
    except SQLAlchemyError as exc:
        print(f"user profile SQL load failed: {exc.__class__.__name__}")
        return None
    finally:
        db.close()
