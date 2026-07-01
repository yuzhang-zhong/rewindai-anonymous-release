from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime
from typing import Any

from api.core.errors import sanitize_public_error_text
from api.core.model_settings import UserModelSettings, get_user_model_settings
from api.services.privacy import sanitize_privacy_safe_text
from content.biography.biography import Biography
from utils.llm.engines import get_engine, invoke_engine


def _has_cjk(text: str) -> bool:
    return any("\u4e00" <= char <= "\u9fff" for char in text)


def _compact(text: str, limit: int = 1200) -> str:
    value = " ".join(str(text or "").split())
    if len(value) <= limit:
        return value
    return value[: limit - 1].rstrip() + "..."


def _json_from_model_text(text: str) -> dict[str, Any] | None:
    cleaned = (text or "").strip()
    if not cleaned:
        return None
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, re.S)
    if fenced:
        cleaned = fenced.group(1).strip()
    else:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            cleaned = cleaned[start : end + 1]
    try:
        parsed = json.loads(cleaned)
    except Exception:
        return None
    return parsed if isinstance(parsed, dict) else None


def is_placeholder_biography_payload(payload: dict) -> bool:
    text = json.dumps(payload or {}, ensure_ascii=False).lower()
    placeholder_markers = (
        "interview-based draft",
        "full ai biography writer was still processing",
        "serverless runtime lost the active in-memory session",
        "placeholder for the richer model-generated narrative",
    )
    return any(marker in text for marker in placeholder_markers)


def _normalize_section(raw: Any, fallback_title: str) -> dict[str, Any]:
    if isinstance(raw, dict):
        title = _safe_section_title(raw.get("title") or fallback_title, fallback_title)
        content = _compact(raw.get("content") or raw.get("body") or "", 4000)
    else:
        title = _safe_section_title(fallback_title, fallback_title)
        content = _compact(raw, 4000)
    return {
        "title": title or fallback_title,
        "content": sanitize_privacy_safe_text(content),
    }


def _safe_section_title(raw_title: Any, fallback_title: str) -> str:
    """Keep generated section titles compatible with Biography.add_section paths."""
    title = _compact(str(raw_title or "").replace("/", " - "), 120)
    title = re.sub(r"\s+", " ", title).strip()
    fallback = _compact(str(fallback_title or "1 Interview Insight").replace("/", " - "), 120)
    fallback_number = fallback.split()[0] if fallback.split() else "1"

    if re.match(r"^\d+(?:\.\d+)*\s+\S", title):
        return title

    label = re.sub(r"^\d+(?:\.\d+)*\s*", "", title).strip()
    fallback_label = re.sub(r"^\d+(?:\.\d+)*\s*", "", fallback).strip()
    return f"{fallback_number} {label or fallback_label or 'Interview Insight'}"


def _decision_logic_title(chinese: bool) -> str:
    return "3 决策逻辑分析" if chinese else "3 Decision Logic Analysis"


def _build_decision_logic_content(user_turns: list[str], chinese: bool) -> str:
    evidence = "；".join(user_turns[:4]) if chinese else "; ".join(user_turns[:4])
    if chinese:
        return (
            "从目前访谈看，用户的决策逻辑可以先被理解为一种需要继续验证的假设："
            "在重要选择中，用户会同时权衡关系压力、个人原则、短期情绪成本、长期后果和信息是否充分。"
            "值得继续追问的变量包括：当时最难放弃的东西是什么、哪些信息缺失会改变判断、"
            "如果重新选择，哪一个条件会让决定发生变化。"
            + (f" 相关访谈证据包括：{evidence}" if evidence else "")
        )
    return (
        "Based on the current interview, the user's decision logic should be treated as an early hypothesis: "
        "important choices appear to involve balancing relationship pressure, personal principles, short-term emotional cost, "
        "long-term consequences, and whether enough information is available. Future probing should ask what was hardest "
        "to give up, what missing information mattered, and which variable would change the decision if the moment happened again."
        + (f" Interview evidence includes: {evidence}" if evidence else "")
    )


def _ensure_decision_logic_section(sections: list[dict[str, Any]], user_turns: list[str], chinese: bool) -> list[dict[str, Any]]:
    has_decision_logic = any(
        "决策逻辑" in str(section.get("title", ""))
        or "decision logic" in str(section.get("title", "")).lower()
        for section in sections
    )
    if has_decision_logic:
        return sections

    insert_at = min(2, len(sections))
    enriched = list(sections)
    enriched.insert(
        insert_at,
        {
            "title": _decision_logic_title(chinese),
            "content": sanitize_privacy_safe_text(_build_decision_logic_content(user_turns, chinese)),
        },
    )
    return enriched[:6]


def _build_local_biography_payload(user_id: str, transcript: list[dict[str, str]]) -> dict[str, Any]:
    user_turns = [
        _compact(item.get("content", ""), 900)
        for item in transcript
        if item.get("role") == "User" and item.get("content", "").strip()
    ]
    joined = "\n".join(user_turns)
    chinese = _has_cjk(joined)
    now = datetime.utcnow().isoformat()

    if chinese:
        root_title = f"{user_id} 的自传草稿"
        intro = (
            "这份自传草稿由访谈记录整理而成，重点保留用户讲述过的具体经历、"
            "关系处境、取舍压力和可能影响未来选择的变量。"
        )
        section_specs = [
            ("1 关键经历", "用户在访谈中提到的核心场景包括：" + "；".join(user_turns[:5])),
            (
                "2 关系与取舍",
                "这些叙述中反复出现的线索，是在情绪、关系、公平、责任和自我边界之间做平衡。"
                "后续访谈可以继续追问：当时最难舍弃的是什么，哪些信息缺失会影响判断。"
            ),
            (
                "3 决策逻辑分析",
                _build_decision_logic_content(user_turns, True)
            ),
            (
                "4 后续可追问",
                "可以继续围绕一个高风险或高取舍场景展开：发生了什么、牵涉哪些人、"
                "当时最重要的价值是什么，以及如果重来哪一个变量会改变决定。"
            ),
        ]
    else:
        root_title = f"Biography of {user_id}"
        intro = (
            "This autobiography draft was organized from the interview transcript. "
            "It preserves concrete scenes, relationship context, trade-offs, and "
            "decision variables that can ground later reflection."
        )
        section_specs = [
            ("1 Key Lived Scenes", "The central scenes shared in the interview include: " + "; ".join(user_turns[:5])),
            (
                "2 Relationships and Trade-offs",
                "The transcript repeatedly points to balancing emotion, relationships, fairness, responsibility, "
                "and personal boundaries. Future probing should ask what felt hardest to give up and what "
                "missing information shaped the decision."
            ),
            (
                "3 Decision Logic Analysis",
                _build_decision_logic_content(user_turns, False)
            ),
            (
                "4 Questions to Carry Forward",
                "A next interview can focus on one high-stakes or high-tradeoff moment: what happened, who was involved, "
                "what mattered most, and what variable would have changed the decision."
            ),
        ]

    return {
        "title": root_title,
        "content": intro,
        "sections": [
            {"title": title, "content": sanitize_privacy_safe_text(content)}
            for title, content in section_specs
            if content.strip()
        ],
        "source": "local_fast_biography",
        "created_at": now,
        "last_edit": now,
    }


def _build_fast_biography_prompt(user_id: str, transcript: list[dict[str, str]]) -> str:
    transcript_text = "\n".join(
        f"{item.get('role', 'Unknown')}: {_compact(item.get('content', ''), 1000)}"
        for item in transcript
        if item.get("content", "").strip()
    )
    language = "Chinese" if _has_cjk(transcript_text) else "English"
    decision_title = _decision_logic_title(language == "Chinese")
    return f"""
You are the fast biography writer in the StorySage/RewindAI architecture.

Task:
Create a grounded, readable autobiography draft from the interview transcript.
Do not merely list the user's messages. Do not invent facts. Use only what is
supported by the transcript, but synthesize it into coherent prose.

Style:
- Write in {language}.
- Natural autobiography / reflective profile, not a questionnaire report.
- Keep it useful for later graph construction: include people/relationships,
  recurring trade-offs, decision boundaries, and variables that could change decisions.
- Avoid diagnosis, labels, or unsupported personality claims.
- If details are thin, explicitly frame them as "early signals" rather than facts.

Return only JSON:
{{
  "title": "...",
  "content": "2-4 sentence overview",
  "sections": [
    {{"title": "1 ...", "content": "rich paragraph(s)"}},
    {{"title": "2 ...", "content": "rich paragraph(s)"}},
    {{"title": "{decision_title}", "content": "Analyze recurring trade-offs, protected values, missing information, decision boundaries, counterfactual variables, and relationship pressures. Frame as evidence-based hypotheses, not diagnosis."}},
    {{"title": "4 ...", "content": "rich paragraph(s)"}}
  ]
}}

User id: {user_id}

Transcript:
{transcript_text}
""".strip()


async def generate_fast_biography_payload(
    user_id: str,
    transcript: list[dict[str, str]],
    model_settings: UserModelSettings | None = None,
) -> dict[str, Any]:
    if not transcript:
        raise ValueError("Transcript is empty.")

    settings = model_settings or get_user_model_settings(user_id)
    if settings:
        prompt = _build_fast_biography_prompt(user_id, transcript)
        try:
            engine = get_engine(
                model_name=settings.model_name,
                provider=settings.provider,
                api_key=settings.api_key,
                max_tokens=1800,
                timeout=35,
                max_retries=1,
                temperature=0.2,
            )
            response = await asyncio.to_thread(invoke_engine, engine, prompt)
            parsed = _json_from_model_text(str(response))
            if parsed:
                now = datetime.utcnow().isoformat()
                sections = parsed.get("sections") or []
                user_turns = [
                    _compact(item.get("content", ""), 900)
                    for item in transcript
                    if item.get("role") == "User" and item.get("content", "").strip()
                ]
                normalized_sections = [
                    _normalize_section(section, f"{index + 1} Interview Insight")
                    for index, section in enumerate(sections[:6])
                ]
                normalized_sections = _ensure_decision_logic_section(
                    normalized_sections,
                    user_turns,
                    _has_cjk("\n".join(user_turns)),
                )
                return {
                    "title": _compact(parsed.get("title") or f"Biography of {user_id}", 160),
                    "content": sanitize_privacy_safe_text(_compact(parsed.get("content") or "", 4000)),
                    "sections": normalized_sections,
                    "source": "llm_fast_biography",
                    "created_at": now,
                    "last_edit": now,
                }
        except Exception as exc:
            print(f"fast biography writer failed: {sanitize_public_error_text(exc)}")

    return _build_local_biography_payload(user_id, transcript)


async def save_fast_biography(
    user_id: str,
    transcript: list[dict[str, str]],
    model_settings: UserModelSettings | None = None,
) -> dict[str, Any]:
    payload = await generate_fast_biography_payload(user_id, transcript, model_settings)
    biography = Biography.load_from_file(user_id)
    biography.root.title = payload["title"]
    biography.root.content = payload["content"]
    biography.root.subsections = {}
    for index, section in enumerate(payload["sections"]):
        title = _safe_section_title(
            section.get("title"),
            f"{index + 1} Interview Insight",
        )
        await biography.add_section(title, section["content"])
    await biography.save()
    return payload
