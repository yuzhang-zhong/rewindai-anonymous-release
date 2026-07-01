from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from database.database import get_db
from database.models import DBUser
from api.schemas.auth import LoginRequest, TokenResponse
from api.core.auth import create_access_token
from api.services.user_profile import load_user_profile

router = APIRouter(tags=["auth"])

# Password hashing - use same context as register
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

@router.post("/user/login", response_model=TokenResponse)
async def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Login to get access token"""
    # Get user from database
    user = db.query(DBUser).filter(DBUser.user_id == request.user_id).first()
    
    # Verify user exists and password matches
    if not user or not pwd_context.verify(request.password, user.password_hash):
        raise HTTPException(
            status_code=403,
            detail="Incorrect username or password."
        )
    
    profile = load_user_profile(user.user_id)
    # Carry the study group inside the token because serverless file storage is not durable.
    access_token = create_access_token(
        data={"sub": user.user_id, "study_group": profile["study_group"]}
    )
    
    return TokenResponse(
        access_token=access_token,
        user_id=user.user_id,
        study_group=profile["study_group"],
        token_type="bearer"
    )

## create user file
