"""In-memory per-user model provider settings for demo sessions.

API keys are intentionally not persisted. A backend restart clears these values.
"""

from __future__ import annotations

from dataclasses import dataclass
import os
from typing import Literal


ProviderName = Literal["openai", "google", "deepseek"]


@dataclass(frozen=True)
class UserModelSettings:
    provider: ProviderName
    model_name: str
    api_key: str


_USER_MODEL_SETTINGS: dict[str, UserModelSettings] = {}


DEFAULT_MODELS: dict[ProviderName, str] = {
    "openai": "gpt-4o-mini",
    "google": "gemini-1.5-flash",
    "deepseek": "deepseek-chat",
}

SYSTEM_MODEL_PROVIDER = "openai"
SYSTEM_MODEL_NAME = "gpt-4o"


def normalize_provider(provider: str) -> ProviderName:
    normalized = (provider or "").strip().lower()
    if normalized not in DEFAULT_MODELS:
        raise ValueError("Unsupported provider. Choose openai, google, or deepseek.")
    return normalized  # type: ignore[return-value]


def set_user_model_settings(
    user_id: str,
    provider: str,
    api_key: str,
    model_name: str | None = None,
) -> UserModelSettings:
    normalized_provider = normalize_provider(provider)
    cleaned_key = (api_key or "").strip()
    if not cleaned_key:
        raise ValueError("API key is required.")

    settings = UserModelSettings(
        provider=normalized_provider,
        model_name=(model_name or DEFAULT_MODELS[normalized_provider]).strip(),
        api_key=cleaned_key,
    )
    _USER_MODEL_SETTINGS[user_id] = settings
    return settings


def get_system_model_settings() -> UserModelSettings | None:
    api_key = (
        os.getenv("REWINDAI_OPENAI_API_KEY")
        or os.getenv("SYSTEM_OPENAI_API_KEY")
        or os.getenv("OPENAI_API_KEY")
    )
    if not api_key:
        return None

    return UserModelSettings(
        provider=SYSTEM_MODEL_PROVIDER,
        model_name=os.getenv("REWINDAI_SYSTEM_MODEL_NAME", SYSTEM_MODEL_NAME),
        api_key=api_key.strip(),
    )


def get_user_model_settings(user_id: str) -> UserModelSettings | None:
    system_settings = get_system_model_settings()
    if system_settings:
        return system_settings
    return _USER_MODEL_SETTINGS.get(user_id)


def clear_user_model_settings(user_id: str) -> None:
    _USER_MODEL_SETTINGS.pop(user_id, None)


def public_model_settings_status(user_id: str) -> dict:
    system_settings = get_system_model_settings()
    if system_settings:
        return {
            "configured": True,
            "provider": system_settings.provider,
            "model_name": system_settings.model_name,
            "source": "system",
        }

    settings = get_user_model_settings(user_id)
    if not settings:
        return {
            "configured": False,
            "provider": None,
            "model_name": None,
            "source": None,
        }
    return {
        "configured": True,
        "provider": settings.provider,
        "model_name": settings.model_name,
        "source": "session",
    }
