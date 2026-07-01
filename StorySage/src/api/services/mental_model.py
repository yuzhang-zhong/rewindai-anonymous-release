import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from api.services.graph_signals import load_graph_signals
from api.services.grounding_evidence import load_grounding_evidence
from api.services.simulation_traces import load_simulation_trace_summary


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _data_root() -> Path:
    return Path(os.getenv("DATA_DIR", "data"))


def _formulation_dir(user_id: str) -> Path:
    return _data_root() / user_id / "formulation"


def _current_file(user_id: str) -> Path:
    return _formulation_dir(user_id) / "current.json"


def _snapshots_dir(user_id: str) -> Path:
    return _formulation_dir(user_id) / "snapshots"


def _read_json(path: Path) -> Optional[Dict[str, Any]]:
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as f:
        payload = json.load(f)
    return payload if isinstance(payload, dict) else None


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def _compact(text: str, max_chars: int = 1100) -> str:
    normalized = re.sub(r"\s+", " ", text).strip()
    if len(normalized) <= max_chars:
        return normalized
    return normalized[: max_chars - 3].rstrip() + "..."


def _trace_hypotheses(trace_summary: Dict[str, Any]) -> List[str]:
    if not trace_summary.get("available") or trace_summary.get("decision_count", 0) == 0:
        return [
            "Behavioral simulation evidence is not available yet; keep decision-policy claims tentative."
        ]

    patterns = trace_summary.get("patterns") or {}
    hypotheses: List[str] = []

    risk_counts = patterns.get("risk_levels") or {}
    if risk_counts:
        top_risk = max(risk_counts.items(), key=lambda item: item[1])[0]
        hypotheses.append(
            f"Simulation choices most often appeared in {top_risk}-risk situations; probe whether this reflects real-life comfort with uncertainty."
        )

    decision_type_counts = patterns.get("decision_types") or {}
    if decision_type_counts:
        top_type = max(decision_type_counts.items(), key=lambda item: item[1])[0]
        hypotheses.append(
            f"Repeated simulation choices involved {top_type}; use real autobiographical incidents to confirm the underlying decision lens."
        )

    target_meter_counts = patterns.get("target_meters") or {}
    if target_meter_counts:
        top_meter = max(target_meter_counts.items(), key=lambda item: item[1])[0]
        hypotheses.append(
            f"Simulation outcomes most often affected {top_meter}; create scenarios around that resource pressure."
        )

    direction_counts = patterns.get("directions") or {}
    if direction_counts:
        top_direction = max(direction_counts.items(), key=lambda item: item[1])[0]
        hypotheses.append(
            f"Recent decisions leaned toward {top_direction}; ask the user whether that direction feels situational or stable."
        )

    return hypotheses[:4]


def _pressure_points(graph_signals: Dict[str, Any], trace_summary: Dict[str, Any]) -> List[str]:
    points = [
        "personal goals versus obligations to other people",
        "limited time, energy, money, or attention",
        "uncertainty where the user lacks complete information",
    ]

    target_meters = (trace_summary.get("patterns") or {}).get("target_meters") or {}
    for meter in list(target_meters.keys())[:3]:
        points.append(f"resource pressure around {meter}")

    if graph_signals.get("available"):
        relation_types = graph_signals.get("relation_types") or {}
        for relation in list(relation_types.keys())[:3]:
            points.append(f"relationship tension involving {relation}")

    return list(dict.fromkeys(points))[:7]


def _relationship_focus(graph_signals: Dict[str, Any]) -> List[str]:
    labels = graph_signals.get("focus_labels") or []
    if labels:
        return labels
    return [
        "No graph-derived relationship focus is available yet; use biography-mentioned roles cautiously."
    ]


def _confidence(evidence: Dict[str, Any]) -> str:
    score = 0
    if evidence.get("biography_available"):
        score += 1
    if evidence.get("graph", {}).get("available"):
        score += 1
    if evidence.get("trace_summary", {}).get("decision_count", 0) > 0:
        score += 1

    if score >= 3:
        return "medium"
    if score == 2:
        return "low-medium"
    return "low"


def build_mental_model_formulation(user_id: str) -> Dict[str, Any]:
    """Build a privacy-aware draft mental model from current RewindAI evidence."""
    grounding = load_grounding_evidence(user_id)
    grounding_text = grounding["safe_text"]
    trace_summary = load_simulation_trace_summary(user_id)
    graph_signals = load_graph_signals(user_id)

    evidence = {
        "biography_available": grounding["biography_available"],
        "graph": graph_signals,
        "trace_summary": {
            "available": trace_summary.get("available", False),
            "trace_count": trace_summary.get("trace_count", 0),
            "decision_count": trace_summary.get("decision_count", 0),
            "summary": trace_summary.get("summary", ""),
        },
        "privacy_signals": grounding["privacy_signals"],
    }

    gaps: List[str] = []
    if not grounding["biography_available"]:
        gaps.append(
            "Full autobiography has not been finalized yet; this draft uses provisional interview grounding."
        )
    if not graph_signals.get("available"):
        gaps.append("Relationship/cognitive graph has not been built or has no graph data yet.")
    if trace_summary.get("decision_count", 0) == 0:
        gaps.append("No downstream Rewind decisions have been recorded yet.")

    payload = {
        "user_id": user_id,
        "generated_at": _utc_now_iso(),
        "status": "draft" if gaps else "ready",
        "stale": False,
        "stale_reason": None,
        "stale_at": None,
        "confidence": _confidence(evidence),
        "evidence": evidence,
        "formulation": {
            "grounding_summary": _compact(grounding_text),
            "relationship_focus": _relationship_focus(graph_signals),
            "decision_policy_hypotheses": _trace_hypotheses(trace_summary),
            "likely_pressure_points": _pressure_points(graph_signals, trace_summary),
            "simulation_guidance": [
                "Use natural scenarios rather than questionnaires.",
                "Convert each hypothesis into a real-memory prompt before treating it as user-specific.",
                "Prefer high-stakes but everyday decisions involving obligations, limited resources, and uncertainty.",
                "Keep names, exact locations, and contact details generalized unless essential for the simulation.",
            ],
            "privacy_boundary": (
                "This formulation is a draft synthesis for reflection and simulation. It should not be used as a clinical diagnosis, "
                "and simulation-derived patterns must be confirmed in conversation before being written into biography or user portrait."
            ),
        },
        "gaps": gaps,
    }

    snapshot_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    snapshot_payload = {"snapshot_id": snapshot_id, **payload}
    _write_json(_snapshots_dir(user_id) / f"{snapshot_id}.json", snapshot_payload)
    _write_json(_current_file(user_id), snapshot_payload)
    return snapshot_payload


def get_current_mental_model_formulation(user_id: str) -> Optional[Dict[str, Any]]:
    payload = _read_json(_current_file(user_id))
    if not payload:
        return None

    evidence = payload.setdefault("evidence", {})
    if "privacy_signals" not in evidence:
        try:
            evidence["privacy_signals"] = load_grounding_evidence(user_id)["privacy_signals"]
        except Exception:
            evidence["privacy_signals"] = {
                "available": False,
                "risk_level": "none",
                "labels": [],
                "policy": "Sensitive-content labels are count-only; matched source text is not stored.",
            }
        _write_json(_current_file(user_id), payload)

    return payload


def mark_mental_model_stale(user_id: str, reason: str) -> Optional[Dict[str, Any]]:
    """Mark the current formulation stale after new evidence arrives."""
    payload = _read_json(_current_file(user_id))
    if not payload:
        return None

    payload["status"] = "stale"
    payload["stale"] = True
    payload["stale_reason"] = reason
    payload["stale_at"] = _utc_now_iso()

    gaps = payload.get("gaps")
    if not isinstance(gaps, list):
        gaps = []
    stale_gap = f"Model should be rebuilt: {reason}"
    if stale_gap not in gaps:
        gaps.insert(0, stale_gap)
    payload["gaps"] = gaps

    _write_json(_current_file(user_id), payload)
    return payload


def try_mark_mental_model_stale(user_id: str, reason: str) -> Dict[str, Any]:
    """Best-effort stale marker that never blocks the primary write path."""
    try:
        payload = mark_mental_model_stale(user_id, reason)
        return {
            "marked": payload is not None,
            "warning": None,
        }
    except Exception as exc:
        return {
            "marked": False,
            "warning": f"Formulation stale marker failed: {exc}",
        }
