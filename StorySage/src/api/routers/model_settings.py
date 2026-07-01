from fastapi import APIRouter, Depends, HTTPException

from api.core.auth import get_current_user
from api.core.model_settings import (
    clear_user_model_settings,
    public_model_settings_status,
)


router = APIRouter(tags=["model-settings"])


@router.get("/model-settings")
async def get_model_settings(current_user: str = Depends(get_current_user)):
    return public_model_settings_status(current_user)


@router.post("/model-settings/validate")
async def validate_model_settings(
    current_user: str = Depends(get_current_user),
):
    status = public_model_settings_status(current_user)
    if status.get("configured"):
        return status
    raise HTTPException(
        status_code=503,
        detail="System model is not configured. Please set REWINDAI_OPENAI_API_KEY on the backend.",
    )


@router.delete("/model-settings")
async def delete_model_settings(current_user: str = Depends(get_current_user)):
    clear_user_model_settings(current_user)
    return public_model_settings_status(current_user)
