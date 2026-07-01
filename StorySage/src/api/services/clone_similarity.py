from __future__ import annotations

import json
import re
from collections import Counter
from typing import Any, Dict, List

from api.core.model_settings import get_user_model_settings
from api.services.mental_model import get_current_mental_model_formulation
from api.services.privacy import sanitize_privacy_safe_text
from utils.llm.engines import get_engine, invoke_engine


MAX_CLONE_REPLAY_CHOICES = 24


def _safe_text(value: Any, limit: int = 320) -> str:
    text = " ".join(str(value or "").split())
    return text[:limit].strip()


def _json_from_text(text: str) -> Dict[str, Any] | None:
    text = text.strip()
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        pass

    match = re.search(r"\{.*\}", text, flags=re.S)
    if not match:
        return None
    try:
        parsed = json.loads(match.group(0))
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def _choice_context(item: Dict[str, Any], index: int) -> Dict[str, Any]:
    return {
        "index": index,
        "card_id": item.get("cardId"),
        "card_domain": item.get("cardDomain"),
        "prompt": _safe_text(item.get("cardPrompt") or item.get("cardPromptZh"), 220),
        "speaker": _safe_text(item.get("speaker") or item.get("speakerZh"), 80),
        "human_direction": item.get("direction"),
        "human_choice": _safe_text(item.get("optionText") or item.get("optionTextZh"), 160),
        "decision_type": item.get("decisionType"),
        "risk_level": item.get("riskLevel"),
        "target_meter": item.get("targetMeter"),
        "effects": item.get("effects") if isinstance(item.get("effects"), dict) else {},
        "failure_modes": item.get("failureModes") if isinstance(item.get("failureModes"), list) else [],
    }


def _mental_model_summary(user_id: str) -> Dict[str, Any]:
    payload = get_current_mental_model_formulation(user_id) or {}
    formulation = payload.get("formulation") if isinstance(payload.get("formulation"), dict) else {}
    return {
        "status": payload.get("status"),
        "confidence": payload.get("confidence"),
        "grounding_summary": formulation.get("grounding_summary", ""),
        "relationship_focus": formulation.get("relationship_focus", []),
        "decision_policy_hypotheses": formulation.get("decision_policy_hypotheses", []),
        "likely_pressure_points": formulation.get("likely_pressure_points", []),
        "privacy_boundary": formulation.get("privacy_boundary", ""),
    }


def _heuristic_replay(choices: List[Dict[str, Any]], reason: str) -> Dict[str, Any]:
    replay_choices: List[Dict[str, Any]] = []
    for item in choices:
        effects = item.get("effects") if isinstance(item.get("effects"), dict) else {}
        negative_total = sum(abs(v) for v in effects.values() if isinstance(v, (int, float)) and v < 0)
        risk_level = str(item.get("risk_level") or "").lower()
        same = not (risk_level == "high" and negative_total >= 20)
        replay_choices.append(
            {
                **item,
                "clone_direction": item.get("human_direction") if same else "different",
                "matched": same,
                "rationale": (
                    "Heuristic fallback: high-risk, high-negative-impact choices are treated as likely mismatch."
                    if not same
                    else "Heuristic fallback: choice is treated as plausible under the current limited model."
                ),
            }
        )
    matched = sum(1 for item in replay_choices if item.get("matched"))
    total = len(replay_choices)
    return {
        "source": "heuristic_clone_replay",
        "error": reason,
        "total_questions": total,
        "matched_choices": matched,
        "similarity_percent": round((matched / total) * 100) if total else None,
        "choices": replay_choices,
    }


def build_clone_replay_for_record(user_id: str, record: Dict[str, Any]) -> Dict[str, Any] | None:
    """Predict whether the mental-model clone would repeat each recorded choice."""
    history = record.get("history") if isinstance(record.get("history"), list) else []
    choices = [
        _choice_context(item, index)
        for index, item in enumerate(history[:MAX_CLONE_REPLAY_CHOICES], start=1)
        if isinstance(item, dict) and item.get("cardId") and item.get("direction")
    ]
    if not choices:
        return None

    settings = get_user_model_settings(user_id)
    mental_model = _mental_model_summary(user_id)
    if not settings:
        return _heuristic_replay(choices, "system model unavailable")

    prompt = (
        "You are evaluating a tentative RewindAI decision-pattern clone. "
        "For each same simulation-test card context, decide whether a clone grounded in the user's mental-model draft "
        "would likely repeat the human's recorded choice or choose differently. "
        "Important limitation: the trace contains the user's chosen option, not all original options. Therefore output SAME if the clone would likely endorse/repeat that chosen option; "
        "output DIFFERENT if the clone would likely avoid or question it. Do not invent personalized cards. "
        "Use the mental model explicitly: decision-policy hypotheses, pressure points, relationship focus, and trace context. "
        "Return strict JSON only with this shape: "
        '{"choices":[{"index":1,"clone_direction":"same|different","rationale":"short reason"}]}.\n\n'
        f"Mental model draft: {json.dumps(mental_model, ensure_ascii=False)[:3600]}\n"
        f"Recorded choices: {json.dumps(choices, ensure_ascii=False)[:5200]}"
    )
    try:
        engine = get_engine(
            settings.model_name,
            provider=settings.provider,
            api_key=settings.api_key,
            temperature=0.15,
            max_tokens=1600,
            timeout=24,
        )
        response = invoke_engine(engine, prompt)
        text = getattr(response, "content", None) or getattr(response, "text", None) or str(response)
        parsed = _json_from_text(text)
        raw_choices = parsed.get("choices") if isinstance(parsed, dict) and isinstance(parsed.get("choices"), list) else []
        by_index = {
            int(item.get("index")): item
            for item in raw_choices
            if isinstance(item, dict) and str(item.get("index", "")).isdigit()
        }
        replay_choices: List[Dict[str, Any]] = []
        mismatch_categories = {
            "card_domains": Counter(),
            "decision_types": Counter(),
            "risk_levels": Counter(),
            "target_meters": Counter(),
            "failure_modes": Counter(),
        }
        for item in choices:
            prediction = by_index.get(int(item["index"]), {})
            raw_direction = str(prediction.get("clone_direction") or "").strip().lower()
            same = raw_direction in {"same", "match", "matched", item.get("human_direction")}
            clone_direction = item.get("human_direction") if same else "different"
            choice = {
                **item,
                "clone_direction": clone_direction,
                "matched": same,
                "rationale": sanitize_privacy_safe_text(_safe_text(prediction.get("rationale"), 260)),
            }
            replay_choices.append(choice)
            if not same:
                mismatch_categories["card_domains"][str(item.get("card_domain") or "unknown")] += 1
                mismatch_categories["decision_types"][str(item.get("decision_type") or "unknown")] += 1
                mismatch_categories["risk_levels"][str(item.get("risk_level") or "unknown")] += 1
                mismatch_categories["target_meters"][str(item.get("target_meter") or "unknown")] += 1
                for mode in item.get("failure_modes") or []:
                    mismatch_categories["failure_modes"][str(mode)] += 1

        matched = sum(1 for item in replay_choices if item.get("matched"))
        total = len(replay_choices)
        return {
            "source": "system_model_clone_replay",
            "model_name": settings.model_name,
            "total_questions": total,
            "matched_choices": matched,
            "similarity_percent": round((matched / total) * 100) if total else None,
            "choices": replay_choices,
            "mismatch_categories": {
                key: dict(counter)
                for key, counter in mismatch_categories.items()
                if counter
            },
            "limitation": (
                "Trace includes the human selected option, not all original card options; similarity is same-choice endorsement, not full four-option replay."
            ),
        }
    except Exception as exc:
        return _heuristic_replay(choices, exc.__class__.__name__)
