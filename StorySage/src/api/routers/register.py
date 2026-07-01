from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from database.database import get_db
from database.models import DBUser
from api.schemas.auth import RegisterRequest, RegisterResponse
from api.core.auth import create_access_token
from api.core.errors import internal_server_error, sanitize_public_error_text
from api.services.data_collection import record_data_collection_event
from api.services.user_profile import save_user_profile

router = APIRouter(tags=["register"])

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

@router.post("/user/register", response_model=RegisterResponse)
async def register_user(request: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user"""
    try:
        # Check if user already exists
        existing_user = db.query(DBUser).filter(DBUser.user_id == request.user_id).first()
        if existing_user:
            raise HTTPException(
                status_code=400,
                detail="User ID already registered. Please login instead."
            )
            
        
        # Hash the password
        hashed_password = pwd_context.hash(request.password)
        
        # Create new user
        new_user = DBUser(
            user_id=request.user_id,
            password_hash=hashed_password
        )
        
        # Add to database
        db.add(new_user)
        db.commit()
        profile = save_user_profile(request.user_id, request.study_group)
        record_data_collection_event(
            user_id=request.user_id,
            event_type="participant_registered",
            data_category="participant_profile",
            source="storysage_register",
            metadata={
                "study_group": profile["study_group"],
                "consent_status": "implicit_demo_account",
                "demographic_optional": False,
            },
        )
        
        # Generate access token
        access_token = create_access_token(
            data={"sub": request.user_id, "study_group": profile["study_group"]}
        )
        
        return RegisterResponse(
            message="User registered successfully",
            user_id=request.user_id,
            study_group=profile["study_group"],
            access_token=access_token,
            token_type="bearer",
        )
        
    except Exception as e:
        db.rollback()
        if isinstance(e, HTTPException):
            raise e
        print(f"register_user failed: {sanitize_public_error_text(e)}")
        raise internal_server_error()
