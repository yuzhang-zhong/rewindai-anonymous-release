import json
import os
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from sqlalchemy.exc import OperationalError, SQLAlchemyError

from database.database import SessionLocal
from database.models import DBSimulationTrace


MAX_SUMMARY_TRACES = 5
MAX_DECISION_EXAMPLES = 12
MAX_REFLECTION_EXAMPLES = 5

_SEVERITY_ORDER = {
    "none": 0,
    "low": 1,
    "medium": 2,
    "high": 3,
}


def _is_missing_table_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "no such table" in message or "does not exist" in message


def _data_root() -> Path:
    return Path(os.getenv("DATA_DIR", "data"))


def _trace_dir(user_id: str) -> Path:
    return _data_root() / user_id / "simulation_traces"


def _read_json(path: Path) -> Dict[str, Any] | None:
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as f:
        payload = json.load(f)
    return payload if isinstance(payload, dict) else None


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _resolve_trace_file(trace_dir: Path, item: Dict[str, Any]) -> Path | None:
    """Resolve current relative trace references and safe legacy absolute paths."""
    file_name = _safe_text(item.get("file"))
    if file_name:
        return trace_dir / Path(file_name).name

    legacy_path = _safe_text(item.get("path"))
    if not legacy_path:
        return None

    candidate = Path(legacy_path)
    if not candidate.is_absolute():
        candidate = trace_dir / candidate

    resolved_candidate = candidate.resolve()
    resolved_root = trace_dir.resolve()
    if not _is_relative_to(resolved_candidate, resolved_root):
        return None
    return resolved_candidate


def _safe_text(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    return str(value).strip() or fallback


def _compact_text(value: Any, limit: int = 420) -> str:
    text = " ".join(_safe_text(value).split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "..."


def _parse_datetime(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc).replace(tzinfo=None)
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return datetime.now(timezone.utc).replace(tzinfo=None)


def save_simulation_trace_sql(
    *,
    user_id: str,
    source: str,
    session_id: str,
    updated_at: str | None,
    received_at: str,
    decisions: int,
    ended: bool,
    contract_version: str | None,
    payload: Dict[str, Any],
) -> None:
    """Persist trace records in SQL so Vercel instances can share durable evidence."""
    db = SessionLocal()
    try:
        trace_id = f"{user_id}:{source}:{session_id}"
        existing = (
            db.query(DBSimulationTrace)
            .filter(DBSimulationTrace.id == trace_id)
            .first()
        )
        if existing:
            existing.updated_at = updated_at
            existing.received_at = _parse_datetime(received_at)
            existing.decisions = decisions
            existing.ended = ended
            existing.contract_version = contract_version
            existing.payload = payload
        else:
            db.add(
                DBSimulationTrace(
                    id=trace_id,
                    user_id=user_id,
                    source=source,
                    session_id=session_id,
                    updated_at=updated_at,
                    received_at=_parse_datetime(received_at),
                    decisions=decisions,
                    ended=ended,
                    contract_version=contract_version,
                    payload=payload,
                )
            )
        db.commit()
    except OperationalError as exc:
        db.rollback()
        if not _is_missing_table_error(exc):
            print(f"simulation trace SQL persistence failed: {exc.__class__.__name__}")
    except SQLAlchemyError as exc:
        db.rollback()
        print(f"simulation trace SQL persistence failed: {exc.__class__.__name__}")
    finally:
        db.close()


def _load_sql_trace_payloads(user_id: str) -> List[Dict[str, Any]]:
    db = SessionLocal()
    try:
        rows = (
            db.query(DBSimulationTrace)
            .filter(DBSimulationTrace.user_id == user_id)
            .order_by(DBSimulationTrace.received_at.desc())
            .limit(MAX_SUMMARY_TRACES)
            .all()
        )
        payloads: List[Dict[str, Any]] = []
        for row in rows:
            payload = row.payload if isinstance(row.payload, dict) else {}
            if payload:
                payloads.append(payload)
        return payloads
    except OperationalError as exc:
        if not _is_missing_table_error(exc):
            print(f"simulation trace SQL load failed: {exc.__class__.__name__}")
        return []
    except SQLAlchemyError as exc:
        print(f"simulation trace SQL load failed: {exc.__class__.__name__}")
        return []
    finally:
        db.close()


def _empty_privacy_signals() -> Dict[str, Any]:
    return {
        "available": False,
        "risk_level": "none",
        "labels": [],
        "policy": "Trace privacy signals are count-only; matched source text is not stored.",
        "review_required": False,
        "review_summary": "No sensitive trace content was detected by the deterministic scanner.",
    }


def _merge_privacy_signals(values: List[Dict[str, Any]]) -> Dict[str, Any]:
    counts: Dict[str, Dict[str, Any]] = {}
    risk_level = "none"

    for value in values:
        if not isinstance(value, dict):
            continue

        current_risk = _safe_text(value.get("risk_level"), "none")
        if _SEVERITY_ORDER.get(current_risk, 0) > _SEVERITY_ORDER.get(risk_level, 0):
            risk_level = current_risk

        labels = value.get("labels")
        if not isinstance(labels, list):
            continue

        for label in labels:
            if not isinstance(label, dict):
                continue
            category = _safe_text(label.get("category"))
            if not category:
                continue

            existing = counts.setdefault(
                category,
                {
                    "category": category,
                    "severity": _safe_text(label.get("severity"), "none"),
                    "count": 0,
                    "recommendation": _safe_text(label.get("recommendation")),
                },
            )
            existing["count"] += int(label.get("count") or 0)
            severity = _safe_text(label.get("severity"), "none")
            if _SEVERITY_ORDER.get(severity, 0) > _SEVERITY_ORDER.get(existing["severity"], 0):
                existing["severity"] = severity
                existing["recommendation"] = _safe_text(label.get("recommendation"))

    labels = sorted(
        counts.values(),
        key=lambda label: (
            -_SEVERITY_ORDER.get(_safe_text(label.get("severity"), "none"), 0),
            _safe_text(label.get("category")),
        ),
    )
    if not labels:
        return _empty_privacy_signals()

    return {
        "available": True,
        "risk_level": risk_level,
        "labels": labels,
        "policy": "Trace privacy signals are count-only; matched source text is not stored.",
        "review_required": risk_level in {"medium", "high"},
        "review_summary": "Sensitive trace content was detected and auto-generalized before storage.",
    }


def _empty_trace_summary() -> Dict[str, Any]:
    return {
        "available": False,
        "trace_count": 0,
        "decision_count": 0,
        "summary": "No downstream simulation traces have been recorded yet.",
        "examples": [],
    }


def _summarize_trace_payloads(payloads: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not payloads:
        return _empty_trace_summary()

    traces: List[Dict[str, Any]] = []
    all_history: List[Dict[str, Any]] = []
    counterfactual_reflections: List[Dict[str, Any]] = []
    privacy_signal_values: List[Dict[str, Any]] = []

    for payload in payloads[:MAX_SUMMARY_TRACES]:
        if not isinstance(payload, dict):
            continue

        record = payload.get("record")
        if not isinstance(record, dict):
            continue
        analysis = payload.get("analysis") if isinstance(payload.get("analysis"), dict) else {}
        reflection_analysis = (
            analysis.get("reflection")
            if isinstance(analysis.get("reflection"), dict)
            else {}
        )

        privacy_signals = payload.get("privacy_signals")
        if isinstance(privacy_signals, dict):
            privacy_signal_values.append(privacy_signals)

        history = record.get("history")
        if not isinstance(history, list):
            history = []

        traces.append(
            {
                "source": payload.get("source", "unknown"),
                "session_id": record.get("sessionId"),
                "updated_at": record.get("updatedAt"),
                "decisions": len(history),
                "final_state": record.get("finalState", {}),
                "counterfactual_reflection_available": isinstance(record.get("reflection"), dict),
                "run_number": analysis.get("run_number") or record.get("runNumber") or record.get("run_number"),
                "negative_per_decision": analysis.get("negative_per_decision"),
                "avg_response_time_sec": analysis.get("avg_response_time_sec"),
                "clone_similarity_percent": reflection_analysis.get("clone_similarity_percent"),
            }
        )
        all_history.extend(history)

        reflection = record.get("reflection")
        if isinstance(reflection, dict):
            clone_replay = (
                reflection_analysis.get("clone_replay")
                if isinstance(reflection_analysis.get("clone_replay"), dict)
                else reflection.get("clone_replay")
                if isinstance(reflection.get("clone_replay"), dict)
                else {}
            )
            counterfactual_reflections.append(
                {
                    "session_id": record.get("sessionId"),
                    "updated_at": reflection.get("updated_at", record.get("updatedAt")),
                    "evidence_boundary": _safe_text(
                        reflection.get("evidence_boundary"),
                        "tentative_counterfactual_rehearsal",
                    ),
                    "unchosen_option": _compact_text(reflection.get("unchosen_option")),
                    "simulated_choice": reflection.get("simulated_choice")
                    if isinstance(reflection.get("simulated_choice"), dict)
                    else {},
                    "simulated_effects": reflection.get("simulated_effects")
                    if isinstance(reflection.get("simulated_effects"), dict)
                    else {},
                    "simulated_outcome": _compact_text(reflection.get("simulated_outcome"), 520),
                    "clone_rehearsal": _compact_text(reflection.get("clone_rehearsal"), 520),
                    "second_run_rule": _compact_text(reflection.get("second_run_rule")),
                    "clone_replay": clone_replay,
                }
            )

    if not traces:
        return _empty_trace_summary()

    direction_counts = Counter(_safe_text(item.get("direction"), "unknown") for item in all_history)
    risk_counts = Counter(_safe_text(item.get("riskLevel"), "unknown") for item in all_history)
    decision_type_counts = Counter(_safe_text(item.get("decisionType"), "unknown") for item in all_history)
    target_meter_counts = Counter(_safe_text(item.get("targetMeter"), "unknown") for item in all_history)

    examples = []
    for item in all_history[-MAX_DECISION_EXAMPLES:]:
        examples.append(
            {
                "card_id": item.get("cardId"),
                "speaker": item.get("speaker"),
                "choice": item.get("optionText"),
                "direction": item.get("direction"),
                "risk_level": item.get("riskLevel"),
                "decision_type": item.get("decisionType"),
                "target_meter": item.get("targetMeter"),
                "outcome": item.get("outcomeLabel"),
                "effects": item.get("effects", {}),
            }
        )

    decision_count = len(all_history)
    if decision_count == 0:
        summary_text = "Simulation traces exist, but no decisions have been recorded yet."
    else:
        top_decision = decision_type_counts.most_common(1)[0][0]
        top_risk = risk_counts.most_common(1)[0][0]
        top_meter = target_meter_counts.most_common(1)[0][0]
        summary_text = (
            f"{decision_count} simulation-test decisions recorded across {len(traces)} run(s). "
            f"Most frequent decision type: {top_decision}. "
            f"Most frequent risk level: {top_risk}. "
            f"Most affected resource: {top_meter}."
        )
        if counterfactual_reflections:
            replay_scores = [
                item.get("clone_replay", {}).get("similarity_percent")
                for item in counterfactual_reflections
                if isinstance(item.get("clone_replay"), dict)
                and isinstance(item.get("clone_replay", {}).get("similarity_percent"), (int, float))
            ]
            score_text = f" Latest same-question clone similarity: {replay_scores[0]}%." if replay_scores else ""
            summary_text += (
                f" {len(counterfactual_reflections)} clone counterfactual reflection(s) captured "
                f"as tentative rehearsal evidence.{score_text}"
            )

    return {
        "available": len(traces) > 0,
        "trace_count": len(traces),
        "decision_count": decision_count,
        "summary": summary_text,
        "runs": traces,
        "patterns": {
            "directions": dict(direction_counts),
            "risk_levels": dict(risk_counts),
            "decision_types": dict(decision_type_counts),
            "target_meters": dict(target_meter_counts),
        },
        "run_metrics": [
            {
                "session_id": run.get("session_id"),
                "run_number": run.get("run_number"),
                "decisions": run.get("decisions"),
                "negative_per_decision": run.get("negative_per_decision"),
                "avg_response_time_sec": run.get("avg_response_time_sec"),
                "clone_similarity_percent": run.get("clone_similarity_percent"),
            }
            for run in traces
        ],
        "privacy_signals": _merge_privacy_signals(privacy_signal_values),
        "counterfactual_reflections": counterfactual_reflections[:MAX_REFLECTION_EXAMPLES],
        "examples": examples,
    }


def load_simulation_trace_summary(user_id: str) -> Dict[str, Any]:
    """Load compact behavioral evidence from downstream simulations."""
    sql_payloads = _load_sql_trace_payloads(user_id)
    if sql_payloads:
        return _summarize_trace_payloads(sql_payloads)

    trace_dir = _trace_dir(user_id)
    index = _read_json(trace_dir / "index.json")
    if not index:
        return _empty_trace_summary()

    trace_items = index.get("traces", [])
    if not isinstance(trace_items, list):
        trace_items = []

    payloads: List[Dict[str, Any]] = []
    for item in trace_items[:MAX_SUMMARY_TRACES]:
        if not isinstance(item, dict):
            continue
        trace_path = _resolve_trace_file(trace_dir, item)
        if trace_path is None:
            continue
        payload = _read_json(trace_path)
        if payload:
            payloads.append(payload)

    return _summarize_trace_payloads(payloads)


def format_simulation_trace_summary(user_id: str) -> str:
    summary = load_simulation_trace_summary(user_id)
    lines = [
        "Behavioral Trace Summary",
        f"Available: {summary['available']}",
        f"Trace count: {summary['trace_count']}",
        f"Decision count: {summary['decision_count']}",
        f"Summary: {summary['summary']}",
    ]

    patterns = summary.get("patterns") or {}
    for label in ["directions", "risk_levels", "decision_types", "target_meters"]:
        values = patterns.get(label) or {}
        if values:
            lines.append(f"{label}: {json.dumps(values, ensure_ascii=False)}")

    examples = summary.get("examples") or []
    if examples:
        lines.append("Recent decision examples:")
        for example in examples:
            lines.append(
                "- "
                + json.dumps(
                    {
                        "speaker": example.get("speaker"),
                        "choice": example.get("choice"),
                        "risk": example.get("risk_level"),
                        "decision_type": example.get("decision_type"),
                        "outcome": example.get("outcome"),
                        "effects": example.get("effects"),
                    },
                    ensure_ascii=False,
                )
            )

    reflections = summary.get("counterfactual_reflections") or []
    if reflections:
        lines.append("Recent counterfactual reflections:")
        for reflection in reflections:
            lines.append(
                "- "
                + json.dumps(
                    {
                        "session_id": reflection.get("session_id"),
                        "evidence_boundary": reflection.get("evidence_boundary"),
                        "unchosen_option": reflection.get("unchosen_option"),
                        "simulated_choice": reflection.get("simulated_choice"),
                        "simulated_effects": reflection.get("simulated_effects"),
                        "simulated_outcome": reflection.get("simulated_outcome"),
                        "clone_rehearsal": reflection.get("clone_rehearsal"),
                        "second_run_rule": reflection.get("second_run_rule"),
                    },
                    ensure_ascii=False,
                )
            )

    privacy_signals = summary.get("privacy_signals") or {}
    if privacy_signals.get("available"):
        lines.append("Trace Privacy Signal Summary:")
        lines.append(json.dumps(privacy_signals, ensure_ascii=False))

    return "\n".join(lines)
