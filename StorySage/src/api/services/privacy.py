import json
import re
from typing import Any, Dict, List


PRIVACY_SAFE_GROUNDING_POLICY = (
    "This payload is generalized for decision simulation and graph construction. "
    "Direct contact details, exact addresses, and unnecessary identifying details "
    "should not be stored in generated artifacts."
)


_SENSITIVE_PATTERNS = [
    {
        "category": "direct_contact",
        "severity": "high",
        "recommendation": "Omit direct contact details from memory, graph, simulation, and exports.",
        "pattern": re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"),
    },
    {
        "category": "direct_contact",
        "severity": "high",
        "recommendation": "Omit direct contact details from memory, graph, simulation, and exports.",
        "pattern": re.compile(r"\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b"),
    },
    {
        "category": "credential_or_secret",
        "severity": "high",
        "recommendation": "Omit API keys, tokens, and provider credentials from memory, graph, simulation, and exports.",
        "pattern": re.compile(
            r"(?:sk-[A-Za-z0-9_/\-+=]{8,}|AIza[A-Za-z0-9_-]{20,}|\b(?:api[_-]?key|token|secret)\s*[:=]\s*[A-Za-z0-9_/\-+=]{8,})",
            re.IGNORECASE,
        ),
    },
    {
        "category": "exact_address",
        "severity": "high",
        "recommendation": "Generalize exact addresses to local place roles unless the street itself is decision-relevant.",
        "pattern": re.compile(
            r"\b\d{1,5}\s+[A-Z][A-Za-z0-9'.-]*(?:\s+[A-Z][A-Za-z0-9'.-]*)*\s+"
            r"(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way)\b"
        ),
    },
    {
        "category": "local_place_reference",
        "severity": "medium",
        "recommendation": "Replace identifiable street references with local place roles unless the street name is essential.",
        "pattern": re.compile(
            r"\b(?:on|at|near|around|from|by)\s+"
            r"[A-Z][A-Za-z0-9'.-]*(?:\s+[A-Z][A-Za-z0-9'.-]*)*\s+"
            r"(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way)\b"
        ),
    },
    {
        "category": "exact_age",
        "severity": "medium",
        "recommendation": "Use a life-stage phrase when exact age is not necessary for the decision model.",
        "pattern": re.compile(r"\b(?:I am \d{1,2} years old|at age \d{1,2})\b", re.IGNORECASE),
    },
    {
        "category": "named_authority_or_private_person",
        "severity": "medium",
        "recommendation": "Prefer relationship roles such as advisor, mentor, family member, or friend when names are not needed.",
        "pattern": re.compile(
            r"\b(?:Dr\.|Professor|Prof\.|Mr\.|Mrs\.|Ms\.)\s+[A-Z][A-Za-z'.-]+\b"
        ),
    },
]

_SEVERITY_ORDER = {
    "none": 0,
    "low": 1,
    "medium": 2,
    "high": 3,
}


def sanitize_privacy_safe_text(text: str) -> str:
    """Remove high-risk identifiers while preserving decision-relevant meaning."""
    safe = text
    safe = re.sub(r"[\w.+-]+@[\w-]+\.[\w.-]+", "[email omitted]", safe)
    safe = re.sub(
        r"\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b",
        "[phone omitted]",
        safe,
    )
    safe = re.sub(
        r"(?:sk-[A-Za-z0-9_/\-+=]{8,}|AIza[A-Za-z0-9_-]{20,}|\b(?:api[_-]?key|token|secret)\s*[:=]\s*[A-Za-z0-9_/\-+=]{8,})",
        "[credential omitted]",
        safe,
        flags=re.IGNORECASE,
    )
    safe = re.sub(
        r"\b\d{1,5}\s+[A-Z][A-Za-z0-9'.-]*(?:\s+[A-Z][A-Za-z0-9'.-]*)*\s+"
        r"(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way)\b",
        "a specific local address",
        safe,
    )
    safe = re.sub(
        r"\b(?P<prep>on|at|near|around|from|by)\s+"
        r"[A-Z][A-Za-z0-9'.-]*(?:\s+[A-Z][A-Za-z0-9'.-]*)*\s+"
        r"(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way)\b",
        lambda match: f"{match.group('prep')} a local street",
        safe,
    )
    safe = re.sub(
        r"\bI am (\d{1,2}) years old\b",
        "I am in that life stage",
        safe,
        flags=re.IGNORECASE,
    )
    safe = re.sub(
        r"\bat age (\d{1,2})\b",
        "at that age",
        safe,
        flags=re.IGNORECASE,
    )
    safe = re.sub(
        r"\b(?P<title>Dr\.|Professor|Prof\.)\s+[A-Z][A-Za-z'.-]+\b",
        "an academic mentor",
        safe,
    )
    safe = re.sub(
        r"\b(?:Mr\.|Mrs\.|Ms\.)\s+[A-Z][A-Za-z'.-]+\b",
        "a named private person",
        safe,
    )
    return safe


def sanitize_privacy_safe_payload(value: Any) -> Any:
    """Recursively sanitize strings in JSON-like payloads."""
    if isinstance(value, str):
        return sanitize_privacy_safe_text(value)
    if isinstance(value, list):
        return [sanitize_privacy_safe_payload(item) for item in value]
    if isinstance(value, dict):
        return {
            str(key): sanitize_privacy_safe_payload(item)
            for key, item in value.items()
        }
    return value


def classify_sensitive_content(text: str) -> Dict[str, Any]:
    """Return privacy risk labels without exposing matched sensitive text."""
    counts: Dict[str, Dict[str, Any]] = {}
    for item in _SENSITIVE_PATTERNS:
        matches = item["pattern"].findall(text or "")
        if not matches:
            continue

        category = item["category"]
        current = counts.setdefault(
            category,
            {
                "category": category,
                "severity": item["severity"],
                "count": 0,
                "recommendation": item["recommendation"],
            },
        )
        current["count"] += len(matches)
        if _SEVERITY_ORDER[item["severity"]] > _SEVERITY_ORDER[current["severity"]]:
            current["severity"] = item["severity"]
            current["recommendation"] = item["recommendation"]

    labels: List[Dict[str, Any]] = sorted(
        counts.values(),
        key=lambda label: (
            -_SEVERITY_ORDER.get(str(label.get("severity")), 0),
            str(label.get("category")),
        ),
    )
    risk_level = "none"
    for label in labels:
        severity = str(label.get("severity", "none"))
        if _SEVERITY_ORDER[severity] > _SEVERITY_ORDER[risk_level]:
            risk_level = severity

    review_required = risk_level in {"medium", "high"}
    return {
        "available": bool(labels),
        "risk_level": risk_level,
        "labels": labels,
        "policy": "Sensitive-content labels are count-only; matched source text is not stored.",
        "review_required": review_required,
        "review_summary": (
            "Sensitive content was detected and auto-generalized; keep downstream artifacts role-based and privacy-safe."
            if review_required
            else "No sensitive content review is required by the deterministic scanner."
        ),
    }


def classify_sensitive_payload(value: Any) -> Dict[str, Any]:
    """Classify a JSON-like payload without retaining matched text."""
    if isinstance(value, str):
        text = value
    else:
        text = json.dumps(value, ensure_ascii=False, default=str)
    return classify_sensitive_content(text)
