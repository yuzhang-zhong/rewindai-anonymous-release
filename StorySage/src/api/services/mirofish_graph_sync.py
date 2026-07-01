import asyncio
import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List, Optional

import httpx

from api.core.errors import sanitize_public_error_text
from api.services.grounding_evidence import load_grounding_evidence
from api.services.simulation_traces import format_simulation_trace_summary


_STATE_LOCK = Lock()
_JOB_STATE_BY_USER: Dict[str, Dict[str, Any]] = {}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _data_root() -> Path:
    return Path(os.getenv("DATA_DIR", "data"))


def _graph_dir(user_id: str) -> Path:
    return _data_root() / user_id / "graph"


def _state_file(user_id: str) -> Path:
    return _graph_dir(user_id) / "current_state.json"


def _data_file(user_id: str) -> Path:
    return _graph_dir(user_id) / "current_data.json"


def _snapshots_dir(user_id: str) -> Path:
    return _graph_dir(user_id) / "snapshots"


def _ensure_graph_dirs(user_id: str) -> None:
    _snapshots_dir(user_id).mkdir(parents=True, exist_ok=True)


def _read_json_file(path: Path) -> Optional[Dict[str, Any]]:
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _write_json_file(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def get_graph_state(user_id: str) -> Dict[str, Any]:
    with _STATE_LOCK:
        memory_state = _JOB_STATE_BY_USER.get(user_id)
    if memory_state:
        return dict(memory_state)

    disk_state = _read_json_file(_state_file(user_id))
    if disk_state:
        return disk_state

    return {
        "user_id": user_id,
        "status": "idle",
        "message": "Graph has not been built yet.",
        "updated_at": _utc_now_iso(),
    }


def get_graph_data(user_id: str) -> Dict[str, Any]:
    state = get_graph_state(user_id)
    data = _read_json_file(_data_file(user_id))
    if not data:
        raise FileNotFoundError(f"No graph data found for user: {user_id}")
    return {
        "state": state,
        "graph_data": data.get("graph_data", {}),
        "snapshot_id": data.get("snapshot_id"),
        "updated_at": data.get("updated_at"),
        "source_manifest": data.get("source_manifest"),
        "fallback": data.get("fallback"),
    }


def _store_state(user_id: str, patch: Dict[str, Any]) -> Dict[str, Any]:
    disk_state = _read_json_file(_state_file(user_id))
    with _STATE_LOCK:
        state = dict(
            _JOB_STATE_BY_USER.get(user_id)
            or disk_state
            or {
                "user_id": user_id,
                "status": "idle",
                "message": "Graph has not been built yet.",
            }
        )
        state.update(patch)
        state["updated_at"] = _utc_now_iso()
        _JOB_STATE_BY_USER[user_id] = state
    _write_json_file(_state_file(user_id), state)
    return state


def _mirofish_base_url() -> str:
    return os.getenv("MIROFISH_BASE_URL", "http://localhost:5001").rstrip("/")


def _http_timeout_sec() -> float:
    return float(os.getenv("MIROFISH_HTTP_TIMEOUT_SEC", "60"))


def _poll_interval_sec() -> float:
    return float(os.getenv("MIROFISH_TASK_POLL_INTERVAL_SEC", "3"))


def _build_timeout_sec() -> float:
    return float(os.getenv("MIROFISH_GRAPH_BUILD_TIMEOUT_SEC", "75"))


def _running_stale_sec() -> float:
    return float(os.getenv("MIROFISH_GRAPH_RUNNING_STALE_SEC", "90"))


def _simulation_requirement() -> str:
    return os.getenv(
        "MIROFISH_SIMULATION_REQUIREMENT",
        "Build a person-centric relationship and cognitive graph from autobiography text and behavioral decision traces.",
    )


def _graph_sync_enabled() -> bool:
    return os.getenv("MIROFISH_GRAPH_SYNC_ENABLED", "true").lower() in {"1", "true", "yes", "on"}


def _serverless_background_disabled() -> bool:
    if os.getenv("MIROFISH_ALLOW_SERVERLESS_BACKGROUND", "").lower() in {"1", "true", "yes", "on"}:
        return False
    return bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))


def _is_running_state_stale(state: Dict[str, Any]) -> bool:
    if state.get("status") != "running":
        return False
    updated_at = state.get("updated_at")
    if not updated_at:
        return False
    try:
        updated = datetime.fromisoformat(str(updated_at).replace("Z", "+00:00"))
        if updated.tzinfo is None:
            updated = updated.replace(tzinfo=timezone.utc)
    except Exception:
        return False
    age = (datetime.now(timezone.utc) - updated).total_seconds()
    return age > _running_stale_sec()


def _extract_data(payload: Dict[str, Any]) -> Dict[str, Any]:
    if isinstance(payload, dict) and isinstance(payload.get("data"), dict):
        return payload["data"]
    return payload


def _compact_label(value: Any, limit: int = 72) -> str:
    text = " ".join(str(value or "").split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _has_cjk(text: str) -> bool:
    return bool(re.search(r"[\u3400-\u9fff]", text or ""))


def _label_pair(zh: str, en: str, prefer_zh: bool = True) -> Dict[str, str]:
    label_zh = _compact_label(zh, 38)
    label_en = _compact_label(en, 54)
    return {
        "name": label_zh if prefer_zh else label_en,
        "label_zh": label_zh,
        "label_en": label_en,
    }


def _detail_pair(zh: str, en: str) -> Dict[str, str]:
    return {
        "detail_zh": _compact_label(zh, 180),
        "detail_en": _compact_label(en, 220),
    }


def _edge_labels(edge_type: str) -> Dict[str, str]:
    """Psychology-informed, non-diagnostic relationship labels for graph edges."""
    labels = {
        "autobiographical_context": (
            "自传情境",
            "autobiographical context",
            "该关系或线索来自用户叙述的生活情境，不代表固定人格判断。",
            "This relation comes from autobiographical context, not a fixed personality claim.",
        ),
        "situational_cue": (
            "情境触发",
            "situational cue",
            "具体事件触发了决策、情绪或取舍过程。",
            "A concrete episode cues the user's decision, emotion, or trade-off process.",
        ),
        "role_expectation": (
            "角色期待",
            "role expectation",
            "关系角色带来社会规范、责任或被期待的行动方式。",
            "A relationship role carries social norms, responsibility, or expected behavior.",
        ),
        "emotional_activation": (
            "情绪激活",
            "emotional activation",
            "压力线索可能提高情绪强度，从而影响注意力和选择。",
            "A pressure cue may heighten emotion and influence attention and choice.",
        ),
        "value_protection": (
            "价值保护",
            "value protection",
            "用户的选择可能在保护某个被重视的价值、关系或目标。",
            "The user's choice may be protecting a valued principle, relationship, or goal.",
        ),
        "motivational_conflict": (
            "动机冲突",
            "motivational conflict",
            "两个目标或需求彼此拉扯，形成接近-回避或双重目标冲突。",
            "Two motives pull against each other, creating approach-avoidance or goal conflict.",
        ),
        "value_conflict": (
            "价值冲突",
            "value conflict",
            "一种选择可能保护某个价值，同时牺牲另一个价值或关系。",
            "One option may protect one value while risking another value or relationship.",
        ),
        "decision_boundary": (
            "决策边界",
            "decision boundary",
            "缺失信息或不确定性会改变用户认为何时该换一种选择。",
            "Missing information or uncertainty changes when the user would choose differently.",
        ),
        "coping_heuristic": (
            "应对启发式",
            "coping heuristic",
            "从叙述中提炼出的暂定规则，用于帮助用户在类似情境中暂停、比较和测试。",
            "A tentative rule for pausing, comparing, and testing options in similar situations.",
        ),
        "counterfactual_anchor": (
            "反事实锚点",
            "counterfactual anchor",
            "用户提到“如果重来/变量改变”，可作为理解决策边界的锚点。",
            "A 'what-if' variable anchors how the user's decision boundary might shift.",
        ),
        "behavioral_hypothesis": (
            "行为假设",
            "behavioral hypothesis",
            "游戏轨迹只能作为暂定行为线索，用来生成反思问题，不作为自传事实。",
            "Game traces are tentative behavioral signals for reflection questions, not biography facts.",
        ),
    }
    zh, en, detail_zh, detail_en = labels.get(
        edge_type,
        ("关联", "related to", "两个线索在当前图谱中被暂定关联。", "The two signals are tentatively related in this graph."),
    )
    return {
        "label_zh": zh,
        "label_en": en,
        **_detail_pair(detail_zh, detail_en),
    }


def _sentences(text: str, limit: int = 10) -> List[str]:
    pieces = re.split(r"(?<=[。！？!?；;])\s+|\n+", text)
    return [_compact_label(piece, 180) for piece in pieces if piece.strip()][:limit]


def _contains_any(text: str, keywords: List[str]) -> bool:
    lower = text.lower()
    return any(keyword.lower() in lower for keyword in keywords)


def _extract_role_labels(text: str) -> List[str]:
    role_patterns = [
        r"(父母|妈妈|母亲|爸爸|父亲|家人|朋友|同学|室友|老师|导师|队友|社团|同事|领导)",
        r"\b(parent|mother|father|family|friend|classmate|roommate|teacher|advisor|mentor|teammate|club|coworker|manager)\b",
    ]
    labels: List[str] = []
    for pattern in role_patterns:
        for match in re.findall(pattern, text, flags=re.I):
            label = match if isinstance(match, str) else next((item for item in match if item), "")
            label = _compact_label(label, 32)
            if label and label.lower() not in {item.lower() for item in labels}:
                labels.append(label)
    return labels[:5]


def _role_label_pair(role: str, prefer_zh: bool) -> Dict[str, str]:
    normalized = role.lower()
    zh_map = {
        "parent": "父母",
        "mother": "母亲",
        "father": "父亲",
        "family": "家人",
        "friend": "朋友",
        "classmate": "同学",
        "roommate": "室友",
        "teacher": "老师",
        "advisor": "导师",
        "mentor": "导师",
        "teammate": "队友",
        "club": "社团",
        "coworker": "同事",
        "manager": "领导",
    }
    en_map = {
        "父母": "parents",
        "妈妈": "mother",
        "母亲": "mother",
        "爸爸": "father",
        "父亲": "father",
        "家人": "family",
        "朋友": "friends",
        "同学": "classmates",
        "室友": "roommates",
        "老师": "teacher",
        "导师": "mentor",
        "队友": "teammates",
        "社团": "club/community",
        "同事": "coworkers",
        "领导": "manager",
    }
    zh = zh_map.get(normalized, role if _has_cjk(role) else "重要关系")
    en = en_map.get(role, role if not _has_cjk(role) else "important relationship")
    return _label_pair(zh, en, prefer_zh=prefer_zh)


def _episode_label(sentence: str, prefer_zh: bool) -> Dict[str, str]:
    if _contains_any(sentence, ["生日", "gift", "present"]):
        return _label_pair("生日/礼物事件", "birthday or gift incident", prefer_zh)
    if _contains_any(sentence, ["游戏", "game", "植物大战僵尸", "密码", "password"]):
        return _label_pair("游戏与规则选择", "game/rule choice", prefer_zh)
    if _contains_any(sentence, ["社团", "club", "team", "队"]):
        return _label_pair("集体活动选择", "group activity choice", prefer_zh)
    if _contains_any(sentence, ["学习", "考试", "gpa", "作业", "study", "exam", "homework"]):
        return _label_pair("学业压力选择", "academic pressure choice", prefer_zh)
    if _contains_any(sentence, ["朋友", "家人", "关系", "friend", "family", "relationship"]):
        return _label_pair("关系中的选择", "relationship choice", prefer_zh)
    return _label_pair("关键选择时刻", "key choice moment", prefer_zh)


def _pressure_label(sentence: str, prefer_zh: bool) -> Dict[str, str]:
    if _contains_any(sentence, ["伤心", "难过", "生气", "委屈", "sad", "angry", "hurt"]):
        return _label_pair("情绪被触发", "emotion triggered", prefer_zh)
    if _contains_any(sentence, ["家人", "父母", "family", "parent"]):
        return _label_pair("家庭期待压力", "family expectation pressure", prefer_zh)
    if _contains_any(sentence, ["朋友", "同学", "friend", "classmate"]):
        return _label_pair("同伴关系压力", "peer relationship pressure", prefer_zh)
    return _label_pair("关系/责任压力", "relationship or duty pressure", prefer_zh)


def _value_label(sentence: str, prefer_zh: bool) -> Dict[str, str]:
    if _contains_any(sentence, ["公平", "原则", "fair", "principle"]):
        return _label_pair("保护公平原则", "protect fairness/principles", prefer_zh)
    if _contains_any(sentence, ["证明", "认可", "prove", "recognition"]):
        return _label_pair("想证明自己", "wanting to prove oneself", prefer_zh)
    if _contains_any(sentence, ["家人", "朋友", "关系", "family", "friend", "relationship"]):
        return _label_pair("重视关系", "protect relationships", prefer_zh)
    if _contains_any(sentence, ["喜欢", "兴趣", "passion", "interest"]):
        return _label_pair("保护兴趣与自主感", "protect interest and agency", prefer_zh)
    return _label_pair("被保护的价值", "value being protected", prefer_zh)


def _tradeoff_label(sentence: str, prefer_zh: bool) -> Dict[str, str]:
    if _contains_any(sentence, ["自己", "别人", "关系", "personal", "others", "relationship"]):
        return _label_pair("自己需要 vs 他人期待", "self-needs vs others' expectations", prefer_zh)
    if _contains_any(sentence, ["时间", "精力", "学习", "time", "energy", "study"]):
        return _label_pair("时间精力取舍", "time/energy trade-off", prefer_zh)
    return _label_pair("短期感受 vs 长期后果", "short-term feeling vs long-term outcome", prefer_zh)


def _uncertainty_label(sentence: str, prefer_zh: bool) -> Dict[str, str]:
    if _contains_any(sentence, ["忘", "记不清", "unclear", "forgot"]):
        return _label_pair("记忆/信息不完整", "incomplete memory/information", prefer_zh)
    if _contains_any(sentence, ["担心", "害怕", "worry", "fear"]):
        return _label_pair("担心后果", "worry about consequences", prefer_zh)
    return _label_pair("改变决定的信息缺口", "information gap that could change choice", prefer_zh)


def _rule_label(sentence: str, prefer_zh: bool) -> Dict[str, str]:
    if _contains_any(sentence, ["如果", "重来", "以后", "if", "again", "next time"]):
        return _label_pair("先找会改变选择的变量", "identify choice-changing variable", prefer_zh)
    if _contains_any(sentence, ["平衡", "取舍", "balance", "trade-off"]):
        return _label_pair("先命名取舍再行动", "name the trade-off before acting", prefer_zh)
    return _label_pair("暂停后再做选择", "pause before choosing", prefer_zh)


def _first_matching_sentence(sentences: List[str], keywords: List[str], fallback: str) -> str:
    for sentence in sentences:
        if _contains_any(sentence, keywords):
            return sentence
    return fallback


def _add_node(nodes: List[Dict[str, Any]], node: Dict[str, Any]) -> None:
    if not any(existing.get("id") == node.get("id") for existing in nodes):
        nodes.append(node)


def _add_edge(edges: List[Dict[str, Any]], edge: Dict[str, Any]) -> None:
    edge.setdefault("label", _edge_labels(str(edge.get("type", ""))).get("label_en", "related to"))
    edge.update({key: value for key, value in _edge_labels(str(edge.get("type", ""))).items() if key not in edge})
    if not any(existing.get("id") == edge.get("id") for existing in edges):
        edges.append(edge)


def _build_relationship_decision_graph(graph_source_payload: Dict[str, Any]) -> Dict[str, Any]:
    """Build a privacy-safe relationship/decision graph without relying on MiroFish."""
    safe_text = graph_source_payload["text"]
    lower = safe_text.lower()
    prefer_zh = _has_cjk(safe_text)
    snippets = _sentences(safe_text, limit=14)
    source_kind = (
        (graph_source_payload.get("manifest", {}).get("sources") or [{}])[0]
        .get("kind", "storysage_grounding")
    )
    evidence_status = (
        (graph_source_payload.get("manifest", {}).get("sources") or [{}])[0]
        .get("status", "provisional")
    )

    nodes: List[Dict[str, Any]] = [
        {
            "id": "self",
            "type": "self",
            "evidence_status": evidence_status,
            **_label_pair("当前用户", "Current user", prefer_zh),
            **_detail_pair(
                "图谱中心，代表当前用户的关系、事件和决策逻辑。",
                "Graph center: the user's relationships, incidents, and decision logic.",
            ),
        }
    ]
    edges: List[Dict[str, Any]] = []

    role_labels = _extract_role_labels(safe_text)
    if not role_labels:
        role_labels = ["important others" if not _contains_any(safe_text, ["关系", "朋友", "家人"]) else "重要关系"]
    for index, label in enumerate(role_labels[:4], start=1):
        node_id = f"role_{index}"
        _add_node(
            nodes,
            {
                "id": node_id,
                "type": "person_or_role",
                "evidence_status": evidence_status,
                **_role_label_pair(label, prefer_zh),
                **_detail_pair(
                    f"访谈/自传中出现的关系角色：{label}。",
                    f"Relationship role surfaced in the interview/biography: {label}.",
                ),
            },
        )
        _add_edge(
            edges,
            {
                "id": f"e_self_{node_id}",
                "source": "self",
                "target": node_id,
                "type": "autobiographical_context",
            },
        )

    decision_sentence = _first_matching_sentence(
        snippets,
        ["决定", "选择", "取舍", "trade-off", "decision", "choose", "choice", "risk", "高风险"],
        "A remembered situation where the user had to make a consequential choice.",
    )
    tradeoff_sentence = _first_matching_sentence(
        snippets,
        ["取舍", "平衡", "冲突", "trade-off", "balance", "conflict", "tension", "压力"],
        "Balancing personal needs, relationship expectations, and longer-term consequences.",
    )
    value_sentence = _first_matching_sentence(
        snippets,
        ["原则", "责任", "公平", "证明", "价值", "principle", "responsibility", "fair", "value", "prove"],
        "Values and commitments the user appears to protect when deciding.",
    )
    uncertainty_sentence = _first_matching_sentence(
        snippets,
        ["不知道", "缺少", "不确定", "担心", "uncertain", "missing", "worry", "unknown"],
        "Information gaps or uncertainty that could change the decision boundary.",
    )
    rule_sentence = _first_matching_sentence(
        snippets,
        ["如果", "以后", "重来", "变量", "would change", "if", "again", "next time"],
        "A decision rule hypothesis: pause, name the trade-off, and test what variable would change the choice.",
    )

    derived_nodes = [
        (
            "episode_1",
            _episode_label(decision_sentence, prefer_zh),
            _detail_pair(
                f"关键事件线索：{decision_sentence}",
                f"Decision episode evidence: {decision_sentence}",
            ),
            "decision_episode",
            "situational_cue",
        ),
        (
            "pressure_1",
            _pressure_label(tradeoff_sentence, prefer_zh),
            _detail_pair(
                f"压力线索：{tradeoff_sentence}",
                f"Pressure evidence: {tradeoff_sentence}",
            ),
            "relationship_pressure",
            "emotional_activation",
        ),
        (
            "value_1",
            _value_label(value_sentence, prefer_zh),
            _detail_pair(
                f"价值线索：{value_sentence}",
                f"Value evidence: {value_sentence}",
            ),
            "value_or_goal",
            "value_protection",
        ),
        (
            "tradeoff_1",
            _tradeoff_label(tradeoff_sentence, prefer_zh),
            _detail_pair(
                f"取舍线索：{tradeoff_sentence}",
                f"Trade-off evidence: {tradeoff_sentence}",
            ),
            "tradeoff",
            "motivational_conflict",
        ),
        (
            "uncertainty_1",
            _uncertainty_label(uncertainty_sentence, prefer_zh),
            _detail_pair(
                f"不确定线索：{uncertainty_sentence}",
                f"Uncertainty evidence: {uncertainty_sentence}",
            ),
            "uncertainty",
            "decision_boundary",
        ),
        (
            "rule_1",
            _rule_label(rule_sentence, prefer_zh),
            _detail_pair(
                f"决策规则假设：{rule_sentence}",
                f"Decision-rule hypothesis: {rule_sentence}",
            ),
            "decision_rule",
            "coping_heuristic",
        ),
    ]
    for node_id, labels, details, node_type, edge_type in derived_nodes:
        _add_node(
            nodes,
            {
                "id": node_id,
                "type": node_type,
                "evidence_status": evidence_status,
                "source_kind": source_kind,
                **labels,
                **details,
            },
        )
        _add_edge(
            edges,
            {
                "id": f"e_self_{node_id}",
                "source": "self",
                "target": node_id,
                "type": edge_type,
            },
        )

    if "downstream behavioral traces" in lower or "simulation-test" in lower:
        _add_node(
            nodes,
            {
                "id": "simulation_signal_1",
                "type": "simulation_signal",
                "evidence_status": "tentative",
                **_label_pair("simulation-test 行为线索", "simulation-test behavior signal", prefer_zh),
                **_detail_pair(
                    "来自游戏轨迹的暂定信号，只用于提示可能的决策倾向，不当作自传事实。",
                    "Tentative signal from game traces; useful for decision hypotheses, not biography facts.",
                ),
            },
        )
        _add_edge(
            edges,
            {
                "id": "e_trace_rule",
                "source": "simulation_signal_1",
                "target": "rule_1",
                "type": "behavioral_hypothesis",
            },
        )

    if role_labels:
        _add_edge(
            edges,
            {
                "id": "e_role_pressure",
                "source": "role_1",
                "target": "pressure_1",
                "type": "role_expectation",
            },
        )
    _add_edge(
        edges,
        {
            "id": "e_tradeoff_value",
            "source": "tradeoff_1",
            "target": "value_1",
            "type": "value_conflict",
        },
    )
    _add_edge(
        edges,
        {
            "id": "e_uncertainty_rule",
            "source": "uncertainty_1",
            "target": "rule_1",
            "type": "counterfactual_anchor",
        },
    )

    return {"nodes": nodes, "edges": edges}


def _validate_local_graph(graph_data: Dict[str, Any]) -> None:
    nodes = graph_data.get("nodes") if isinstance(graph_data.get("nodes"), list) else []
    edges = graph_data.get("edges") if isinstance(graph_data.get("edges"), list) else []
    node_types = {str(node.get("type")) for node in nodes if isinstance(node, dict)}
    if "self" not in node_types:
        raise ValueError("Local graph is missing self node.")
    evidence_nodes = [
        node for node in nodes
        if isinstance(node, dict) and node.get("type") not in {"self"}
    ]
    if len(evidence_nodes) < 2:
        raise ValueError("Local graph needs at least two evidence-derived nodes.")
    if node_types.issubset({"self", "grounded_theme", "cognitive_pattern", "decision_condition"}):
        raise ValueError("Local graph is still generic-only.")
    if not edges:
        raise ValueError("Local graph needs typed edges.")


def build_graph_source_payload(user_id: str) -> Dict[str, Any]:
    """Build the privacy-safe graph source with explicit evidence boundaries."""
    grounding = load_grounding_evidence(user_id)
    grounding_text = grounding["safe_text"]
    privacy_signals = grounding["privacy_signals"]
    trace_summary = format_simulation_trace_summary(user_id)
    manifest = {
        "version": "1.0",
        "privacy_signals": privacy_signals,
        "sources": [
            {
                "id": grounding["source_id"],
                "kind": grounding["kind"],
                "status": grounding["status"],
                "description": grounding["description"],
            },
            {
                "id": "downstream_behavioral_traces",
                "kind": "tentative_simulation_evidence",
                "status": "tentative",
                "description": (
                    "Compact Rewind decision traces. Use as hypotheses for relationship pressure, "
                    "decision tendencies, and future probing only; do not treat as confirmed biography."
                ),
            },
        ],
        "rules": [
            "Keep confirmed autobiography or provisional interview grounding separate from tentative simulation evidence.",
            "If the source is provisional_interview_grounding, avoid presenting graph claims as final biography.",
            "Do not directly rewrite user identity, biography, or portrait from simulation traces.",
            "Use tentative traces to suggest graph context, decision episodes, or future questions.",
            "Preserve privacy-safe generalization of contact details, exact addresses, and unnecessary identifiers.",
        ],
    }
    source_text = (
        "# Evidence Boundary Manifest\n\n"
        f"{json.dumps(manifest, ensure_ascii=False, indent=2)}\n\n"
        "# Privacy Signal Summary\n\n"
        f"{json.dumps(privacy_signals, ensure_ascii=False, indent=2)}\n\n"
        "# Privacy-Safe StorySage Grounding\n\n"
        f"Evidence status: {grounding['kind']}\n"
        f"Confidence status: {grounding['status']}\n\n"
        f"{grounding_text}\n\n"
        "# Downstream Behavioral Traces\n\n"
        "Evidence status: tentative_simulation_evidence\n"
        "Boundary: use as hypotheses for graph context and future questions; do not treat as confirmed biography.\n\n"
        f"{trace_summary}\n"
    )
    return {
        "text": source_text,
        "manifest": manifest,
    }


def _build_local_provisional_graph(
    user_id: str,
    job_id: str,
    graph_source_payload: Dict[str, Any],
    error: Exception,
) -> Dict[str, Any]:
    """Create a readable relationship/decision graph when MiroFish is unavailable."""
    graph_data = _build_relationship_decision_graph(graph_source_payload)
    _validate_local_graph(graph_data)
    snapshot_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    fallback = {
        "used": True,
        "kind": "relationship_decision_graph_draft",
        "reason": (
            "MiroFish graph service was unavailable; generated a privacy-safe "
            "RewindAI relationship/decision graph draft."
        ),
        "error": sanitize_public_error_text(error),
    }
    snapshot_payload = {
        "snapshot_id": snapshot_id,
        "user_id": user_id,
        "job_id": job_id,
        "updated_at": _utc_now_iso(),
        "source_manifest": graph_source_payload["manifest"],
        "graph_data": graph_data,
        "fallback": fallback,
    }
    _write_json_file(_snapshots_dir(user_id) / f"{snapshot_id}.json", snapshot_payload)
    _write_json_file(
        _data_file(user_id),
        {
            "snapshot_id": snapshot_id,
            "updated_at": snapshot_payload["updated_at"],
            "source_manifest": graph_source_payload["manifest"],
            "graph_data": graph_data,
            "fallback": fallback,
        },
    )
    return {
        "snapshot_id": snapshot_id,
        "node_count": len(graph_data["nodes"]),
        "edge_count": len(graph_data["edges"]),
        "fallback_kind": fallback["kind"],
    }


async def _poll_task_until_done(client: httpx.AsyncClient, task_id: str) -> Dict[str, Any]:
    task_url = f"{_mirofish_base_url()}/api/graph/task/{task_id}"
    start_ts = asyncio.get_event_loop().time()

    while True:
        if asyncio.get_event_loop().time() - start_ts > _build_timeout_sec():
            raise TimeoutError("Timed out while waiting for MiroFish graph build task.")

        response = await client.get(task_url)
        response.raise_for_status()
        payload = response.json()
        task_data = _extract_data(payload)
        status = str(task_data.get("status", "")).lower()

        if status in {"completed", "failed"}:
            return task_data

        await asyncio.sleep(_poll_interval_sec())


async def _run_rebuild_job(user_id: str, job_id: str) -> None:
    _ensure_graph_dirs(user_id)
    _store_state(
        user_id,
        {
            "job_id": job_id,
            "status": "running",
            "message": "Preparing privacy-safe autobiography and trace evidence.",
            "progress": 2,
            "error": None,
        },
    )

    graph_source_payload = build_graph_source_payload(user_id)
    graph_source_text = graph_source_payload["text"]
    timeout = httpx.Timeout(_http_timeout_sec())

    async with httpx.AsyncClient(timeout=timeout) as client:
        ontology_url = f"{_mirofish_base_url()}/api/graph/ontology/generate"
        form_data = {
            "simulation_requirement": _simulation_requirement(),
            "project_name": f"{user_id}-autobiography-graph",
        }
        files = [
            (
                "files",
                (
                    f"{user_id}_autobiography.txt",
                    graph_source_text.encode("utf-8"),
                    "text/plain",
                ),
            )
        ]

        _store_state(
            user_id,
            {
                "message": "Submitting relationship/decision ontology request to MiroFish.",
                "progress": 10,
            },
        )
        ontology_resp = await client.post(ontology_url, data=form_data, files=files)
        ontology_resp.raise_for_status()
        ontology_payload = ontology_resp.json()
        ontology_data = _extract_data(ontology_payload)
        project_id = ontology_data.get("project_id")
        if not project_id:
            raise RuntimeError("MiroFish ontology response does not contain project_id.")

        _store_state(
            user_id,
            {
                "project_id": project_id,
                "message": "Starting graph build task from relationship and decision evidence.",
                "progress": 25,
            },
        )

        build_url = f"{_mirofish_base_url()}/api/graph/build"
        build_resp = await client.post(
            build_url,
            json={
                "project_id": project_id,
                "graph_name": f"{user_id}-graph-{job_id[:8]}",
                "force": True,
            },
        )
        build_resp.raise_for_status()
        build_payload = build_resp.json()
        build_data = _extract_data(build_payload)
        task_id = build_data.get("task_id")
        if not task_id:
            raise RuntimeError("MiroFish build response does not contain task_id.")

        _store_state(
            user_id,
            {
                "task_id": task_id,
                "message": "Waiting for graph build task to finish.",
                "progress": 35,
            },
        )

        task_data = await _poll_task_until_done(client, task_id)
        status = str(task_data.get("status", "")).lower()
        if status != "completed":
            raise RuntimeError(task_data.get("message") or "MiroFish graph build failed.")

        result = task_data.get("result") or {}
        graph_id = result.get("graph_id")
        if not graph_id:
            raise RuntimeError("MiroFish task result does not contain graph_id.")

        _store_state(
            user_id,
            {
                "graph_id": graph_id,
                "message": "Fetching and saving latest graph data.",
                "progress": 90,
            },
        )

        data_resp = await client.get(f"{_mirofish_base_url()}/api/graph/data/{graph_id}")
        data_resp.raise_for_status()
        data_payload = data_resp.json()
        graph_data = _extract_data(data_payload)

        snapshot_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        snapshot_payload = {
            "snapshot_id": snapshot_id,
            "user_id": user_id,
            "job_id": job_id,
            "project_id": project_id,
            "task_id": task_id,
            "graph_id": graph_id,
            "updated_at": _utc_now_iso(),
            "source_manifest": graph_source_payload["manifest"],
            "graph_data": graph_data,
        }

        _write_json_file(_snapshots_dir(user_id) / f"{snapshot_id}.json", snapshot_payload)
        _write_json_file(
            _data_file(user_id),
            {
                "snapshot_id": snapshot_id,
                "updated_at": snapshot_payload["updated_at"],
                "source_manifest": graph_source_payload["manifest"],
                "graph_data": graph_data,
            },
        )
        from api.services.mental_model import try_mark_mental_model_stale

        stale_result = try_mark_mental_model_stale(
            user_id,
            reason=f"MiroFish graph rebuilt with snapshot {snapshot_id}.",
        )

        completion_state = {
            "status": "completed",
            "message": "Relationship and decision graph rebuild finished.",
            "progress": 100,
            "snapshot_id": snapshot_id,
            "formulation_stale": stale_result["marked"],
        }
        if stale_result["warning"]:
            completion_state["warning"] = stale_result["warning"]

        _store_state(user_id, completion_state)


def trigger_graph_rebuild(user_id: str, source: str = "manual") -> Dict[str, Any]:
    if not _graph_sync_enabled() or _serverless_background_disabled():
        job_id = str(uuid.uuid4())
        _ensure_graph_dirs(user_id)
        graph_source_payload = build_graph_source_payload(user_id)
        reason = (
            "Hosted serverless runtime cannot reliably keep long MiroFish "
            "background graph jobs alive."
            if _serverless_background_disabled()
            else "MIROFISH_GRAPH_SYNC_ENABLED is false."
        )
        fallback = _build_local_provisional_graph(
            user_id=user_id,
            job_id=job_id,
            graph_source_payload=graph_source_payload,
            error=RuntimeError(reason),
        )
        from api.services.mental_model import try_mark_mental_model_stale

        stale_result = try_mark_mental_model_stale(
            user_id,
            reason=(
                "Provisional local graph created from StorySage interview "
                f"grounding with snapshot {fallback['snapshot_id']}."
            ),
        )
        state_patch = {
            "job_id": job_id,
            "source": source,
            "status": "completed",
            "message": (
                "Generated a RewindAI relationship/decision graph draft from StorySage evidence. "
                "MiroFish sync can be retried from a persistent backend worker."
            ),
            "progress": 100,
            "snapshot_id": fallback["snapshot_id"],
            "fallback": True,
            "fallback_kind": fallback["fallback_kind"],
            "node_count": fallback["node_count"],
            "edge_count": fallback["edge_count"],
            "formulation_stale": stale_result["marked"],
        }
        if stale_result["warning"]:
            state_patch["warning"] = stale_result["warning"]
        return _store_state(user_id, state_patch)

    current = get_graph_state(user_id)
    if current.get("status") == "running":
        if not _is_running_state_stale(current):
            return current
        job_id = str(uuid.uuid4())
        _ensure_graph_dirs(user_id)
        graph_source_payload = build_graph_source_payload(user_id)
        fallback = _build_local_provisional_graph(
            user_id=user_id,
            job_id=job_id,
            graph_source_payload=graph_source_payload,
            error=TimeoutError("Previous MiroFish graph build stayed running too long."),
        )
        from api.services.mental_model import try_mark_mental_model_stale

        stale_result = try_mark_mental_model_stale(
            user_id,
            reason=(
                "Provisional local graph created after stale MiroFish graph "
                f"task with snapshot {fallback['snapshot_id']}."
            ),
        )
        state_patch = {
            "job_id": job_id,
            "source": source,
            "status": "completed",
            "message": (
                "Generated a RewindAI relationship/decision graph draft because "
                "the hosted MiroFish build was taking too long."
            ),
            "progress": 100,
            "snapshot_id": fallback["snapshot_id"],
            "fallback": True,
            "fallback_kind": fallback["fallback_kind"],
            "node_count": fallback["node_count"],
            "edge_count": fallback["edge_count"],
            "formulation_stale": stale_result["marked"],
            "warning": "Previous MiroFish graph build stayed running too long.",
        }
        if stale_result["warning"]:
            state_patch["stale_warning"] = stale_result["warning"]
        return _store_state(user_id, state_patch)

    job_id = str(uuid.uuid4())
    started_state = _store_state(
        user_id,
        {
            "job_id": job_id,
            "source": source,
            "status": "running",
            "message": "Graph rebuild started: preparing relationship and decision evidence.",
            "progress": 1,
            "error": None,
        },
    )

    async def _job_wrapper() -> None:
        try:
            await _run_rebuild_job(user_id=user_id, job_id=job_id)
        except Exception as exc:
            try:
                _ensure_graph_dirs(user_id)
                graph_source_payload = build_graph_source_payload(user_id)
                fallback = _build_local_provisional_graph(
                    user_id=user_id,
                    job_id=job_id,
                    graph_source_payload=graph_source_payload,
                    error=exc,
                )
                from api.services.mental_model import try_mark_mental_model_stale

                stale_result = try_mark_mental_model_stale(
                    user_id,
                    reason=(
                        "Provisional local graph created from StorySage interview "
                        f"grounding with snapshot {fallback['snapshot_id']}."
                    ),
                )
                state_patch = {
                    "status": "completed",
                    "message": (
                        "Generated a RewindAI relationship/decision graph draft from StorySage evidence. "
                        "MiroFish sync can be retried later."
                    ),
                    "progress": 100,
                    "snapshot_id": fallback["snapshot_id"],
                    "fallback": True,
                    "fallback_kind": fallback["fallback_kind"],
                    "node_count": fallback["node_count"],
                    "edge_count": fallback["edge_count"],
                    "formulation_stale": stale_result["marked"],
                    "warning": sanitize_public_error_text(exc),
                }
                if stale_result["warning"]:
                    state_patch["stale_warning"] = stale_result["warning"]
                _store_state(user_id, state_patch)
            except Exception as fallback_exc:
                _store_state(
                    user_id,
                    {
                        "status": "failed",
                        "message": "Graph rebuild failed and provisional fallback failed.",
                        "error": sanitize_public_error_text(exc),
                        "fallback_error": sanitize_public_error_text(fallback_exc),
                    },
                )

    asyncio.create_task(_job_wrapper())
    return started_state

