"""Public-safe API error helpers."""

import re
from fastapi import HTTPException


_SECRET_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9_/\-+=]{8,}"),
    re.compile(r"AIza[A-Za-z0-9_-]{20,}"),
    re.compile(
        r"(?i)\b(api[_-]?key|token|secret|password|authorization|bearer)\b"
        r"\s*[:=]\s*['\"]?[^'\"\s,;]+"
    ),
]
_WINDOWS_PATH_PATTERN = re.compile(r"[A-Za-z]:\\[^\s\"']+")
_UNIX_PATH_PATTERN = re.compile(r"(?<!\w)/(?:[^/\s\"']+/){2,}[^/\s\"']+")


def sanitize_public_error_text(value: object) -> str:
    """Return a bounded, credential-safe error summary for logs."""
    text = str(value or "").strip()
    if not text:
        return "unavailable"

    for pattern in _SECRET_PATTERNS:
        text = pattern.sub("[REDACTED_SECRET]", text)
    text = _WINDOWS_PATH_PATTERN.sub("[REDACTED_PATH]", text)
    text = _UNIX_PATH_PATTERN.sub("[REDACTED_PATH]", text)
    text = re.sub(
        r"(?i)traceback \(most recent call last\):.*",
        "traceback redacted",
        text,
        flags=re.S,
    )
    text = " ".join(text.split())
    if len(text) > 220:
        text = text[:217].rstrip() + "..."
    return text or "unavailable"


def internal_server_error() -> HTTPException:
    """Create a stable 500 response that does not expose implementation details."""
    return HTTPException(
        status_code=500,
        detail="Internal server error. Please try again.",
    )
