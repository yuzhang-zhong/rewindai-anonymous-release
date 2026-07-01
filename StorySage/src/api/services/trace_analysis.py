from __future__ import annotations

from collections import Counter
from typing import Any, Dict, List


def _safe_text(value: Any, fallback: str = "unknown") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text or fallback


def _negative_impact(item: Dict[str, Any]) -> int:
    effects = item.get("effects") if isinstance(item.get("effects"), dict) else {}
    return int(sum(abs(value) for value in effects.values() if isinstance(value, (int, float)) and value < 0))


def _increment(counter: Counter, value: Any, amount: int = 1) -> None:
    counter[_safe_text(value)] += amount


def _increment_present(counter: Counter, value: Any, amount: int = 1) -> None:
    if value is not None and str(value).strip():
        _increment(counter, value, amount)


def _choice_key(choice: Dict[str, Any]) -> tuple[str, str]:
    return (
        _safe_text(choice.get("card_id") or choice.get("cardId")),
        _safe_text(choice.get("human_direction") or choice.get("direction")),
    )


def _normalize_clone_choice(choice: Dict[str, Any]) -> Dict[str, Any]:
    human_direction = _safe_text(choice.get("human_direction") or choice.get("direction"))
    clone_direction = _safe_text(choice.get("clone_direction"))
    matched = choice.get("matched")
    if not isinstance(matched, bool):
        matched = bool(clone_direction and clone_direction == human_direction)
    return {
        **choice,
        "card_id": choice.get("card_id") or choice.get("cardId"),
        "human_direction": human_direction,
        "clone_direction": clone_direction,
        "matched": matched,
        "decision_type": choice.get("decision_type") or choice.get("decisionType"),
        "risk_level": choice.get("risk_level") or choice.get("riskLevel"),
        "target_meter": choice.get("target_meter") or choice.get("targetMeter"),
        "failure_modes": choice.get("failure_modes") if isinstance(choice.get("failure_modes"), list) else [],
    }


def _clone_replay_from_reflection(reflection: Dict[str, Any]) -> Dict[str, Any] | None:
    clone_replay = reflection.get("clone_replay") if isinstance(reflection.get("clone_replay"), dict) else None
    if not clone_replay:
        return None

    raw_choices = clone_replay.get("choices") if isinstance(clone_replay.get("choices"), list) else []
    choices = [_normalize_clone_choice(choice) for choice in raw_choices if isinstance(choice, dict)]
    total = len(choices) or int(clone_replay.get("total_questions") or 0)
    matched = sum(1 for choice in choices if choice.get("matched"))
    if not choices:
        matched = int(clone_replay.get("matched_choices") or 0)
    percent = round((matched / total) * 100) if total else None

    mismatch_categories = {
        "card_domains": Counter(),
        "decision_types": Counter(),
        "risk_levels": Counter(),
        "target_meters": Counter(),
        "failure_modes": Counter(),
        "legacy": Counter(),
    }
    for choice in choices:
        if choice.get("matched"):
            continue
        _increment_present(mismatch_categories["card_domains"], choice.get("card_domain"))
        _increment_present(mismatch_categories["decision_types"], choice.get("decision_type"))
        _increment_present(mismatch_categories["risk_levels"], choice.get("risk_level"))
        _increment_present(mismatch_categories["target_meters"], choice.get("target_meter"))
        for failure_mode in choice.get("failure_modes") or []:
            _increment(mismatch_categories["failure_modes"], failure_mode)

    provided_categories = (
        clone_replay.get("mismatch_categories")
        if isinstance(clone_replay.get("mismatch_categories"), dict)
        else {}
    )
    if not any(mismatch_categories[key] for key in mismatch_categories) and provided_categories:
        for category, value in provided_categories.items():
            if isinstance(value, dict) and category in mismatch_categories:
                mismatch_categories[category].update(
                    {str(k): int(v) for k, v in value.items() if isinstance(v, int)}
                )
            elif isinstance(value, int):
                mismatch_categories["legacy"][str(category)] = value

    return {
        **clone_replay,
        "total_questions": total,
        "matched_choices": matched,
        "similarity_score": round(matched / total, 4) if total else None,
        "similarity_percent": percent,
        "choices": choices,
        "mismatch_categories": {
            key: dict(counter)
            for key, counter in mismatch_categories.items()
            if counter or key != "legacy"
        },
        "validated_by_backend": True,
    }


def analyze_trace_record(record: Dict[str, Any]) -> Dict[str, Any]:
    history = record.get("history") if isinstance(record.get("history"), list) else []
    final_state = record.get("finalState") if isinstance(record.get("finalState"), dict) else {}
    reflection = record.get("reflection") if isinstance(record.get("reflection"), dict) else None
    self_reflection = record.get("selfReflection") if isinstance(record.get("selfReflection"), dict) else None
    general_reflection = record.get("generalReflection") if isinstance(record.get("generalReflection"), dict) else None

    direction_counts: Counter = Counter()
    decision_type_counts: Counter = Counter()
    risk_level_counts: Counter = Counter()
    target_meter_counts: Counter = Counter()
    card_domain_counts: Counter = Counter()
    failure_mode_counts: Counter = Counter()
    response_times: List[float] = []
    negative_impact = 0
    card_ids: List[str] = []

    for item in history:
        if not isinstance(item, dict):
            continue
        _increment(direction_counts, item.get("direction"))
        _increment(decision_type_counts, item.get("decisionType"))
        _increment(risk_level_counts, item.get("riskLevel"))
        _increment(target_meter_counts, item.get("targetMeter"))
        _increment(card_domain_counts, item.get("cardDomain"))
        card_id = _safe_text(item.get("cardId"), "")
        if card_id:
            card_ids.append(card_id)
        for mode in item.get("failureModes") if isinstance(item.get("failureModes"), list) else []:
            _increment(failure_mode_counts, mode)
        response_ms = item.get("responseTimeMs")
        if isinstance(response_ms, (int, float)) and response_ms >= 0:
            response_times.append(float(response_ms) / 1000)
        negative_impact += _negative_impact(item)

    clone_replay = _clone_replay_from_reflection(reflection) if reflection else None
    meters = final_state.get("meters") if isinstance(final_state.get("meters"), dict) else {}
    lowest_meter_name = None
    lowest_meter_value = None
    if meters:
        lowest_meter_name, lowest_meter_value = min(meters.items(), key=lambda item: item[1])

    return {
        "schema_version": "trace_analysis.v1",
        "run_number": record.get("runNumber") or record.get("run_number"),
        "decision_count": len(history),
        "ended": bool(final_state.get("ended")),
        "ending": final_state.get("ending") or final_state.get("endingZh") or final_state.get("endingCause"),
        "lowest_meter": lowest_meter_name,
        "lowest_meter_value": lowest_meter_value,
        "negative_impact_total": negative_impact,
        "negative_per_decision": round(negative_impact / max(1, len(history)), 2),
        "avg_response_time_sec": round(sum(response_times) / len(response_times), 2) if response_times else None,
        "card_ids": card_ids[:120],
        "unique_card_count": len(set(card_ids)),
        "patterns": {
            "directions": dict(direction_counts),
            "decision_types": dict(decision_type_counts),
            "risk_levels": dict(risk_level_counts),
            "target_meters": dict(target_meter_counts),
            "card_domains": dict(card_domain_counts),
            "failure_modes": dict(failure_mode_counts),
        },
        "reflection": {
            "has_clone_reflection": reflection is not None,
            "has_self_reflection": self_reflection is not None,
            "has_general_reflection": general_reflection is not None,
            "clone_replay": clone_replay,
            "clone_similarity_percent": clone_replay.get("similarity_percent") if clone_replay else None,
            "clone_matched_choices": clone_replay.get("matched_choices") if clone_replay else None,
            "clone_total_questions": clone_replay.get("total_questions") if clone_replay else None,
            "clone_mismatch_categories": clone_replay.get("mismatch_categories") if clone_replay else {},
        },
    }
