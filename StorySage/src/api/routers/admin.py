import os
import shutil
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.orm import Session

from database.database import engine, get_db
from database.models import (
    DBDataCollectionEvent,
    DBExperienceFeedback,
    DBMessage,
    DBSession,
    DBSimulationTrace,
    DBUser,
    DBUserProfile,
)
from api.services.clone_similarity import build_clone_replay_for_record
from api.services.trace_analysis import analyze_trace_record


router = APIRouter(tags=["admin"], prefix="/admin")


DATA_REQUIREMENT_COVERAGE: List[Dict[str, Any]] = [
    {
        "key": "participant_profile",
        "label": "A. Participant / group assignment",
        "status": "collected",
        "source": "Registration and user profile",
        "notes": "Uses pseudonymous user_id and study group. Demographics are intentionally not collected in the demo.",
    },
    {
        "key": "autobiographical_interview",
        "label": "B. Autobiographical interview",
        "status": "partial",
        "source": "StorySage interview messages and biography draft",
        "notes": "Raw messages exist for the app flow, but admin only exposes counts. Structured emotion/value labels are not forced.",
    },
    {
        "key": "decision_episode",
        "label": "C. Decision episodes",
        "status": "derived_later",
        "source": "Biography / mental model pipeline",
        "notes": "Useful for analysis, but should be derived from reviewed interview summaries rather than requiring more UI now.",
    },
    {
        "key": "relationship_graph",
        "label": "D. Relationship graph",
        "status": "partial",
        "source": "Graph rebuild / MiroFish-compatible signals",
        "notes": "Graph availability is tracked, but public MiroFish sync is still a backend deployment dependency.",
    },
    {
        "key": "user_correction",
        "label": "E. User correction / review",
        "status": "defer",
        "source": "Not collected",
        "notes": "Needs explicit user-facing review UI and consent; not added silently.",
    },
    {
        "key": "decision_formulation",
        "label": "F. Decision formulation",
        "status": "partial",
        "source": "Mental model formulation endpoint",
        "notes": "Status and evidence availability are tracked; user approval should wait for a correction/review UI.",
    },
    {
        "key": "card_scenario",
        "label": "G. Card scenario metadata",
        "status": "collected",
        "source": "simulation-test deck and trace payload",
        "notes": "Card ids, domains, risk, decision types, target meters, and failure modes are available from traces.",
    },
    {
        "key": "run_choice_logs",
        "label": "H/L. Run 1 and Run 2 choice logs",
        "status": "collected",
        "source": "simulation-test trace ingest",
        "notes": "Choice direction, card id, state before/after, response timing, and run counts are stored as privacy-safe traces.",
    },
    {
        "key": "unchosen_option",
        "label": "I. Meaningful unchosen option",
        "status": "partial",
        "source": "Clone reflection payload",
        "notes": "Experiment group records representative mismatches and counterfactual targets, not a separate required survey.",
    },
    {
        "key": "possible_self",
        "label": "J. Possible-self / counterfactual trajectory",
        "status": "partial",
        "source": "Clone reflection payload",
        "notes": "Stored when clone replay/reflection is saved. Framed as reflective artifact, not prediction.",
    },
    {
        "key": "reflection_output",
        "label": "K. Reflection output",
        "status": "collected",
        "source": "simulation-test trace payload",
        "notes": "Tracks self, general AI, and clone reflection presence; admin avoids showing full free-text by default.",
    },
    {
        "key": "held_out_prediction",
        "label": "M/P/Q. Prediction, blinded task, ablations",
        "status": "partial",
        "source": "Three-group condition assignment",
        "notes": (
            "Ablation-style comparison is available through Group 1 self reflection, "
            "Group 2 generic AI reflection, and Group 3 RewindAI clone reflection. "
            "Held-out prediction and blinded discrimination remain separate optional study tasks."
        ),
    },
    {
        "key": "comparison_summary",
        "label": "N. Run-to-run comparison summary",
        "status": "collected",
        "source": "Admin aggregate analysis",
        "notes": "Admin summarizes completion, reflection coverage, clone similarity, risk/failure categories, and run friction.",
    },
    {
        "key": "survey_feedback",
        "label": "O. Survey / qualitative feedback",
        "status": "partial",
        "source": "Anonymous experience feedback",
        "notes": "Only anonymous experience feedback is collected today. Formal Likert surveys would need UI and consent wording.",
    },
    {
        "key": "privacy_safety_logs",
        "label": "R. Privacy / safety logs",
        "status": "partial",
        "source": "Privacy scanners and collection event log",
        "notes": "Trace privacy risk level and collection events are tracked; deletion workflow is not implemented yet.",
    },
    {
        "key": "system_performance",
        "label": "S. System performance",
        "status": "partial",
        "source": "Runtime health and collection events",
        "notes": "Completion/dropoff can be inferred. Detailed token/cost metrics should be added at model gateway later.",
    },
]


def _increment(counter: Dict[str, int], key: Any, amount: int = 1) -> None:
    safe_key = str(key or "unknown")
    counter[safe_key] = counter.get(safe_key, 0) + amount


def _top_items(counter: Dict[str, int], limit: int = 8) -> List[Dict[str, Any]]:
    return [
        {"key": key, "count": value}
        for key, value in sorted(counter.items(), key=lambda item: item[1], reverse=True)[:limit]
    ]


def _negative_impact(item: Dict[str, Any]) -> int:
    effects = item.get("effects") if isinstance(item.get("effects"), dict) else {}
    return int(sum(abs(value) for value in effects.values() if isinstance(value, (int, float)) and value < 0))


def _metadata_value(event: DBDataCollectionEvent, key: str) -> Any:
    metadata = event.metadata_json if isinstance(event.metadata_json, dict) else {}
    return metadata.get(key)


def _data_root() -> str:
    return os.getenv("DATA_DIR", "data")


def _safe_path_part(value: str) -> str:
    return "".join(ch if ch.isalnum() or ch in {"-", "_", "."} else "_" for ch in value)[:160]


def _ensure_optional_admin_tables() -> None:
    DBDataCollectionEvent.__table__.create(bind=engine, checkfirst=True)
    DBExperienceFeedback.__table__.create(bind=engine, checkfirst=True)


def _require_admin_token(
    x_rewindai_admin_token: str | None = Header(default=None),
    admin_token: str | None = Query(default=None),
) -> None:
    expected = os.getenv("REWINDAI_ADMIN_TOKEN", "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Admin token is not configured.")
    supplied = (x_rewindai_admin_token or admin_token or "").strip()
    if supplied != expected:
        raise HTTPException(status_code=403, detail="Invalid admin token.")


def _compact_trace(row: DBSimulationTrace) -> Dict[str, Any]:
    payload = row.payload if isinstance(row.payload, dict) else {}
    record = payload.get("record") if isinstance(payload.get("record"), dict) else {}
    analysis = payload.get("analysis") if isinstance(payload.get("analysis"), dict) else {}
    reflection_analysis = analysis.get("reflection") if isinstance(analysis.get("reflection"), dict) else {}
    final_state = record.get("finalState") if isinstance(record.get("finalState"), dict) else {}
    history = record.get("history") if isinstance(record.get("history"), list) else []
    reflection = record.get("reflection") if isinstance(record.get("reflection"), dict) else None
    clone_replay = (
        reflection_analysis.get("clone_replay")
        if isinstance(reflection_analysis.get("clone_replay"), dict)
        else
        reflection.get("clone_replay")
        if isinstance(reflection, dict) and isinstance(reflection.get("clone_replay"), dict)
        else {}
    )
    mismatch_categories = (
        clone_replay.get("mismatch_categories")
        if isinstance(clone_replay.get("mismatch_categories"), dict)
        else {}
    )
    meters = final_state.get("meters") if isinstance(final_state.get("meters"), dict) else {}
    lowest_meter = min(meters.values()) if meters else final_state.get("lowestMeter")
    high_risk_count = 0
    negative_impact = 0
    response_times: List[float] = []
    decision_type_counts: Dict[str, int] = {}
    risk_level_counts: Dict[str, int] = {}
    failure_mode_counts: Dict[str, int] = {}
    target_meter_counts: Dict[str, int] = {}
    for item in history:
        if not isinstance(item, dict):
            continue
        if item.get("riskLevel") == "high":
            high_risk_count += 1
        response_time = item.get("responseTimeMs")
        if isinstance(response_time, (int, float)) and response_time >= 0:
            response_times.append(float(response_time) / 1000)
        negative_impact += _negative_impact(item)
        _increment(decision_type_counts, item.get("decisionType"))
        _increment(risk_level_counts, item.get("riskLevel"))
        _increment(target_meter_counts, item.get("targetMeter"))
        failure_modes = item.get("failureModes") if isinstance(item.get("failureModes"), list) else []
        for mode in failure_modes:
            _increment(failure_mode_counts, mode)
    return {
        "source": row.source,
        "session_id": row.session_id,
        "updated_at": row.updated_at,
        "received_at": row.received_at.isoformat() if row.received_at else None,
        "decisions": row.decisions,
        "ended": row.ended,
        "run_number": analysis.get("run_number") or record.get("runNumber") or record.get("run_number"),
        "language": record.get("language"),
        "ending": final_state.get("ending") or final_state.get("endingCause"),
        "lowest_meter": analysis.get("lowest_meter_value") or lowest_meter,
        "lowest_meter_name": analysis.get("lowest_meter"),
        "final_meters": meters,
        "high_risk_count": high_risk_count,
        "negative_impact": analysis.get("negative_impact_total", negative_impact),
        "negative_per_decision": analysis.get("negative_per_decision", round(negative_impact / max(1, len(history)), 2)),
        "avg_response_time_sec": analysis.get("avg_response_time_sec", round(sum(response_times) / len(response_times), 2) if response_times else None),
        "decision_type_counts": (analysis.get("patterns") or {}).get("decision_types", decision_type_counts),
        "risk_level_counts": (analysis.get("patterns") or {}).get("risk_levels", risk_level_counts),
        "failure_mode_counts": (analysis.get("patterns") or {}).get("failure_modes", failure_mode_counts),
        "target_meter_counts": (analysis.get("patterns") or {}).get("target_meters", target_meter_counts),
        "card_domain_counts": (analysis.get("patterns") or {}).get("card_domains", {}),
        "has_reflection": reflection is not None,
        "reflection_type": reflection.get("simulation_role") if isinstance(reflection, dict) else None,
        "clone_similarity_percent": reflection_analysis.get("clone_similarity_percent", clone_replay.get("similarity_percent")),
        "clone_matched_choices": reflection_analysis.get("clone_matched_choices", clone_replay.get("matched_choices")),
        "clone_total_questions": reflection_analysis.get("clone_total_questions", clone_replay.get("total_questions")),
        "clone_mismatch_categories": mismatch_categories,
        "has_self_reflection": isinstance(record.get("selfReflection"), dict),
        "has_general_reflection": isinstance(record.get("generalReflection"), dict),
        "analysis_schema": analysis.get("schema_version"),
        "recent_cards": [
            {
                "card_id": item.get("cardId"),
                "card_domain": item.get("cardDomain"),
                "card_prompt": item.get("cardPrompt") or item.get("cardPromptZh"),
                "decision_type": item.get("decisionType"),
                "risk_level": item.get("riskLevel"),
                "target_meter": item.get("targetMeter"),
                "direction": item.get("direction"),
                "choice": item.get("optionText") or item.get("optionTextZh"),
                "outcome": item.get("outcomeLabel") or item.get("outcomeLabelZh"),
                "effects": item.get("effects") if isinstance(item.get("effects"), dict) else {},
                "failure_modes": item.get("failureModes") if isinstance(item.get("failureModes"), list) else [],
            }
            for item in history[-12:]
            if isinstance(item, dict)
        ],
    }


def _ensure_clone_similarity(row: DBSimulationTrace, db: Session) -> None:
    payload = row.payload if isinstance(row.payload, dict) else {}
    record = payload.get("record") if isinstance(payload.get("record"), dict) else {}
    analysis = payload.get("analysis") if isinstance(payload.get("analysis"), dict) else {}
    reflection_analysis = analysis.get("reflection") if isinstance(analysis.get("reflection"), dict) else {}
    if reflection_analysis.get("clone_similarity_percent") is not None:
        return
    if not isinstance(record.get("history"), list) or not record.get("history"):
        return

    try:
        reflection = record.get("reflection") if isinstance(record.get("reflection"), dict) else {}
        if not isinstance(reflection.get("clone_replay"), dict):
            clone_replay = build_clone_replay_for_record(row.user_id, record)
            if not clone_replay:
                return
            reflection["clone_replay"] = clone_replay
            reflection.setdefault("simulation_role", "admin_backfilled_clone_replay")
            reflection.setdefault("evidence_boundary", "tentative_same_question_choice_agreement")
            record["reflection"] = reflection
        payload["record"] = record
        payload["analysis"] = analyze_trace_record(record)
        row.payload = payload
        db.add(row)
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"clone similarity backfill failed: {exc.__class__.__name__}")


def _latest_clone_similarity(trace_rows: List[DBSimulationTrace]) -> int | None:
    for row in trace_rows:
        value = _compact_trace(row).get("clone_similarity_percent")
        if isinstance(value, (int, float)):
            return int(value)
    return None


def _flatten_mismatch_categories(value: Any) -> Dict[str, int]:
    if not isinstance(value, dict):
        return {}

    flat: Dict[str, int] = {}
    for category, count_or_group in value.items():
        if isinstance(count_or_group, int):
            _increment(flat, category, count_or_group)
        elif isinstance(count_or_group, dict):
            for key, count in count_or_group.items():
                if isinstance(count, int):
                    label = f"{category}:{key}"
                    _increment(flat, label, count)
    return flat


def _participant_stage(
    *,
    study_group: str,
    interview_messages: int,
    simulation_runs: int,
    trace_rows: List[DBSimulationTrace],
) -> str:
    compact_runs = [_compact_trace(row) for row in trace_rows]
    if study_group == "anonymous":
        return "anonymous_experience"
    if study_group == "experiment" and interview_messages == 0:
        return "needs_interview"
    if simulation_runs == 0:
        return "needs_first_game"
    if study_group == "blank":
        return "ready_for_second_game" if any(run.get("has_self_reflection") for run in compact_runs) else "needs_self_reflection"
    if study_group == "contrast":
        return "ready_for_second_game" if any(run.get("has_general_reflection") for run in compact_runs) else "needs_general_reflection"
    if any(run.get("has_reflection") for run in compact_runs):
        return "ready_for_second_game"
    return "needs_clone_reflection"


@router.get("/participants", dependencies=[Depends(_require_admin_token)])
async def list_participants(
    db: Session = Depends(get_db),
    backfill_clone_similarity: bool = Query(default=False),
) -> Dict[str, Any]:
    users = db.query(DBUser).order_by(DBUser.created_at.desc()).limit(500).all()
    participants: List[Dict[str, Any]] = []
    group_counts: Dict[str, int] = {"blank": 0, "contrast": 0, "experiment": 0, "anonymous": 0}
    stage_counts: Dict[str, int] = {}
    group_completed: Dict[str, int] = {"blank": 0, "contrast": 0, "experiment": 0}
    group_reflected: Dict[str, int] = {"blank": 0, "contrast": 0, "experiment": 0}
    clone_similarity_values: List[int] = []
    mismatch_counter: Dict[str, int] = {}
    decision_type_counter: Dict[str, int] = {}
    risk_level_counter: Dict[str, int] = {}
    failure_mode_counter: Dict[str, int] = {}
    target_meter_counter: Dict[str, int] = {}
    collection_event_type_counter: Dict[str, int] = {}
    collection_category_counter: Dict[str, int] = {}
    collection_group_counter: Dict[str, int] = {}
    collection_privacy_risk_counter: Dict[str, int] = {}
    negative_per_decision_values: List[float] = []
    high_risk_rates: List[float] = []
    feedback_count = 0
    anonymous_feedback_count = 0
    user_event_counts: Dict[str, int] = {}

    try:
        collection_events = (
            db.query(DBDataCollectionEvent)
            .order_by(DBDataCollectionEvent.created_at.desc())
            .limit(2000)
            .all()
        )
    except (OperationalError, SQLAlchemyError):
        db.rollback()
        collection_events = []

    for event in collection_events:
        _increment(collection_event_type_counter, event.event_type, event.count or 1)
        _increment(collection_category_counter, event.data_category, event.count or 1)
        _increment(collection_group_counter, event.study_group, 1)
        user_event_counts[event.user_id] = user_event_counts.get(event.user_id, 0) + 1
        privacy_risk = _metadata_value(event, "privacy_risk_level")
        if privacy_risk:
            _increment(collection_privacy_risk_counter, privacy_risk)

    for user in users:
        profile = (
            db.query(DBUserProfile)
            .filter(DBUserProfile.user_id == user.user_id)
            .first()
        )
        study_group = profile.study_group if profile else "experiment"
        group_counts[study_group] = group_counts.get(study_group, 0) + 1
        session_ids = [
            row[0]
            for row in db.query(DBSession.id)
            .filter(DBSession.user_id == user.user_id)
            .all()
        ]
        message_count = (
            db.query(func.count(DBMessage.id))
            .filter(DBMessage.session_id.in_(session_ids))
            .scalar()
            if session_ids
            else 0
        )
        trace_rows = (
            db.query(DBSimulationTrace)
            .filter(DBSimulationTrace.user_id == user.user_id)
            .order_by(DBSimulationTrace.received_at.desc())
            .limit(5)
            .all()
        )
        if study_group == "experiment" and backfill_clone_similarity:
            for row in trace_rows:
                _ensure_clone_similarity(row, db)
        compact_runs = [_compact_trace(row) for row in trace_rows]
        total_trace_count = (
            db.query(func.count(DBSimulationTrace.id))
            .filter(DBSimulationTrace.user_id == user.user_id)
            .scalar()
            or 0
        )
        total_decisions = (
            db.query(func.coalesce(func.sum(DBSimulationTrace.decisions), 0))
            .filter(DBSimulationTrace.user_id == user.user_id)
            .scalar()
            or 0
        )
        try:
            user_feedback_rows = (
                db.query(DBExperienceFeedback)
                .filter(DBExperienceFeedback.user_id == user.user_id)
                .order_by(DBExperienceFeedback.created_at.desc())
                .limit(3)
                .all()
            )
            user_feedback_count = (
                db.query(func.count(DBExperienceFeedback.id))
                .filter(DBExperienceFeedback.user_id == user.user_id)
                .scalar()
                or 0
            )
        except Exception:
            db.rollback()
            user_feedback_count = 0
            user_feedback_rows = []
        feedback_count += int(user_feedback_count)
        if study_group == "anonymous":
            anonymous_feedback_count += int(user_feedback_count)
        stage = _participant_stage(
            study_group=study_group,
            interview_messages=int(message_count or 0),
            simulation_runs=int(total_trace_count),
            trace_rows=trace_rows,
        )
        stage_counts[stage] = stage_counts.get(stage, 0) + 1
        contributes_to_analysis = study_group in {"blank", "contrast", "experiment"}
        if total_trace_count and contributes_to_analysis:
            group_completed[study_group] = group_completed.get(study_group, 0) + 1
        if contributes_to_analysis and any(
            run.get("has_reflection")
            or run.get("has_self_reflection")
            or run.get("has_general_reflection")
            for run in compact_runs
        ):
            group_reflected[study_group] = group_reflected.get(study_group, 0) + 1
        latest_similarity = _latest_clone_similarity(trace_rows)
        if latest_similarity is not None and contributes_to_analysis:
            clone_similarity_values.append(latest_similarity)
        for run in compact_runs if contributes_to_analysis else []:
            decisions = int(run.get("decisions") or 0)
            if decisions:
                negative_per_decision_values.append(float(run.get("negative_per_decision") or 0))
                high_risk_rates.append(float(run.get("high_risk_count") or 0) / decisions)
            for key, value in _flatten_mismatch_categories(run.get("clone_mismatch_categories")).items():
                _increment(mismatch_counter, key, value)
            for key, value in (run.get("decision_type_counts") or {}).items():
                if isinstance(value, int):
                    _increment(decision_type_counter, key, value)
            for key, value in (run.get("risk_level_counts") or {}).items():
                if isinstance(value, int):
                    _increment(risk_level_counter, key, value)
            for key, value in (run.get("failure_mode_counts") or {}).items():
                if isinstance(value, int):
                    _increment(failure_mode_counter, key, value)
            for key, value in (run.get("target_meter_counts") or {}).items():
                if isinstance(value, int):
                    _increment(target_meter_counter, key, value)
        participants.append(
            {
                "user_id": user.user_id,
                "study_group": study_group,
                "created_at": user.created_at.isoformat() if user.created_at else None,
                "interview_sessions": len(session_ids),
                "interview_messages": int(message_count or 0),
                "simulation_runs": int(total_trace_count),
                "simulation_decisions": int(total_decisions),
                "latest_clone_similarity_percent": latest_similarity,
                "collection_stage": stage,
                "experience_feedback_count": int(user_feedback_count),
                "recent_feedback": [
                    {
                        "id": feedback.id,
                        "rating": feedback.rating,
                        "page_context": feedback.page_context,
                        "feedback": feedback.feedback[:500],
                        "created_at": feedback.created_at.isoformat() if feedback.created_at else None,
                    }
                    for feedback in user_feedback_rows
                ],
                "collection_event_count": int(user_event_counts.get(user.user_id, 0)),
                "recent_runs": compact_runs,
            }
        )
    avg_clone_similarity = (
        round(sum(clone_similarity_values) / len(clone_similarity_values), 1)
        if clone_similarity_values
        else None
    )
    group_completion_rates = {
        group: round(group_completed.get(group, 0) / max(1, count), 3)
        for group, count in group_counts.items()
    }
    group_reflection_rates = {
        group: round(group_reflected.get(group, 0) / max(1, count), 3)
        for group, count in group_counts.items()
    }

    return {
        "ok": True,
        "count": len(participants),
        "summary": {
            "participants": len(participants),
            "group_counts": group_counts,
            "stage_counts": stage_counts,
            "simulation_runs": sum(item["simulation_runs"] for item in participants),
            "simulation_decisions": sum(item["simulation_decisions"] for item in participants),
            "interview_messages": sum(item["interview_messages"] for item in participants),
            "experience_feedback_count": feedback_count,
            "anonymous_feedback_count": anonymous_feedback_count,
            "data_collection": {
                "event_count": len(collection_events),
                "event_types": _top_items(collection_event_type_counter, limit=12),
                "categories": _top_items(collection_category_counter, limit=12),
                "groups": _top_items(collection_group_counter, limit=8),
                "privacy_risk_levels": _top_items(collection_privacy_risk_counter, limit=8),
                "coverage": DATA_REQUIREMENT_COVERAGE,
                "recommendation": (
                    "Collect compact behavioral traces, reflection status, feedback, and privacy events now. "
                    "Use the existing three-group design for ablation-style condition comparison. "
                    "Defer demographics, held-out prediction, blinded discrimination, and detailed correction logs "
                    "until the study protocol and user-facing consent/review UI are ready."
                ),
            },
            "analysis": {
                "group_completion_rates": group_completion_rates,
                "group_reflection_rates": group_reflection_rates,
                "clone_similarity": {
                    "count": len(clone_similarity_values),
                    "average_percent": avg_clone_similarity,
                    "min_percent": min(clone_similarity_values) if clone_similarity_values else None,
                    "max_percent": max(clone_similarity_values) if clone_similarity_values else None,
                },
                "average_negative_per_decision": (
                    round(sum(negative_per_decision_values) / len(negative_per_decision_values), 2)
                    if negative_per_decision_values
                    else None
                ),
                "average_high_risk_rate": (
                    round(sum(high_risk_rates) / len(high_risk_rates), 3)
                    if high_risk_rates
                    else None
                ),
                "top_clone_mismatch_categories": _top_items(mismatch_counter),
                "top_decision_types": _top_items(decision_type_counter),
                "risk_level_distribution": _top_items(risk_level_counter),
                "top_failure_modes": _top_items(failure_mode_counter),
                "top_target_meters": _top_items(target_meter_counter),
            },
        },
        "participants": participants,
    }


@router.get("/participants/{user_id}", dependencies=[Depends(_require_admin_token)])
async def get_participant(
    user_id: str,
    db: Session = Depends(get_db),
    backfill_clone_similarity: bool = Query(default=False),
) -> Dict[str, Any]:
    user = db.query(DBUser).filter(DBUser.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Participant not found.")

    profile = (
        db.query(DBUserProfile)
        .filter(DBUserProfile.user_id == user_id)
        .first()
    )
    trace_rows = (
        db.query(DBSimulationTrace)
        .filter(DBSimulationTrace.user_id == user_id)
        .order_by(DBSimulationTrace.received_at.desc())
        .limit(25)
        .all()
    )
    study_group = profile.study_group if profile else "experiment"
    if study_group == "experiment" and backfill_clone_similarity:
        for row in trace_rows:
            _ensure_clone_similarity(row, db)
    sessions = (
        db.query(DBSession)
        .filter(DBSession.user_id == user_id)
        .order_by(DBSession.created_at.desc())
        .limit(10)
        .all()
    )
    try:
        collection_events = (
            db.query(DBDataCollectionEvent)
            .filter(DBDataCollectionEvent.user_id == user_id)
            .order_by(DBDataCollectionEvent.created_at.desc())
            .limit(50)
            .all()
        )
    except (OperationalError, SQLAlchemyError):
        db.rollback()
        collection_events = []
    return {
        "ok": True,
        "participant": {
            "user_id": user.user_id,
            "study_group": profile.study_group if profile else "experiment",
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "interview_sessions": [
                {
                    "session_id": session.id,
                    "seq_id": session.seq_id,
                    "created_at": session.created_at.isoformat() if session.created_at else None,
                    "message_count": db.query(func.count(DBMessage.id))
                    .filter(DBMessage.session_id == session.id)
                    .scalar()
                    or 0,
                }
                for session in sessions
            ],
            "simulation_runs": [_compact_trace(row) for row in trace_rows],
            "collection_events": [
                {
                    "event_type": event.event_type,
                    "data_category": event.data_category,
                    "source": event.source,
                    "session_id": event.session_id,
                    "count": event.count,
                    "created_at": event.created_at.isoformat() if event.created_at else None,
                    "metadata": event.metadata_json if isinstance(event.metadata_json, dict) else {},
                }
                for event in collection_events
            ],
        },
    }


@router.delete("/participants/{user_id}/traces/{session_id}", dependencies=[Depends(_require_admin_token)])
async def delete_participant_trace(
    user_id: str,
    session_id: str,
    source: str = Query(default="simulation-test"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    _ensure_optional_admin_tables()
    user = db.query(DBUser).filter(DBUser.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Participant not found.")

    deleted = (
        db.query(DBSimulationTrace)
        .filter(
            DBSimulationTrace.user_id == user_id,
            DBSimulationTrace.session_id == session_id,
            DBSimulationTrace.source == source,
        )
        .delete(synchronize_session=False)
    )
    (
        db.query(DBDataCollectionEvent)
        .filter(
            DBDataCollectionEvent.user_id == user_id,
            DBDataCollectionEvent.session_id == session_id,
            DBDataCollectionEvent.source == source,
        )
        .delete(synchronize_session=False)
    )
    db.commit()

    trace_file = os.path.join(
        _data_root(),
        _safe_path_part(user_id),
        "simulation_traces",
        f"{_safe_path_part(source)}-{_safe_path_part(session_id)}.json",
    )
    if os.path.exists(trace_file):
        try:
            os.remove(trace_file)
        except OSError:
            pass

    return {
        "ok": True,
        "deleted_traces": int(deleted or 0),
        "user_id": user_id,
        "session_id": session_id,
        "source": source,
    }


@router.delete("/participants/{user_id}", dependencies=[Depends(_require_admin_token)])
async def delete_participant(
    user_id: str,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    _ensure_optional_admin_tables()
    user = db.query(DBUser).filter(DBUser.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Participant not found.")

    session_ids = [
        row[0]
        for row in db.query(DBSession.id)
        .filter(DBSession.user_id == user_id)
        .all()
    ]
    deleted_messages = 0
    if session_ids:
        deleted_messages = (
            db.query(DBMessage)
            .filter(DBMessage.session_id.in_(session_ids))
            .delete(synchronize_session=False)
        )
    deleted_sessions = (
        db.query(DBSession)
        .filter(DBSession.user_id == user_id)
        .delete(synchronize_session=False)
    )
    deleted_traces = (
        db.query(DBSimulationTrace)
        .filter(DBSimulationTrace.user_id == user_id)
        .delete(synchronize_session=False)
    )
    deleted_feedback = (
        db.query(DBExperienceFeedback)
        .filter(DBExperienceFeedback.user_id == user_id)
        .delete(synchronize_session=False)
    )
    deleted_events = (
        db.query(DBDataCollectionEvent)
        .filter(DBDataCollectionEvent.user_id == user_id)
        .delete(synchronize_session=False)
    )
    db.query(DBUserProfile).filter(DBUserProfile.user_id == user_id).delete(synchronize_session=False)
    db.delete(user)
    db.commit()

    user_dir = os.path.join(_data_root(), _safe_path_part(user_id))
    files_deleted = False
    if os.path.isdir(user_dir):
        try:
            shutil.rmtree(user_dir)
            files_deleted = True
        except OSError:
            files_deleted = False

    return {
        "ok": True,
        "user_id": user_id,
        "deleted": {
            "messages": int(deleted_messages or 0),
            "sessions": int(deleted_sessions or 0),
            "simulation_traces": int(deleted_traces or 0),
            "experience_feedback": int(deleted_feedback or 0),
            "collection_events": int(deleted_events or 0),
            "files_deleted": files_deleted,
        },
    }


@router.delete("/participants", dependencies=[Depends(_require_admin_token)])
async def delete_all_participants(
    confirm: str = Query(default=""),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Delete all study/demo records. Intended for clearing test data only."""
    if confirm.strip() != "REWINDAI_CLEAR_ALL":
        raise HTTPException(
            status_code=400,
            detail="Confirmation token mismatch. Pass confirm=REWINDAI_CLEAR_ALL.",
        )

    _ensure_optional_admin_tables()
    user_count = db.query(DBUser).count()
    deleted_messages = db.query(DBMessage).delete(synchronize_session=False)
    deleted_sessions = db.query(DBSession).delete(synchronize_session=False)
    deleted_traces = db.query(DBSimulationTrace).delete(synchronize_session=False)
    deleted_feedback = db.query(DBExperienceFeedback).delete(synchronize_session=False)
    deleted_events = db.query(DBDataCollectionEvent).delete(synchronize_session=False)
    deleted_profiles = db.query(DBUserProfile).delete(synchronize_session=False)
    deleted_users = db.query(DBUser).delete(synchronize_session=False)
    db.commit()

    files_deleted = 0
    data_root = _data_root()
    if os.path.isdir(data_root):
        for name in os.listdir(data_root):
            path = os.path.join(data_root, name)
            if not os.path.isdir(path):
                continue
            try:
                shutil.rmtree(path)
                files_deleted += 1
            except OSError:
                pass

    return {
        "ok": True,
        "deleted": {
            "users": int(deleted_users or 0),
            "profiles": int(deleted_profiles or 0),
            "messages": int(deleted_messages or 0),
            "sessions": int(deleted_sessions or 0),
            "simulation_traces": int(deleted_traces or 0),
            "experience_feedback": int(deleted_feedback or 0),
            "collection_events": int(deleted_events or 0),
            "data_directories": files_deleted,
        },
        "before": {
            "users": int(user_count or 0),
        },
    }
