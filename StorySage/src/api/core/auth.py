import os
from datetime import datetime, timedelta
import jwt
from jwt import InvalidTokenError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

DEVELOPMENT_JWT_SECRETS = {"secret-key-here", "change-me-in-production"}
SECRET_KEY_SOURCE = (
    "STORYSAGE_JWT_SECRET"
    if os.getenv("STORYSAGE_JWT_SECRET")
    else "SECRET_KEY"
    if os.getenv("SECRET_KEY")
    else "development_fallback"
)
SECRET_KEY = os.getenv("STORYSAGE_JWT_SECRET") or os.getenv("SECRET_KEY") or "secret-key-here"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080")) # 1 week

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="user/login")

def _resolve_jwt_secret() -> tuple[str, str]:
    if os.getenv("STORYSAGE_JWT_SECRET"):
        return os.getenv("STORYSAGE_JWT_SECRET", ""), "STORYSAGE_JWT_SECRET"
    if os.getenv("SECRET_KEY"):
        return os.getenv("SECRET_KEY", ""), "SECRET_KEY"
    return "secret-key-here", "development_fallback"


def _access_token_expire_minutes() -> int:
    try:
        return int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(ACCESS_TOKEN_EXPIRE_MINUTES)))
    except ValueError:
        return ACCESS_TOKEN_EXPIRE_MINUTES


def get_jwt_secret_status() -> dict:
    secret_key, secret_source = _resolve_jwt_secret()
    using_development_fallback = (
        secret_source == "development_fallback"
        or secret_key in DEVELOPMENT_JWT_SECRETS
    )
    return {
        "configured": not using_development_fallback,
        "source": secret_source,
        "using_development_fallback": using_development_fallback,
        "warning": (
            "Set STORYSAGE_JWT_SECRET to a long random value before using shared or deployed environments."
            if using_development_fallback
            else None
        ),
    }

def create_access_token(data: dict):
    to_encode = data.copy()
    secret_key, _ = _resolve_jwt_secret()
    expire = datetime.utcnow() + timedelta(minutes=_access_token_expire_minutes())
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, secret_key, algorithm=ALGORITHM)
    return encoded_jwt

def create_scoped_token(user_id: str, scope: str, expires_delta: timedelta) -> str:
    secret_key, _ = _resolve_jwt_secret()
    to_encode = {
        "sub": user_id,
        "scope": scope,
        "exp": datetime.utcnow() + expires_delta,
    }
    return jwt.encode(to_encode, secret_key, algorithm=ALGORITHM)

def get_user_from_token(token: str, required_scope: str | None = None) -> str:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        secret_key, _ = _resolve_jwt_secret()
        payload = jwt.decode(token, secret_key, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub", "")
        if not user_id:
            raise credentials_exception
        if required_scope is not None and payload.get("scope") != required_scope:
            raise credentials_exception
        return user_id
    except InvalidTokenError:
        raise credentials_exception

def get_payload_from_token(token: str, required_scope: str | None = None) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        secret_key, _ = _resolve_jwt_secret()
        payload = jwt.decode(token, secret_key, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub", "")
        if not user_id:
            raise credentials_exception
        if required_scope is not None and payload.get("scope") != required_scope:
            raise credentials_exception
        return payload
    except InvalidTokenError:
        raise credentials_exception

async def get_current_user(token: str = Depends(oauth2_scheme)) -> str:
    return get_user_from_token(token)
