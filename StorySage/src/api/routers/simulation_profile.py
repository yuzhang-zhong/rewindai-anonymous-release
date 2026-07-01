import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field

from api.core.auth import create_scoped_token, get_current_user, get_payload_from_token, get_user_from_token
from api.core.errors import internal_server_error, sanitize_public_error_text
from api.services.biography_text import extract_biography_text
from api.services.clone_similarity import build_clone_replay_for_record
from api.services.data_collection import record_data_collection_event
from api.services.graph_signals import graph_constraints_for_simulation, load_graph_signals
from api.services.mental_model import get_current_mental_model_formulation, try_mark_mental_model_stale
from api.services.privacy import (
    PRIVACY_SAFE_GROUNDING_POLICY,
    classify_sensitive_payload,
    classify_sensitive_content,
    sanitize_privacy_safe_payload,
    sanitize_privacy_safe_text,
)
from api.services.simulation_traces import load_simulation_trace_summary, save_simulation_trace_sql
from api.services.trace_analysis import analyze_trace_record
from api.services.user_profile import load_user_profile, normalize_study_group
from api.core.model_settings import get_user_model_settings
from utils.llm.engines import get_engine, invoke_engine


router = APIRouter(
    tags=["simulation"],
    prefix="/simulation",
)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="user/login")

TRACE_TOKEN_EXPIRE_HOURS = 24
TRACE_TOKEN_SCOPE = "simulation_trace"
MAX_TRACE_HISTORY_ITEMS = 80
REWINDAI_CONTRACT_VERSION = "1.0"
GROUNDING_PROTOCOL = "rewindai.grounding"
SIMULATION_TEST_HANDOFF_PROTOCOL = "rewindai.simulation_test_handoff"
TRACE_PROTOCOL = "rewindai.trace"


class RewindAIContract(BaseModel):
    protocol: str = Field(..., max_length=80)
    version: str = Field(..., max_length=32)
    source_module: Optional[str] = Field(None, max_length=80)
    target_module: Optional[str] = Field(None, max_length=80)
    created_at: Optional[str] = Field(None, max_length=80)
    privacy_level: Optional[str] = Field(None, max_length=80)


class SimulationTraceRecord(BaseModel):
    sessionId: str = Field(..., max_length=128)
    rulerName: str = Field(..., max_length=128)
    language: str = Field(..., max_length=8)
    startedAt: str = Field(..., max_length=80)
    updatedAt: str = Field(..., max_length=80)
    initialSnapshot: Dict[str, Any]
    finalState: Dict[str, Any]
    history: List[Dict[str, Any]] = Field(default_factory=list)
    reflection: Optional[Dict[str, Any]] = None
    selfReflection: Optional[Dict[str, Any]] = None
    generalReflection: Optional[Dict[str, Any]] = None


class SimulationTraceRequest(BaseModel):
    trace_token: str
    source: str = Field("simulation-test", max_length=80)
    contract: Optional[RewindAIContract] = None
    record: SimulationTraceRecord


class GeneralReflectionRequest(BaseModel):
    trace_token: str
    language: str = Field("en", max_length=8)
    record: SimulationTraceRecord


class GeneralReflectionChatMessage(BaseModel):
    role: str = Field(..., max_length=16)
    content: str = Field(..., min_length=1, max_length=1200)


class GeneralReflectionChatRequest(BaseModel):
    messages: List[GeneralReflectionChatMessage] = Field(default_factory=list, max_length=16)
    language: str = Field("en", max_length=8)


class CloneReflectionChatRequest(BaseModel):
    messages: List[GeneralReflectionChatMessage] = Field(default_factory=list, max_length=16)
    language: str = Field("en", max_length=8)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _biography_to_text(biography: Dict[Any, Any]) -> str:
    return extract_biography_text(biography)


def _load_latest_biography(user_id: str) -> Dict[Any, Any] | None:
    data_dir = os.getenv("DATA_DIR")
    if not data_dir:
        raise HTTPException(status_code=500, detail="DATA_DIR environment variable not set")

    user_dir = os.path.join(data_dir, user_id)
    if not os.path.exists(user_dir):
        return None

    bio_files = [
        name
        for name in os.listdir(user_dir)
        if name.startswith("biography_") and name.endswith(".json")
    ]
    if not bio_files:
        return None

    latest_file = max(
        bio_files,
        key=lambda name: int(name.split("_")[1].split(".")[0]),
    )
    try:
        with open(os.path.join(user_dir, latest_file), "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:
        print(f"simulation profile biography read failed: {sanitize_public_error_text(exc)}")
        raise internal_server_error()


def _compact(text: str, max_chars: int) -> str:
    normalized = re.sub(r"\s+", " ", text).strip()
    if len(normalized) <= max_chars:
        return normalized
    return normalized[: max_chars - 3].rstrip() + "..."


def _create_trace_token(user_id: str) -> str:
    return create_scoped_token(
        user_id=user_id,
        scope=TRACE_TOKEN_SCOPE,
        expires_delta=timedelta(hours=TRACE_TOKEN_EXPIRE_HOURS),
    )


def _user_from_trace_token(token: str) -> str:
    try:
        return get_user_from_token(token, required_scope=TRACE_TOKEN_SCOPE)
    except HTTPException:
        raise HTTPException(status_code=401, detail="Invalid simulation trace token")


def _data_root() -> Path:
    return Path(os.getenv("DATA_DIR", "data"))


def _trace_dir(user_id: str) -> Path:
    return _data_root() / user_id / "simulation_traces"


def _safe_session_id(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]", "_", value)[:128] or "unknown-session"


def _trim_trace_record(record: SimulationTraceRecord) -> Dict[str, Any]:
    payload = record.model_dump() if hasattr(record, "model_dump") else record.dict()
    payload["history"] = payload.get("history", [])[-MAX_TRACE_HISTORY_ITEMS:]
    return payload


def _privacy_safe_trace_record(record: SimulationTraceRecord) -> Dict[str, Any]:
    """Trim and sanitize returned simulation traces before storing them."""
    return sanitize_privacy_safe_payload(_trim_trace_record(record))


def _grounding_contract(now: str) -> Dict[str, Any]:
    return {
        "protocol": GROUNDING_PROTOCOL,
        "version": REWINDAI_CONTRACT_VERSION,
        "source_module": "storysage",
        "target_module": "rewind-reigns",
        "created_at": now,
        "privacy_level": "privacy_safe_summary_only",
        "trace_return": {
            "protocol": TRACE_PROTOCOL,
            "version": REWINDAI_CONTRACT_VERSION,
            "source_module": "rewind-reigns",
            "target_module": "storysage",
        },
    }


def _simulation_test_handoff_contract(now: str) -> Dict[str, Any]:
    return {
        "protocol": SIMULATION_TEST_HANDOFF_PROTOCOL,
        "version": REWINDAI_CONTRACT_VERSION,
        "source_module": "storysage",
        "target_module": "simulation-test",
        "created_at": now,
        "privacy_level": "no_profile_context",
        "trace_return": {
            "protocol": TRACE_PROTOCOL,
            "version": REWINDAI_CONTRACT_VERSION,
            "source_module": "simulation-test",
            "target_module": "storysage",
        },
    }


def _validate_trace_contract(contract: Optional[RewindAIContract]) -> Dict[str, Any]:
    if contract is None:
        return {
            "accepted": True,
            "warning": "Trace contract metadata was not provided; accepted for backward compatibility.",
        }

    warnings: List[str] = []
    safe_protocol = sanitize_public_error_text(contract.protocol)
    safe_version = sanitize_public_error_text(contract.version)
    safe_source_module = sanitize_public_error_text(contract.source_module)
    safe_target_module = sanitize_public_error_text(contract.target_module)

    if contract.protocol != TRACE_PROTOCOL:
        raise HTTPException(status_code=400, detail=f"Unsupported trace protocol: {safe_protocol}")
    if contract.version != REWINDAI_CONTRACT_VERSION:
        warnings.append(
            f"Trace contract version {safe_version} differs from expected {REWINDAI_CONTRACT_VERSION}."
        )
    if contract.source_module and contract.source_module not in {"rewind-reigns", "simulation-test"}:
        warnings.append(f"Unexpected trace source module: {safe_source_module}.")
    if contract.target_module and contract.target_module != "storysage":
        warnings.append(f"Unexpected trace target module: {safe_target_module}.")

    return {
        "accepted": True,
        "protocol": safe_protocol,
        "version": safe_version,
        "warnings": warnings,
    }


def _top_pattern_keys(patterns: Dict[str, Any], name: str, limit: int = 4) -> List[str]:
    values = patterns.get(name) if isinstance(patterns, dict) else None
    if not isinstance(values, dict):
        return []
    return [
        str(key)
        for key, _value in sorted(
            values.items(),
            key=lambda item: item[1] if isinstance(item[1], (int, float)) else 0,
            reverse=True,
        )[:limit]
    ]


def _card_generation_guidance(
    graph_constraints: Dict[str, Any],
    mental_model_summary: Optional[Dict[str, Any]],
    trace_summary: Dict[str, Any],
    card_count: int = 20,
) -> Dict[str, Any]:
    patterns = trace_summary.get("patterns") if isinstance(trace_summary, dict) else {}
    if not isinstance(patterns, dict):
        patterns = {}

    target_meters = _top_pattern_keys(patterns, "target_meters")
    if not target_meters:
        target_meters = ["people", "military", "faith", "wealth"]

    risk_levels = _top_pattern_keys(patterns, "risk_levels")
    if not risk_levels:
        risk_levels = ["low", "medium", "high"]

    relationship_roles = graph_constraints.get("relationship_focus", [])
    if not isinstance(relationship_roles, list):
        relationship_roles = []

    relationship_tensions = list((graph_constraints.get("relation_types") or {}).keys())

    hypotheses: List[str] = []
    pressure_points: List[str] = []
    if mental_model_summary:
        hypotheses = mental_model_summary.get("decision_policy_hypotheses", []) or []
        pressure_points = mental_model_summary.get("likely_pressure_points", []) or []

    graph_quota = 0
    if graph_constraints.get("available"):
        graph_quota = max(3, round(card_count * 0.35))

    safety_rules = [
        "Turn each guidance item into events, not questionnaires.",
        "Treat simulation traces as tentative evidence.",
        "After the first playthrough, replay the exact same cards with the clone and calculate human-clone choice agreement as a similarity score.",
        "Use clone mismatches as reflection targets for the second run; do not treat the clone as an answer key or personalized card generator.",
        "Do not label, diagnose, or expose raw biography/graph data.",
        "Balance grounded cards with ordinary campus-life choices.",
    ]

    return {
        "version": REWINDAI_CONTRACT_VERSION,
        "card_count": card_count,
        "graph_pressure_card_quota": graph_quota,
        "relationship_roles": relationship_roles[:8],
        "relationship_tensions": relationship_tensions[:8],
        "decision_policy_incidents": hypotheses[:5],
        "pressure_mechanics": pressure_points[:6],
        "target_meters": target_meters[:4],
        "risk_distribution": risk_levels[:3],
        "trace_summary": trace_summary.get("summary", ""),
        "counterfactual_reflection_goal": (
            "Have the clone replay the exact same round-one cards, compare its choices with the user's actual choices, "
            "and use agreement plus mismatch categories as second-run reflection evidence."
        ),
        "clone_imitation_protocol": (
            "Round 1 records the user's actual choices on a public random deck. The clone then answers the same cards "
            "without changing the deck. The system reports choice agreement as a tentative human-clone similarity score."
        ),
        "counterfactual_outcome_report_goal": (
            "For the clone replay, summarize where clone choices matched, where they diverged, which card categories "
            "or failure modes drove divergence, and one concrete second-run reflection target."
        ),
        "unchosen_option_prompt": (
            "Ask: where did the clone feel similar to you, and where did it clearly miss your actual reasoning?"
        ),
        "assisted_replay_goal": (
            "Use the simulated alternative outcome to help the user enter a second run with one concrete reflection rule, "
            "not with generic advice."
        ),
        "reflection_loop_steps": [
            "Record first-run decisions.",
            "Freeze the exact same first-run cards.",
            "Have the clone answer those same cards.",
            "Report choice-agreement similarity and mismatch categories.",
            "Compare first and second runs by card/category friction.",
        ],
        "safety_rules": safety_rules,
        "rules": safety_rules,
    }


@router.get("/profile")
async def get_simulation_profile(
    current_user: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Export a privacy-safe grounding profile for downstream simulations."""
    now = _utc_now_iso()
    biography = _load_latest_biography(current_user)
    if biography is None:
        raise HTTPException(status_code=404, detail="No biography found for user")

    raw_biography_text = _biography_to_text(biography)
    privacy_signals = classify_sensitive_content(raw_biography_text)
    biography_text = sanitize_privacy_safe_text(raw_biography_text)
    concise_background = _compact(biography_text, 2200)
    trace_summary = load_simulation_trace_summary(current_user)
    graph_signals = load_graph_signals(current_user)
    graph_constraints = graph_constraints_for_simulation(graph_signals)
    mental_model = get_current_mental_model_formulation(current_user)
    mental_model_summary = None
    if mental_model:
        formulation = mental_model.get("formulation") or {}
        mental_model_summary = {
            "status": mental_model.get("status"),
            "confidence": mental_model.get("confidence"),
            "decision_policy_hypotheses": formulation.get("decision_policy_hypotheses", []),
            "likely_pressure_points": formulation.get("likely_pressure_points", []),
            "privacy_boundary": formulation.get("privacy_boundary", ""),
        }

    scenario = (
        "Create a campus-life decision simulation that probes how this person handles "
        "relationship obligations, limited energy, uncertainty, trade-offs, and moments "
            "where helping others conflicts with personal goals. Keep scenarios natural, "
            "specific, and grounded in the privacy-safe background. After round one, the clone should "
            "replay the exact same cards, make its own choices as an imitation of the user, and report "
            "human-clone agreement as a tentative similarity score. Use mismatches to inspire the user's "
            "next decision rather than prescribe it. The clone should explicitly treat its answers as "
            "simulation evidence, not generic advice or a claim about what must have happened"
        + (
            " and the recorded Rewind behavioral traces."
            if trace_summary.get("available")
            else "."
        )
    )
    if mental_model_summary:
        scenario += (
            " Also use the current RewindAI mental model draft as tentative guidance; "
            "turn its hypotheses into playable situations, not labels or diagnoses."
        )
    if graph_constraints.get("available"):
        scenario += (
            " Include graph-derived relationship constraints as social pressure: "
            + " ".join(graph_constraints.get("scenario_prompts", [])[:2])
        )
    card_generation_guidance = _card_generation_guidance(
        graph_constraints,
        mental_model_summary,
        trace_summary,
    )

    return {
        "rewindai_contract": _grounding_contract(now),
        "user_id": current_user,
        "generated_at": now,
        "source": "storysage_biography",
        "privacy_policy": PRIVACY_SAFE_GROUNDING_POLICY,
        "grounding": {
            "summary": concise_background,
            "relationship_context": (
                "Use mentioned family members, friends, mentors, authority figures, teams, "
                "and communities as relationship roles rather than exposing unnecessary names."
            ),
            "decision_patterns": (
                "Prefer scenarios that reveal values, obligations, emotional triggers, "
                "decision boundaries, missing information, and self-versus-other advice."
            ),
            "simulation_focus": [
                "relationship obligations",
                "resource trade-offs",
                "uncertainty under pressure",
                "personal goals versus social expectations",
                "reflection after difficult choices",
            ],
            "graph_constraints": graph_constraints,
            "behavioral_trace_summary": trace_summary,
            "mental_model_formulation": mental_model_summary,
            "card_generation_guidance": card_generation_guidance,
            "privacy_signals": privacy_signals,
        },
        "rewind": {
            "player_name": current_user,
            "background": concise_background,
            "scenario": scenario,
        },
        "trace_ingest": {
            "endpoint": "/simulation/traces",
            "token": _create_trace_token(current_user),
            "expires_in_hours": TRACE_TOKEN_EXPIRE_HOURS,
            "accepts": {
                "protocol": TRACE_PROTOCOL,
                "version": REWINDAI_CONTRACT_VERSION,
                "source_module": "rewind-reigns",
                "target_module": "storysage",
            },
        },
    }


@router.get("/test-handoff")
async def get_simulation_test_handoff(
    token: str = Depends(oauth2_scheme),
    current_user: Optional[str] = None,
) -> Dict[str, Any]:
    """Return only the minimal handoff needed for public simulation-test traces."""
    now = _utc_now_iso()
    if isinstance(token, str):
        payload = get_payload_from_token(token)
        current_user = payload.get("sub", "")
    else:
        payload = {"sub": current_user or ""}
    current_user = current_user or payload.get("sub", "")
    profile = (
        {
            "user_id": current_user,
            "study_group": normalize_study_group(payload.get("study_group")),
        }
        if payload.get("study_group")
        else load_user_profile(current_user)
    )
    return {
        "rewindai_contract": _simulation_test_handoff_contract(now),
        "user_id": current_user,
        "study_group": profile["study_group"],
        "generated_at": now,
        "source": "storysage_trace_handoff",
        "simulation_test": {
            "player_name": current_user,
            "study_group": profile["study_group"],
            "no_retention": profile["study_group"] == "anonymous",
            "personalized_cards": False,
            "card_policy": "public_random_campus_deck",
            "notes": (
                "simulation-test must not use biography, graph, mental model, "
                "or prior trace details to choose or generate cards. It may only "
                "return gameplay traces and counterfactual reflection records unless no_retention is true."
            ),
        },
        "trace_ingest": {
            "endpoint": "/simulation/traces",
            "token": _create_trace_token(current_user),
            "expires_in_hours": TRACE_TOKEN_EXPIRE_HOURS,
            "accepts": {
                "protocol": TRACE_PROTOCOL,
                "version": REWINDAI_CONTRACT_VERSION,
                "source_module": "simulation-test",
                "target_module": "storysage",
            },
        },
    }


@router.post("/traces")
async def ingest_simulation_trace(request: SimulationTraceRequest) -> Dict[str, Any]:
    """Store downstream simulation traces as additional user grounding."""
    user_id = _user_from_trace_token(request.trace_token)
    contract_result = _validate_trace_contract(request.contract)
    trace_dir = _trace_dir(user_id)
    trace_dir.mkdir(parents=True, exist_ok=True)

    session_id = _safe_session_id(request.record.sessionId)
    now = _utc_now_iso()
    raw_record = _trim_trace_record(request.record)
    safe_record = _privacy_safe_trace_record(request.record)
    profile = load_user_profile(user_id)
    if profile.get("study_group") == "experiment":
        reflection = safe_record.get("reflection")
        if not isinstance(reflection, dict):
            reflection = {}
            safe_record["reflection"] = reflection
        if not isinstance(reflection.get("clone_replay"), dict):
            clone_replay = build_clone_replay_for_record(user_id, safe_record)
            if clone_replay:
                reflection["clone_replay"] = clone_replay
                reflection.setdefault("simulation_role", "dashboard_clone_replay")
                reflection.setdefault("evidence_boundary", "tentative_same_question_choice_agreement")
    trace_analysis = analyze_trace_record(safe_record)
    trace_payload = {
        "user_id": user_id,
        "source": request.source,
        "contract": (
            request.contract.model_dump()
            if request.contract and hasattr(request.contract, "model_dump")
            else request.contract.dict()
            if request.contract
            else None
        ),
        "contract_validation": contract_result,
        "received_at": now,
        "privacy_signals": classify_sensitive_payload(raw_record),
        "analysis": trace_analysis,
        "record": safe_record,
    }

    trace_path = trace_dir / f"{request.source}-{session_id}.json"
    with trace_path.open("w", encoding="utf-8") as f:
        json.dump(trace_payload, f, ensure_ascii=False, indent=2)

    index_path = trace_dir / "index.json"
    if index_path.exists():
        with index_path.open("r", encoding="utf-8") as f:
            index = json.load(f)
    else:
        index = {"user_id": user_id, "traces": []}

    traces = [
        item
        for item in index.get("traces", [])
        if item.get("session_id") != request.record.sessionId or item.get("source") != request.source
    ]
    traces.insert(
        0,
        {
            "source": request.source,
            "session_id": request.record.sessionId,
            "updated_at": request.record.updatedAt,
            "received_at": now,
            "decisions": len(request.record.history),
            "ended": bool(request.record.finalState.get("ended")),
            "contract_version": contract_result.get("version"),
            "file": trace_path.name,
        },
    )
    index["traces"] = traces[:50]
    with index_path.open("w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    save_simulation_trace_sql(
        user_id=user_id,
        source=request.source,
        session_id=request.record.sessionId,
        updated_at=request.record.updatedAt,
        received_at=now,
        decisions=len(request.record.history),
        ended=bool(request.record.finalState.get("ended")),
        contract_version=contract_result.get("version"),
        payload=trace_payload,
    )
    record_data_collection_event(
        user_id=user_id,
        event_type="simulation_trace_ingested",
        data_category="game_choice_log",
        source=request.source,
        session_id=request.record.sessionId,
        count=len(request.record.history),
        metadata={
            "ended": bool(request.record.finalState.get("ended")),
            "contract_version": contract_result.get("version"),
            "run_number": trace_analysis.get("run_number"),
            "unique_card_count": trace_analysis.get("unique_card_count"),
            "negative_per_decision": trace_analysis.get("negative_per_decision"),
            "avg_response_time_sec": trace_analysis.get("avg_response_time_sec"),
            "has_clone_reflection": trace_analysis["reflection"]["has_clone_reflection"],
            "has_self_reflection": trace_analysis["reflection"]["has_self_reflection"],
            "has_general_reflection": trace_analysis["reflection"]["has_general_reflection"],
            "clone_similarity_percent": trace_analysis["reflection"]["clone_similarity_percent"],
            "clone_total_questions": trace_analysis["reflection"]["clone_total_questions"],
            "privacy_risk_level": trace_payload.get("privacy_signals", {}).get("risk_level"),
        },
    )
    reflection_meta = trace_analysis.get("reflection", {})
    if reflection_meta.get("has_self_reflection"):
        record_data_collection_event(
            user_id=user_id,
            event_type="self_reflection_saved",
            data_category="reflection_output",
            source=request.source,
            session_id=request.record.sessionId,
            count=1,
            metadata={"run_number": trace_analysis.get("run_number")},
        )
    if reflection_meta.get("has_general_reflection"):
        record_data_collection_event(
            user_id=user_id,
            event_type="general_reflection_saved",
            data_category="reflection_output",
            source=request.source,
            session_id=request.record.sessionId,
            count=1,
            metadata={"run_number": trace_analysis.get("run_number")},
        )
    if reflection_meta.get("has_clone_reflection"):
        record_data_collection_event(
            user_id=user_id,
            event_type="clone_reflection_saved",
            data_category="reflection_output",
            source=request.source,
            session_id=request.record.sessionId,
            count=1,
            metadata={
                "run_number": trace_analysis.get("run_number"),
                "clone_similarity_percent": reflection_meta.get("clone_similarity_percent"),
                "clone_total_questions": reflection_meta.get("clone_total_questions"),
                "clone_mismatch_categories": reflection_meta.get("clone_mismatch_categories"),
            },
        )
    if reflection_meta.get("clone_similarity_percent") is not None:
        record_data_collection_event(
            user_id=user_id,
            event_type="clone_similarity_computed",
            data_category="same_question_choice_agreement",
            source=request.source,
            session_id=request.record.sessionId,
            count=int(reflection_meta.get("clone_total_questions") or 0),
            metadata={
                "clone_similarity_percent": reflection_meta.get("clone_similarity_percent"),
                "clone_matched_choices": reflection_meta.get("clone_matched_choices"),
                "clone_total_questions": reflection_meta.get("clone_total_questions"),
                "mismatch_categories": reflection_meta.get("clone_mismatch_categories"),
            },
        )

    try:
        stale_result = try_mark_mental_model_stale(
            user_id,
            reason=(
                f"New {request.source} trace for session "
                f"{request.record.sessionId} with {len(request.record.history)} decisions."
            ),
        )
    except Exception as exc:
        print(f"mental model stale mark failed: {sanitize_public_error_text(exc)}")
        stale_result = {"marked": False, "warning": "Trace saved; formulation stale marker failed."}

    return {
        "status": "success",
        "message": "Simulation trace stored.",
        "session_id": request.record.sessionId,
        "decisions": len(request.record.history),
        "received_at": now,
        "contract": contract_result,
        "analysis": {
            "run_number": trace_analysis.get("run_number"),
            "clone_similarity_percent": reflection_meta.get("clone_similarity_percent"),
            "clone_total_questions": reflection_meta.get("clone_total_questions"),
        },
        "formulation_stale": stale_result["marked"],
        "warning": stale_result["warning"],
    }


@router.post("/general-reflection")
async def create_general_reflection(request: GeneralReflectionRequest) -> Dict[str, Any]:
    """Return group-2 reflection using only the submitted game record."""
    user_id = _user_from_trace_token(request.trace_token)
    raw_record = _privacy_safe_trace_record(request.record)
    history = raw_record.get("history", [])
    final_state = raw_record.get("finalState", {})
    compact_history = [
        {
            "card": item.get("cardPrompt") or item.get("cardPromptZh") or item.get("cardId"),
            "choice": item.get("optionText") or item.get("optionTextZh"),
            "risk": item.get("riskLevel"),
            "target": item.get("targetMeter"),
            "effects": item.get("effects"),
        }
        for item in history[-12:]
        if isinstance(item, dict)
    ]
    language = "zh" if request.language == "zh" else "en"
    fallback = (
        "这是一段通用反思：先看哪些选择让资源快速下降，再挑一个最常出现的压力类型，第二轮只改变一个策略。"
        if language == "zh"
        else "General reflection: identify which choices drained resources fastest, choose one recurring pressure type, and change only one strategy in the second run."
    )

    settings = get_user_model_settings(user_id)
    if not settings:
        return {"reflection": fallback, "source": "fallback_general_reflection"}

    prompt = (
        "You are writing a general game reflection for a research contrast group. "
        "Use ONLY the game record below. Do not infer biography, personality, graph context, or private history. "
        "Give 3 concise bullets and one concrete second-run rule. "
        f"Respond in {'Chinese' if language == 'zh' else 'English'}.\n\n"
        f"Final state: {json.dumps(final_state, ensure_ascii=False)}\n"
        f"Recent decisions: {json.dumps(compact_history, ensure_ascii=False)}"
    )
    try:
        engine = get_engine(
            settings.model_name,
            provider=settings.provider,
            api_key=settings.api_key,
            temperature=0.2,
            max_tokens=260,
            timeout=12,
        )
        response = invoke_engine(engine, prompt)
        text = getattr(response, "content", None) or getattr(response, "text", None) or str(response)
        return {
            "reflection": sanitize_privacy_safe_text(str(text).strip()) or fallback,
            "source": "system_model_general_reflection",
        }
    except Exception as exc:
        print(f"general reflection failed: {sanitize_public_error_text(exc)}")
        return {"reflection": fallback, "source": "fallback_general_reflection"}


@router.post("/general-reflection-chat")
async def create_general_reflection_chat(
    request: GeneralReflectionChatRequest,
    current_user: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Group-2 multi-turn reflection chat using only game trace summary."""
    language = "zh" if request.language == "zh" else "en"
    trace_summary = load_simulation_trace_summary(current_user)
    safe_messages = [
        {
            "role": "assistant" if item.role == "assistant" else "user",
            "content": sanitize_privacy_safe_text(item.content.strip())[:1200],
        }
        for item in request.messages[-10:]
        if item.content.strip()
    ]
    latest_user_message = next(
        (item["content"] for item in reversed(safe_messages) if item["role"] == "user"),
        "",
    )
    fallback = (
        "可以。我们只基于你目前的游戏记录来反思：先找出资源下降最明显的选择，再选择一个第二轮想测试的小策略。你可以继续问我某一类卡片或某一次选择。"
        if language == "zh"
        else "Yes. We can reflect only from your game record: identify the choices that drained resources most, then pick one small strategy to test in the second run. You can ask about a card category or a specific choice."
    )

    settings = get_user_model_settings(current_user)
    if not settings:
        return {
            "reply": fallback,
            "source": "fallback_general_reflection_chat",
            "boundary": "game_trace_only_no_biography_graph_clone",
        }

    prompt = (
        "You are a general AI reflection chat for Group 2 / contrast condition in RewindAI. "
        "You MUST use only the compact simulation-test trace summary and the current chat messages. "
        "Do not use or infer autobiography, relationship graph, mental model, clone identity, private history, or personality diagnosis. "
        "Be conversational and support multi-turn reflection. Ask at most one follow-up question. "
        "Keep replies concise and practical for a second game run. "
        f"Respond in {'Chinese' if language == 'zh' else 'English'}.\n\n"
        f"Trace summary: {json.dumps(trace_summary, ensure_ascii=False)[:3000]}\n"
        f"Recent chat: {json.dumps(safe_messages, ensure_ascii=False)[:3000]}\n"
        f"Latest user message: {latest_user_message}"
    )
    try:
        engine = get_engine(
            settings.model_name,
            provider=settings.provider,
            api_key=settings.api_key,
            temperature=0.25,
            max_tokens=420,
            timeout=18,
        )
        response = invoke_engine(engine, prompt)
        text = getattr(response, "content", None) or getattr(response, "text", None) or str(response)
        record_data_collection_event(
            user_id=current_user,
            event_type="general_reflection_chat_turn",
            data_category="reflection_output",
            source="storysage_home_group2",
            count=1,
            metadata={
                "message_count": len(safe_messages),
                "trace_available": bool(trace_summary.get("available")),
                "boundary": "game_trace_only_no_biography_graph_clone",
            },
        )
        return {
            "reply": sanitize_privacy_safe_text(str(text).strip()) or fallback,
            "source": "system_model_general_reflection_chat",
            "boundary": "game_trace_only_no_biography_graph_clone",
        }
    except Exception as exc:
        print(f"general reflection chat failed: {sanitize_public_error_text(exc)}")
        return {
            "reply": fallback,
            "source": "fallback_general_reflection_chat",
            "boundary": "game_trace_only_no_biography_graph_clone",
        }


@router.post("/clone-reflection-chat")
async def create_clone_reflection_chat(
    request: CloneReflectionChatRequest,
    current_user: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Dashboard clone chat grounded in mental model, biography, and optional traces."""
    language = "zh" if request.language == "zh" else "en"
    trace_summary = load_simulation_trace_summary(current_user)
    mental_model = get_current_mental_model_formulation(current_user)
    biography_payload: Dict[Any, Any] | None = None
    biography_text = ""
    try:
        biography_payload = _load_latest_biography(current_user)
        if biography_payload:
            biography_text = sanitize_privacy_safe_text(_biography_to_text(biography_payload))
    except Exception as exc:
        print(f"clone reflection biography grounding skipped: {sanitize_public_error_text(exc)}")
    safe_messages = [
        {
            "role": "assistant" if item.role == "assistant" else "user",
            "content": sanitize_privacy_safe_text(item.content.strip())[:1200],
        }
        for item in request.messages[-10:]
        if item.content.strip()
    ]
    latest_user_message = next(
        (item["content"] for item in reversed(safe_messages) if item["role"] == "user"),
        "",
    )
    fallback = (
        "我会把自己当作一个基于你当前自传和心智模型证据的“反思性 clone 草稿”，而不是答案机器。即使还没有游戏轨迹，也可以先讨论你的决策取舍；如果之后有 simulation-test 轨迹，我会把它作为更具体的例子。"
        if language == "zh"
        else "I will act as a reflective clone draft grounded in your current biography and mental-model evidence, not as an answer key. Even without a game trace, we can discuss decision trade-offs; if simulation-test traces exist later, I will use them as concrete examples."
    )

    settings = get_user_model_settings(current_user)
    if not settings or (not mental_model and not biography_text):
        return {
            "reply": fallback,
            "source": "fallback_clone_reflection_chat",
            "boundary": "biography_mental_model_optional_trace_no_personalized_game_cards",
            "needs": {
                "trace": False,
                "mental_model": not bool(mental_model),
                "biography": not bool(biography_text),
                "model_settings": not bool(settings),
            },
        }

    formulation = mental_model.get("formulation") if isinstance(mental_model, dict) else {}
    mental_model_summary = {
        "status": mental_model.get("status") if isinstance(mental_model, dict) else "not_built",
        "confidence": mental_model.get("confidence") if isinstance(mental_model, dict) else "low",
        "grounding_summary": formulation.get("grounding_summary") if isinstance(formulation, dict) else "",
        "relationship_focus": formulation.get("relationship_focus", []) if isinstance(formulation, dict) else [],
        "decision_policy_hypotheses": formulation.get("decision_policy_hypotheses", []) if isinstance(formulation, dict) else [],
        "likely_pressure_points": formulation.get("likely_pressure_points", []) if isinstance(formulation, dict) else [],
        "privacy_boundary": formulation.get("privacy_boundary", "") if isinstance(formulation, dict) else "",
    }
    optional_trace_summary = trace_summary if trace_summary.get("available") else {
        "available": False,
        "summary": "No simulation-test trace is available yet. Treat this as a biography/mental-model self-reflection conversation.",
    }
    prompt = (
        "You are the RewindAI clone reflection chat. "
        "You are NOT inside the game and you must NOT create personalized game cards. "
        "Your role is to help the user reflect on choices using the user's current mental-model draft, privacy-safe biography evidence, "
        "and compact game trace summary when available. Game traces are optional: if no trace exists, continue as a general self-reflection "
        "conversation grounded in biography and mental-model evidence. Speak as a careful reflective clone draft: you are not a perfect behavioral copy, "
        "but you ARE simulating from the current mental-model hypotheses to help the user reason about choices. "
        "When the user asks whether you cloned their behavior, answer that you are a tentative decision-pattern clone grounded in their "
        "mental-model/biography evidence and optional traces, not a complete copy of the person. "
        "For concrete choice questions, you MUST explicitly connect the answer to the mental model. Use this structure when possible: "
        "1) 'Because your current mental model suggests...' name one decision-policy hypothesis, pressure point, value, or relationship focus; "
        "2) 'In this scenario, that may make you...' explain why the user's original choice was understandable; "
        "3) 'A different choice could test...' describe the unchosen option and likely trade-off/outcome; "
        "4) briefly analyze likely longer-term effects, not only immediate resource changes; "
        "5) suggest one small second-run experiment. "
        "If the mental model is thin, say 'the current model is still tentative' and use the best available biography evidence rather than becoming generic. "
        "If no game trace is available, do NOT tell the user they must play first; answer from profile evidence and invite them to use traces only as optional future evidence. "
        "Compare the user's reported choice with plausible choices the clone might have made, surface one unchosen path, and suggest one small experiment when useful. "
        "Do not diagnose, do not claim certainty, and do not present the clone as an answer key. "
        "Do not simply summarize the game report without referencing the mental model. "
        "Do NOT end with a follow-up question. The user will ask the next question when needed. "
        "Keep replies concise and practical: usually 2-4 short paragraphs or 4 compact bullets. "
        "Prefer language like 'the longer-term effect may be...' and 'the alternative path may train/test...' "
        f"Respond in {'Chinese' if language == 'zh' else 'English'}.\n\n"
        f"Mental model draft: {json.dumps(mental_model_summary, ensure_ascii=False)[:3500]}\n"
        f"Privacy-safe biography evidence: {_compact(biography_text, 2600)}\n"
        f"Trace summary: {json.dumps(optional_trace_summary, ensure_ascii=False)[:3000]}\n"
        f"Recent chat: {json.dumps(safe_messages, ensure_ascii=False)[:3000]}\n"
        f"Latest user message: {latest_user_message}"
    )
    try:
        engine = get_engine(
            settings.model_name,
            provider=settings.provider,
            api_key=settings.api_key,
            temperature=0.28,
            max_tokens=680,
            timeout=20,
        )
        response = invoke_engine(engine, prompt)
        text = getattr(response, "content", None) or getattr(response, "text", None) or str(response)
        record_data_collection_event(
            user_id=current_user,
            event_type="clone_reflection_chat_turn",
            data_category="reflection_output",
            source="storysage_home_group3_clone",
            count=1,
            metadata={
                "message_count": len(safe_messages),
                "trace_available": bool(trace_summary.get("available")),
                "mental_model_status": mental_model.get("status") if isinstance(mental_model, dict) else "not_built",
                "biography_available": bool(biography_text),
                "boundary": "biography_mental_model_optional_trace_no_personalized_game_cards",
            },
        )
        return {
            "reply": sanitize_privacy_safe_text(str(text).strip()) or fallback,
            "source": "system_model_clone_reflection_chat",
            "boundary": "biography_mental_model_optional_trace_no_personalized_game_cards",
        }
    except Exception as exc:
        print(f"clone reflection chat failed: {sanitize_public_error_text(exc)}")
        return {
            "reply": fallback,
            "source": "fallback_clone_reflection_chat",
            "boundary": "biography_mental_model_optional_trace_no_personalized_game_cards",
        }


@router.get("/traces/summary")
async def get_simulation_trace_summary(
    current_user: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Return compact downstream behavioral trace grounding for the current user."""
    return load_simulation_trace_summary(current_user)
