from collections import Counter
from typing import Any, Dict, List

from api.services.mirofish_graph_sync import get_graph_data, get_graph_state


MAX_GRAPH_LABELS = 12
MAX_GRAPH_RELATION_TYPES = 8


def load_graph_signals(user_id: str) -> Dict[str, Any]:
    """Return a compact, simulation-safe summary of the current graph."""
    state = get_graph_state(user_id)
    try:
        payload = get_graph_data(user_id)
        graph_data = payload.get("graph_data", {})
    except FileNotFoundError:
        graph_data = {}

    nodes = graph_data.get("nodes") if isinstance(graph_data, dict) else []
    edges = graph_data.get("edges") if isinstance(graph_data, dict) else []
    nodes = nodes if isinstance(nodes, list) else []
    edges = edges if isinstance(edges, list) else []

    labels: List[str] = []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        label = node.get("name") or node.get("label") or node.get("id")
        if label:
            labels.append(str(label))

    relation_counts = Counter()
    for edge in edges:
        if not isinstance(edge, dict):
            continue
        relation = edge.get("type") or edge.get("label") or edge.get("relation")
        if relation:
            relation_counts[str(relation)] += 1

    return {
        "available": bool(nodes or edges),
        "status": state.get("status", "idle"),
        "node_count": len(nodes),
        "edge_count": len(edges),
        "focus_labels": labels[:MAX_GRAPH_LABELS],
        "relation_types": dict(relation_counts.most_common(MAX_GRAPH_RELATION_TYPES)),
        "updated_at": state.get("updated_at"),
    }


def graph_constraints_for_simulation(graph_signals: Dict[str, Any]) -> Dict[str, Any]:
    """Convert graph signals into playable constraints without exposing raw graph data."""
    relation_types = graph_signals.get("relation_types") or {}
    focus_labels = graph_signals.get("focus_labels") or []
    available = bool(graph_signals.get("available"))

    prompts = [
        "Use relationship roles and social obligations as scenario pressure, not as questionnaires.",
        "Create choices where helping, disappointing, trusting, or negotiating with others has consequences.",
    ]
    if relation_types:
        prompts.append(
            "Prioritize relationship tensions involving: "
            + ", ".join(list(relation_types.keys())[:4])
            + "."
        )
    if focus_labels:
        prompts.append(
            "Use these graph-derived entities as inspiration for roles or institutions, generalized when needed: "
            + ", ".join(focus_labels[:6])
            + "."
        )

    return {
        "available": available,
        "status": graph_signals.get("status", "idle"),
        "node_count": graph_signals.get("node_count", 0),
        "edge_count": graph_signals.get("edge_count", 0),
        "relationship_focus": focus_labels,
        "relation_types": relation_types,
        "scenario_prompts": prompts,
    }
