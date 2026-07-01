from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.core.auth import get_current_user
from api.core.errors import sanitize_public_error_text
from api.services.mental_model import (
    build_mental_model_formulation,
    get_current_mental_model_formulation,
)


router = APIRouter(
    tags=["formulation"],
    prefix="/formulation",
)


class GraphEvidence(BaseModel):
    available: bool
    status: str
    node_count: int
    edge_count: int
    focus_labels: List[str]
    relation_types: Dict[str, int]
    updated_at: Optional[str] = None


class TraceEvidence(BaseModel):
    available: bool
    trace_count: int
    decision_count: int
    summary: str


class PrivacySignal(BaseModel):
    category: str
    severity: str
    count: int
    recommendation: str


class PrivacyEvidence(BaseModel):
    available: bool
    risk_level: str
    labels: List[PrivacySignal]
    policy: str
    review_required: bool = False
    review_summary: Optional[str] = None


class FormulationEvidence(BaseModel):
    biography_available: bool
    graph: GraphEvidence
    trace_summary: TraceEvidence
    privacy_signals: PrivacyEvidence


class MentalModelDraft(BaseModel):
    grounding_summary: str
    relationship_focus: List[str]
    decision_policy_hypotheses: List[str]
    likely_pressure_points: List[str]
    simulation_guidance: List[str]
    privacy_boundary: str


class MentalModelPayload(BaseModel):
    snapshot_id: str
    user_id: str
    generated_at: str
    status: str
    stale: bool = False
    stale_reason: Optional[str] = None
    stale_at: Optional[str] = None
    confidence: str
    evidence: FormulationEvidence
    formulation: MentalModelDraft
    gaps: List[str]


class FormulationResponse(BaseModel):
    success: bool
    data: MentalModelPayload


@router.get("/current", response_model=FormulationResponse)
async def get_current_formulation(
    refresh: bool = Query(default=False),
    current_user: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Return the current RewindAI mental model draft for this user."""
    try:
        payload = None if refresh else get_current_mental_model_formulation(current_user)
        if payload is None:
            payload = build_mental_model_formulation(current_user)
    except FileNotFoundError as exc:
        print(f"formulation current not found: {sanitize_public_error_text(exc)}")
        raise HTTPException(status_code=404, detail="Mental model evidence not found") from exc

    return {"success": True, "data": payload}


@router.post("/rebuild", response_model=FormulationResponse)
async def rebuild_formulation(
    current_user: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Rebuild the user's RewindAI mental model draft from current evidence."""
    try:
        payload = build_mental_model_formulation(current_user)
    except FileNotFoundError as exc:
        print(f"formulation rebuild not found: {sanitize_public_error_text(exc)}")
        raise HTTPException(status_code=404, detail="Mental model evidence not found") from exc

    return {"success": True, "data": payload}
