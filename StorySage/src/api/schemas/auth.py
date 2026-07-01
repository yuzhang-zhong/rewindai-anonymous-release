from pydantic import BaseModel
from typing import Literal

class LoginRequest(BaseModel):
    """Request model for user login"""
    user_id: str
    password: str

class TokenResponse(BaseModel):
    """Response model for successful login"""
    access_token: str
    token_type: str = "bearer"
    user_id: str | None = None
    study_group: str | None = None

class RegisterRequest(BaseModel):
    user_id: str
    password: str
    study_group: Literal["blank", "contrast", "experiment", "anonymous"] = "experiment"

class RegisterResponse(BaseModel):
    message: str
    user_id: str
    study_group: str = "experiment"
    access_token: str
    token_type: str = "bearer"
