from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from database.setup_db import SQLALCHEMY_DATABASE_URL
from database.setup_db import setup_database
from api.core.auth import get_jwt_secret_status
from api.core.runtime_config import get_cors_origins, get_runtime_status, validate_runtime_or_raise
from utils.llm.provider_status import get_llm_provider_status
from api.routers import (
    admin,
    auth,
    biography,
    chat,
    experience_feedback,
    formulation,
    graph_public,
    model_settings,
    register,
    simulation_profile,
    user_profile,
)

app = FastAPI(title="AI Autobiography API")


@app.get("/")
async def root():
    """Friendly backend root so opening the API domain is not a 404."""
    return {
        "ok": True,
        "service": "storysage-backend",
        "frontend": os.getenv("PUBLIC_FRONTEND_URL", "http://127.0.0.1:5173"),
        "health": "/health",
    }


@app.get("/health")
async def health_check():
    """Lightweight service health check for local orchestration."""
    return {
        "ok": True,
        "service": "storysage-backend",
        "auth": {
            "jwt_secret": get_jwt_secret_status(),
        },
        "providers": {
            "llm": get_llm_provider_status(),
        },
        "runtime": get_runtime_status(),
    }

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def ensure_cors_on_error_responses(request, call_next):
    """Vercel can surface validation/runtime failures without CORS headers."""
    response = await call_next(request)
    origin = request.headers.get("origin")
    allowed_origins = set(get_cors_origins())
    if origin and ("*" in allowed_origins or origin.rstrip("/") in allowed_origins):
        response.headers.setdefault("Access-Control-Allow-Origin", origin)
        response.headers.setdefault("Vary", "Origin")
    return response

@app.on_event("startup")
async def startup_event():
    """Prepare local state and fail fast on unsafe production config."""
    if os.getenv("STORYSAGE_AUTO_SETUP_DB", "false").lower() in {"1", "true", "yes", "on"}:
        setup_database(reset=False)

    validate_runtime_or_raise()

    if SQLALCHEMY_DATABASE_URL.startswith('sqlite:///'):
        db_path = SQLALCHEMY_DATABASE_URL.replace('sqlite:///', '')
        if not os.path.exists(db_path):
            raise Exception(
                "Database not found! Please run 'python src/main.py --mode setup_db' "
                "to initialize the database."
            )

# Include routers
app.include_router(chat.router)
app.include_router(experience_feedback.router)
app.include_router(admin.router)
app.include_router(auth.router)
app.include_router(biography.router)
app.include_router(register.router)
app.include_router(model_settings.router)
app.include_router(graph_public.router)
app.include_router(simulation_profile.router)
app.include_router(formulation.router)
app.include_router(user_profile.router)
