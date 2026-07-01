import json
from typing import Any


def extract_biography_text(value: Any) -> str:
    """Extract natural biography prose from legacy or section-tree payloads."""
    if isinstance(value, str):
        return value

    if isinstance(value, list):
        parts = [extract_biography_text(item) for item in value]
        return "\n\n".join(part for part in parts if part.strip())

    if isinstance(value, dict):
        parts: list[str] = []
        content = value.get("content")
        if isinstance(content, str) and content.strip():
            parts.append(content)
        elif isinstance(content, list):
            nested_content = extract_biography_text(content)
            if nested_content.strip():
                parts.append(nested_content)

        subsections = value.get("subsections")
        if isinstance(subsections, dict):
            for subsection in subsections.values():
                nested = extract_biography_text(subsection)
                if nested.strip():
                    parts.append(nested)

        if parts:
            return "\n\n".join(parts)

    return json.dumps(value, ensure_ascii=False, indent=2, default=str)
