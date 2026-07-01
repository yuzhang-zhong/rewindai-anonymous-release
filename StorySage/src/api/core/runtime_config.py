"""Production startup checks for deployable StorySage backends."""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse

from api.core.auth import get_jwt_secret_status
from utils.llm.provider_status import get_llm_provider_status


LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
WILDCARD_ORIGINS = {"*", "all"}


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def is_production_runtime() -> bool:
    explicit = os.getenv("STORYSAGE_ENV") or os.getenv("ENVIRONMENT") or os.getenv("APP_ENV")
    if explicit and explicit.strip().lower() in {"prod", "production"}:
        return True

    return any(os.getenv(name) for name in ("RENDER", "RAILWAY_ENVIRONMENT", "FLY_APP_NAME"))


def _is_local_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
    except Exception:
        return False
    return parsed.hostname in LOCAL_HOSTS


def get_cors_origins() -> list[str]:
    """Return configured CORS origins; local dev keeps the old permissive default."""
    raw = os.getenv("STORYSAGE_CORS_ORIGINS", "").strip()
    if not raw:
        return ["*"]
    return [item.strip().rstrip("/") for item in raw.split(",") if item.strip()]


def _cors_is_wildcard(origins: list[str]) -> bool:
    return any(origin.strip().lower() in WILDCARD_ORIGINS for origin in origins)


def _ensure_writable_dir(path_value: str | None, fallback: str, label: str) -> tuple[bool, str]:
    path = Path(path_value or fallback)
    try:
        path.mkdir(parents=True, exist_ok=True)
        probe = path / ".storysage-write-check"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        return True, str(path)
    except Exception as exc:
        return False, f"{label} is not writable: {exc.__class__.__name__}"


def get_runtime_status() -> dict:
    production = is_production_runtime()
    errors: list[str] = []
    warnings: list[str] = []
    go_live_blockers: list[str] = []

    jwt_status = get_jwt_secret_status()
    if production and jwt_status.get("using_development_fallback"):
        errors.append("STORYSAGE_JWT_SECRET must be set to a non-development value.")

    llm_status = get_llm_provider_status()
    if production and not llm_status.get("configured"):
        missing = ", ".join(llm_status.get("missing") or ["provider credentials"])
        errors.append(f"LLM provider is not fully configured: {missing}.")

    data_ok, data_detail = _ensure_writable_dir(os.getenv("DATA_DIR"), "data", "DATA_DIR")
    logs_ok, logs_detail = _ensure_writable_dir(os.getenv("LOGS_DIR"), "logs", "LOGS_DIR")
    if not data_ok:
        errors.append(data_detail)
    if not logs_ok:
        errors.append(logs_detail)

    database_url = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or "sqlite:///./data/interview_app.db"
    if database_url.startswith("sqlite:////tmp/") and os.getenv("POSTGRES_URL"):
        database_url = os.getenv("POSTGRES_URL", database_url)
    if production and database_url.startswith("sqlite:///"):
        db_path = database_url.replace("sqlite:///", "", 1)
        db_parent = Path(db_path).parent
        if str(db_parent).startswith("/tmp"):
            message = "DATABASE_URL uses SQLite in /tmp; records are ephemeral across serverless instances. Configure an external Postgres DATABASE_URL before collecting real participants."
            warnings.append(message)
            go_live_blockers.append(message)
        elif not db_parent.is_absolute():
            message = "DATABASE_URL uses relative SQLite; ensure the container workdir has persistent storage mounted."
            warnings.append(message)
            go_live_blockers.append(message)
        else:
            message = "DATABASE_URL uses SQLite in production; use external Postgres for durable multi-user records."
            warnings.append(message)
            go_live_blockers.append(message)

    graph_sync_enabled = _truthy(os.getenv("MIROFISH_GRAPH_SYNC_ENABLED", "true"))
    mirofish_base_url = os.getenv("MIROFISH_BASE_URL", "http://localhost:5001")
    if production and graph_sync_enabled and _is_local_url(mirofish_base_url):
        errors.append("MIROFISH_BASE_URL must point to a reachable non-local MiroFish backend when graph sync is enabled.")

    cors_origins = get_cors_origins()
    if production and _cors_is_wildcard(cors_origins):
        errors.append("STORYSAGE_CORS_ORIGINS must list explicit public frontend origins in production.")

    return {
        "production": production,
        "configured": len(errors) == 0,
        "go_live_ready": len(errors) == 0 and len(go_live_blockers) == 0,
        "go_live_blockers": go_live_blockers,
        "errors": errors,
        "warnings": warnings,
        "storage": {
            "data_dir_writable": data_ok,
            "logs_dir_writable": logs_ok,
            "data_dir": data_detail if data_ok else None,
            "logs_dir": logs_detail if logs_ok else None,
        },
        "database": {
            "url_configured": bool(database_url),
            "sqlite": database_url.startswith("sqlite:///"),
        },
        "mirofish": {
            "graph_sync_enabled": graph_sync_enabled,
            "base_url_configured": bool(mirofish_base_url),
            "base_url_is_local": _is_local_url(mirofish_base_url),
        },
        "cors": {
            "origins_configured": bool(cors_origins),
            "wildcard": _cors_is_wildcard(cors_origins),
            "origin_count": len(cors_origins),
        },
    }


def validate_runtime_or_raise() -> None:
    status = get_runtime_status()
    if status["production"] and not status["configured"]:
        raise RuntimeError("StorySage production runtime is not configured: " + "; ".join(status["errors"]))
