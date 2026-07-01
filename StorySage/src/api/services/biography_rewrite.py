from __future__ import annotations

import asyncio
import json
import os
import re
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Literal

from api.core.errors import sanitize_public_error_text
from api.core.model_settings import UserModelSettings, get_user_model_settings
from api.services.biography_text import extract_biography_text
from api.services.fast_biography import _has_cjk, _json_from_model_text
from api.services.privacy import sanitize_privacy_safe_text
from content.biography.biography import Biography, Section
from utils.llm.engines import get_engine, invoke_engine


RewriteMode = Literal["shorter", "longer", "more_specific"]
PREVIEW_TTL_HOURS = 24


def _data_root() -> Path:
    return Path(os.getenv("DATA_DIR", "data"))


def _preview_dir(user_id: str) -> Path:
    return _data_root() / user_id / "rewrite_previews"


def _preview_path(user_id: str, preview_id: str) -> Path:
    return _preview_dir(user_id) / f"{preview_id}.json"


def _compact(value: Any, limit: int = 4000) -> str:
    text = " ".join(str(value or "").split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _normalize_biography_payload(raw: Dict[str, Any], fallback_title: str, chinese: bool) -> Dict[str, Any]:
    now = datetime.utcnow().isoformat()
    sections = raw.get("sections") if isinstance(raw.get("sections"), list) else []
    normalized_sections = []
    for index, section in enumerate(sections[:8], start=1):
        if not isinstance(section, dict):
            continue
        title = _compact(section.get("title") or f"{index} Section", 120)
        content = sanitize_privacy_safe_text(_compact(section.get("content") or section.get("body") or "", 5000))
        if title and content:
            normalized_sections.append({"title": title, "content": content})

    if not any("决策逻辑" in item["title"] or "decision logic" in item["title"].lower() for item in normalized_sections):
        normalized_sections.insert(
            min(2, len(normalized_sections)),
            {
                "title": "决策逻辑分析" if chinese else "Decision Logic Analysis",
                "content": (
                    "这一节保留为决策逻辑分析：请继续从访谈证据中观察反复出现的取舍、保护的价值、"
                    "信息缺口、关系压力和如果重来会改变决定的变量。"
                    if chinese
                    else "This section is reserved for decision logic analysis: recurring trade-offs, protected values, information gaps, relationship pressure, and the variables that could change a future decision."
                ),
            },
        )

    return {
        "title": _compact(raw.get("title") or fallback_title, 160),
        "content": sanitize_privacy_safe_text(_compact(raw.get("content") or "", 5000)),
        "sections": normalized_sections,
        "created_at": now,
        "last_edit": now,
    }


def _payload_to_biography_dict(payload: Dict[str, Any]) -> Dict[str, Any]:
    root = Section(payload["title"], payload.get("content", ""))
    for section in payload.get("sections", []):
        child = Section(section["title"], section.get("content", ""))
        root.subsections[child.title] = child
    return root.to_dict()


def _fallback_rewrite(current: Dict[str, Any], mode: RewriteMode, chinese: bool) -> Dict[str, Any]:
    text = extract_biography_text(current)
    sentences = [item.strip() for item in re.split(r"(?<=[。！？.!?])\s+", text) if item.strip()]
    title = current.get("title") or ("自传草稿" if chinese else "Biography Draft")
    if mode == "shorter":
        content = " ".join(sentences[:4]) or text[:900]
        change = "压缩为更短的整体草稿。" if chinese else "Condensed into a shorter overall draft."
    elif mode == "longer":
        content = text + (
            "\n\n补充方向：后续可以继续展开每个关键场景中的人物、取舍、当时缺失的信息以及重来时可能改变决定的变量。"
            if chinese
            else "\n\nExpansion direction: future edits can further unpack the people, trade-offs, missing information, and variables that would change each key decision."
        )
        change = "扩展为更完整的草稿。" if chinese else "Expanded into a fuller draft."
    else:
        content = text + (
            "\n\n更具体的方向：请把抽象判断落回具体场景：发生了什么、牵涉谁、最难的取舍是什么、当时保护了什么价值。"
            if chinese
            else "\n\nMore specific direction: ground abstract claims in concrete scenes: what happened, who was involved, what trade-off was hardest, and what value was protected."
        )
        change = "增加具体化提示。" if chinese else "Added specificity prompts."

    return {
        "title": title,
        "content": sanitize_privacy_safe_text(_compact(content, 5000)),
        "sections": [
            {
                "title": "决策逻辑分析" if chinese else "Decision Logic Analysis",
                "content": (
                    "这版改写强调：反复出现的取舍、用户试图保护的价值、关系压力、信息缺口，以及可能改变决定的反事实变量。"
                    if chinese
                    else "This rewrite emphasizes recurring trade-offs, protected values, relationship pressure, information gaps, and counterfactual variables that could change decisions."
                ),
            }
        ],
        "change_summary": change,
    }


def _rewrite_prompt(user_id: str, current: Dict[str, Any], mode: RewriteMode, chinese: bool) -> str:
    mode_instruction = {
        "shorter": "Make the biography shorter and clearer without losing key decision evidence.",
        "longer": "Make the biography richer and more complete, adding grounded detail only when supported.",
        "more_specific": "Make the biography more concrete by turning vague summaries into specific scenes and decision variables.",
    }[mode]
    language = "Chinese" if chinese else "English"
    return f"""
You are the StorySage/RewindAI biography rewrite agent.

Rewrite the user's existing biography in {language}.
Mode: {mode_instruction}

Requirements:
- Preserve factual grounding; do not invent facts.
- Keep or add a section titled "Decision Logic Analysis" or "决策逻辑分析".
- In that section, analyze recurring trade-offs, protected values, missing information,
  decision boundaries, counterfactual variables, and relationship pressures.
- Avoid diagnosis and unsupported personality labels; use "early signal" / "hypothesis" language when evidence is partial.
- Remove or generalize sensitive direct identifiers.

Return only JSON:
{{
  "title": "...",
  "content": "overview paragraph",
  "sections": [
    {{"title": "...", "content": "..."}}
  ],
  "change_summary": "one sentence summary"
}}

User id: {user_id}

Current biography:
{json.dumps(current, ensure_ascii=False)}
""".strip()


async def create_biography_rewrite_preview(
    user_id: str,
    current_biography: Dict[str, Any],
    mode: RewriteMode,
    model_settings: UserModelSettings | None = None,
) -> Dict[str, Any]:
    if mode not in {"shorter", "longer", "more_specific"}:
        raise ValueError("Unsupported rewrite mode.")

    source_text = extract_biography_text(current_biography)
    if not source_text.strip():
        raise ValueError("Current biography is empty.")

    chinese = _has_cjk(source_text)
    settings = model_settings or get_user_model_settings(user_id)
    rewritten: Dict[str, Any] | None = None
    change_summary = ""
    if settings:
        try:
            engine = get_engine(
                model_name=settings.model_name,
                provider=settings.provider,
                api_key=settings.api_key,
                max_tokens=2600,
                timeout=45,
                max_retries=1,
                temperature=0.25,
            )
            response = await asyncio.to_thread(
                invoke_engine,
                engine,
                _rewrite_prompt(user_id, current_biography, mode, chinese),
            )
            parsed = _json_from_model_text(str(response))
            if parsed:
                change_summary = _compact(parsed.get("change_summary") or "", 600)
                rewritten = _normalize_biography_payload(
                    parsed,
                    current_biography.get("title") or ("自传草稿" if chinese else "Biography Draft"),
                    chinese,
                )
        except Exception as exc:
            print(f"biography rewrite preview failed: {sanitize_public_error_text(exc)}")

    if rewritten is None:
        fallback = _fallback_rewrite(current_biography, mode, chinese)
        change_summary = fallback.pop("change_summary")
        rewritten = _normalize_biography_payload(
            fallback,
            current_biography.get("title") or ("自传草稿" if chinese else "Biography Draft"),
            chinese,
        )

    preview_id = str(uuid.uuid4())
    preview_payload = {
        "preview_id": preview_id,
        "user_id": user_id,
        "mode": mode,
        "created_at": datetime.utcnow().isoformat(),
        "expires_at": (datetime.utcnow() + timedelta(hours=PREVIEW_TTL_HOURS)).isoformat(),
        "biography": _payload_to_biography_dict(rewritten),
        "change_summary": change_summary or ("已生成改写预览。" if chinese else "Rewrite preview generated."),
    }
    _preview_dir(user_id).mkdir(parents=True, exist_ok=True)
    with _preview_path(user_id, preview_id).open("w", encoding="utf-8") as f:
        json.dump(preview_payload, f, ensure_ascii=False, indent=2)
    return preview_payload


async def apply_biography_rewrite_preview(user_id: str, preview_id: str) -> Dict[str, Any]:
    if not preview_id or not re.fullmatch(r"[0-9a-fA-F-]{32,40}", preview_id):
        raise ValueError("Invalid preview id.")
    path = _preview_path(user_id, preview_id)
    if not path.exists():
        raise FileNotFoundError("Rewrite preview not found.")
    with path.open("r", encoding="utf-8") as f:
        preview = json.load(f)
    if preview.get("user_id") != user_id:
        raise PermissionError("Rewrite preview belongs to another user.")
    expires_at = datetime.fromisoformat(str(preview.get("expires_at")))
    if datetime.utcnow() > expires_at:
        raise TimeoutError("Rewrite preview has expired.")

    biography_payload = preview.get("biography")
    if not isinstance(biography_payload, dict):
        raise ValueError("Rewrite preview payload is invalid.")
    biography = Biography.load_from_file(user_id)
    biography.root = Section.from_dict(biography_payload)
    await biography.save()
    return biography.root.to_dict()
