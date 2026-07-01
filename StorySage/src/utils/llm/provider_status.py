"""Non-secret LLM provider configuration status for health checks."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from utils.llm.gcp_credentials import resolve_gcp_credentials_path
from utils.llm.models.claude import claude_vertex_model_mapping
from utils.llm.models.deepseek import deepseek_models
from utils.llm.models.gemini import gemini_models


def _has_value(name: str) -> bool:
    value = os.getenv(name)
    return bool(value and value.strip())


def _credential_basename(raw_path: str | None) -> str | None:
    if not raw_path:
        return None
    return Path(raw_path.strip().strip('"').strip("'")).name or None


def _provider_for_model(model_name: str) -> str:
    normalized = model_name.lower()
    if model_name in claude_vertex_model_mapping or "claude" in normalized:
        return "vertex_claude"
    if model_name in gemini_models or "gemini" in normalized:
        return "vertex_gemini"
    if model_name in deepseek_models or "deepseek" in normalized:
        return "together_deepseek"
    if model_name.startswith("meta-llama/"):
        return "together"
    if normalized.startswith("gpt-") or normalized.startswith("o"):
        return "openai"
    return "unknown"


def get_llm_provider_status() -> dict[str, Any]:
    """Return non-secret model/provider setup status for `/health`."""
    model_name = os.getenv("MODEL_NAME", "gpt-4o")
    provider = _provider_for_model(model_name)
    status: dict[str, Any] = {
        "model_name": model_name,
        "provider": provider,
        "configured": False,
        "missing": [],
    }

    if provider in {"vertex_claude", "vertex_gemini"}:
        credentials_path = os.getenv("GCP_CREDENTIALS")
        resolved_credentials = resolve_gcp_credentials_path(credentials_path)
        missing = [
            name for name in ("GCP_PROJECT", "GCP_REGION", "GCP_CREDENTIALS")
            if not _has_value(name)
        ]
        if credentials_path and not resolved_credentials:
            missing.append("GCP_CREDENTIALS_RESOLVED")

        status.update({
            "configured": not missing,
            "missing": missing,
            "gcp": {
                "project_configured": _has_value("GCP_PROJECT"),
                "region_configured": _has_value("GCP_REGION"),
                "credentials_configured": _has_value("GCP_CREDENTIALS"),
                "credentials_resolved": resolved_credentials is not None,
                "credentials_basename": _credential_basename(credentials_path),
            },
        })
        return status

    if provider == "openai":
        missing = [] if _has_value("OPENAI_API_KEY") else ["OPENAI_API_KEY"]
        status.update({"configured": not missing, "missing": missing})
        return status

    if provider in {"together", "together_deepseek"}:
        missing = [] if _has_value("TOGETHER_API_KEY") else ["TOGETHER_API_KEY"]
        status.update({"configured": not missing, "missing": missing})
        return status

    status["missing"] = ["SUPPORTED_MODEL_NAME"]
    return status
