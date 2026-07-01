import os
import json
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, List
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

load_dotenv()

from api.core.errors import internal_server_error, sanitize_public_error_text
from api.core.auth import get_current_user
from api.core.model_settings import get_user_model_settings
from api.services.fast_biography import (
    is_placeholder_biography_payload,
    save_fast_biography,
)
from api.services.biography_rewrite import (
    apply_biography_rewrite_preview,
    create_biography_rewrite_preview,
)
from api.services.mental_model import try_mark_mental_model_stale
from api.schemas.biography import BiographyEdit
from database.database import get_db
from database.models import DBMessage, DBSession
from content.biography.biography import Biography
from agents.biography_team.orchestrator import BiographyOrchestrator
from agents.biography_team.base_biography_agent import BiographyConfig

router = APIRouter(
    tags=["biography"],
    prefix="/biography"
)


class BiographyRewriteRequest(BaseModel):
    mode: str = Field(pattern="^(shorter|longer|more_specific)$")
    scope: str = Field(default="full", pattern="^full$")


class BiographyRewriteApplyRequest(BaseModel):
    preview_id: str

def get_latest_biography(user_id: str) -> Dict[Any, Any]:
    """Helper function to get the latest biography version for a user"""
    data_dir = os.getenv('DATA_DIR')
    if not data_dir:
        raise HTTPException(
            status_code=500,
            detail="DATA_DIR environment variable not set"
        )
    
    user_dir = os.path.join(data_dir, user_id)
    
    # Check if user directory exists
    if not os.path.exists(user_dir):
        return None
    
    # Find all biography files for the user
    bio_files = [f for f in os.listdir(user_dir) if f.startswith('biography_') and f.endswith('.json')]
    
    if not bio_files:
        return None
    
    # Extract version numbers and find the highest one
    versions = [int(f.split('_')[1].split('.')[0]) for f in bio_files]
    latest_version = max(versions)
    latest_file = f'biography_{latest_version}.json'
    
    # Read and return the latest biography
    try:
        with open(os.path.join(user_dir, latest_file), 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"get_latest_biography failed: {sanitize_public_error_text(e)}")
        raise internal_server_error()


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
        {"role": row.role, "content": row.content.strip()}
        for row in rows
        if row.content and row.content.strip()
    ]


async def _repair_placeholder_biography_if_possible(
    user_id: str,
    biography: Dict[Any, Any] | None,
    db: Session,
) -> Dict[Any, Any] | None:
    if biography and not is_placeholder_biography_payload(biography):
        return biography

    transcript = _transcript_from_db(db, user_id)
    user_turn_count = sum(1 for item in transcript if item["role"] == "User")
    if user_turn_count < 3:
        return biography

    try:
        await save_fast_biography(
            user_id,
            transcript,
            model_settings=get_user_model_settings(user_id),
        )
        repaired = get_latest_biography(user_id)
        return repaired or biography
    except Exception as exc:
        print(
            "placeholder biography repair skipped: "
            f"{sanitize_public_error_text(exc)}"
        )
        return biography

@router.get("/latest")
async def get_user_biography(
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user)
) -> Dict[Any, Any]:
    """Get the latest biography for the current user"""
    biography = get_latest_biography(current_user)
    biography = await _repair_placeholder_biography_if_possible(
        current_user,
        biography,
        db,
    )

    if biography is None:
        raise HTTPException(
            status_code=404,
            detail="No biography found for user"
        )
    
    return biography

@router.post("/edit")
async def edit_biography(
    edits: List[BiographyEdit],
    current_user: str = Depends(get_current_user)
) -> Dict[str, Any]:
    """Apply a list of edits to the user's biography"""
    
    # Load the latest biography
    bio = Biography.load_from_file(current_user)
    
    # Sort all edits by timestamp
    sorted_edits = sorted(edits, key=lambda x: x.timestamp)
    
    # Process each edit in chronological order
    for edit in sorted_edits:
        try:
            if edit.type == "RENAME":
                if not edit.data or not edit.data.newTitle:
                    raise ValueError("New title is required for RENAME operation")
                await bio.update_section(title=edit.title, new_title=edit.data.newTitle)
                await bio.save()
                
            elif edit.type == "DELETE":
                if not edit.title:
                    raise ValueError("Title is required for DELETE operation")
                await bio.delete_section(title=edit.title)
                await bio.save()
                
            elif edit.type == "CONTENT_CHANGE":
                if not edit.data or not edit.data.newContent:
                    raise ValueError("New content is required for CONTENT_CHANGE operation")
                await bio.update_section(title=edit.title, content=edit.data.newContent)
                await bio.save()
                
            elif edit.type in ["ADD", "COMMENT"]:
                # Handle AI-powered edits
                config = BiographyConfig(user_id=current_user)
                orchestrator = BiographyOrchestrator(config=config, interview_session=None)
                
                try:
                    # Load a fresh copy of biography before AI processing
                    bio = Biography.load_from_file(current_user)
                    await orchestrator.process_user_edits([edit.dict()])
                except Exception as e:
                    raise ValueError(f"Error processing AI edit: {str(e)}")
                
        except Exception as e:
            safe_type = sanitize_public_error_text(edit.type)
            safe_title = sanitize_public_error_text(edit.title)
            safe_error = sanitize_public_error_text(e)
            raise HTTPException(
                status_code=400,
                detail=f"Error processing edit {safe_type} for section '{safe_title}': {safe_error}"
            )
            
        # Reload biography after each edit to ensure we have the latest state
        bio = Biography.load_from_file(current_user)
    
    # Return the latest saved biography
    latest_bio = get_latest_biography(current_user)
    if latest_bio is None:
        raise HTTPException(
            status_code=404,
            detail="Failed to retrieve updated biography"
        )
    try_mark_mental_model_stale(
        current_user,
        reason=f"Biography edited through API with {len(edits)} edit(s).",
    )
    
    return latest_bio


@router.post("/rewrite")
async def rewrite_biography_preview(
    request: BiographyRewriteRequest,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Create an AI rewrite preview without changing the saved biography."""
    biography = get_latest_biography(current_user)
    biography = await _repair_placeholder_biography_if_possible(
        current_user,
        biography,
        db,
    )
    if biography is None:
        raise HTTPException(status_code=404, detail="No biography found for user")

    try:
        preview = await create_biography_rewrite_preview(
            current_user,
            biography,
            request.mode,  # type: ignore[arg-type]
            model_settings=get_user_model_settings(current_user),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=sanitize_public_error_text(exc)) from exc
    except Exception as exc:
        print(f"rewrite preview failed: {sanitize_public_error_text(exc)}")
        raise internal_server_error() from exc

    return {
        "success": True,
        "preview_id": preview["preview_id"],
        "mode": preview["mode"],
        "biography": preview["biography"],
        "change_summary": preview["change_summary"],
    }


@router.post("/rewrite/apply")
async def apply_biography_rewrite(
    request: BiographyRewriteApplyRequest,
    current_user: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Apply a previously generated rewrite preview as the latest biography."""
    try:
        updated = await apply_biography_rewrite_preview(
            current_user,
            request.preview_id,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Rewrite preview not found") from exc
    except (ValueError, PermissionError, TimeoutError) as exc:
        raise HTTPException(status_code=400, detail=sanitize_public_error_text(exc)) from exc
    except Exception as exc:
        print(f"rewrite apply failed: {sanitize_public_error_text(exc)}")
        raise internal_server_error() from exc

    try_mark_mental_model_stale(
        current_user,
        reason="Biography rewritten through AI preview workflow.",
    )
    return updated
