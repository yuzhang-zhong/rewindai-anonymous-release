import json
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse

from api.core.auth import create_scoped_token, get_current_user, get_user_from_token
from api.core.errors import sanitize_public_error_text
from api.services.mirofish_graph_sync import (
    get_graph_data,
    get_graph_state,
    trigger_graph_rebuild,
)


router = APIRouter(tags=["graph"])
GRAPH_VIEW_SCOPE = "graph_view"
GRAPH_VIEW_TOKEN_EXPIRE_MINUTES = 10


def _resolve_user_id(current_user: str, user_id: Optional[str]) -> str:
    target = user_id or current_user
    if target != current_user:
        raise HTTPException(status_code=403, detail="You can only access your own graph.")
    return target


def _json_for_script(payload) -> str:
    """Serialize JSON safely for inline script contexts."""
    return json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")


@router.post("/graph/public/rebuild")
async def rebuild_graph_public(
    user_id: Optional[str] = Query(default=None),
    current_user: str = Depends(get_current_user),
):
    target_user = _resolve_user_id(current_user, user_id)
    state = trigger_graph_rebuild(target_user, source="public_endpoint")
    return {"success": True, "data": state}


@router.get("/graph/public/state")
async def get_graph_public_state(
    user_id: Optional[str] = Query(default=None),
    current_user: str = Depends(get_current_user),
):
    target_user = _resolve_user_id(current_user, user_id)
    return {"success": True, "data": get_graph_state(target_user)}


@router.get("/graph/public/current/data")
async def get_graph_public_data(
    user_id: Optional[str] = Query(default=None),
    current_user: str = Depends(get_current_user),
):
    target_user = _resolve_user_id(current_user, user_id)
    try:
        payload = get_graph_data(target_user)
    except FileNotFoundError as exc:
        print(f"graph public data not found: {sanitize_public_error_text(exc)}")
        raise HTTPException(status_code=404, detail="Graph data not found") from exc
    return {"success": True, "data": payload}


@router.get("/graph/public/view-token")
async def get_graph_view_token(
    user_id: Optional[str] = Query(default=None),
    current_user: str = Depends(get_current_user),
):
    target_user = _resolve_user_id(current_user, user_id)
    token = create_scoped_token(
        target_user,
        GRAPH_VIEW_SCOPE,
        timedelta(minutes=GRAPH_VIEW_TOKEN_EXPIRE_MINUTES),
    )
    return {
        "success": True,
        "data": {
            "view_token": token,
            "expires_in_minutes": GRAPH_VIEW_TOKEN_EXPIRE_MINUTES,
        },
    }


@router.get("/graph/ui", response_class=HTMLResponse)
async def graph_ui(
    user_id: Optional[str] = Query(default=None),
    access_token: Optional[str] = Query(default=None),
    view_token: Optional[str] = Query(default=None),
    lang: Optional[str] = Query(default="en"),
):
    if view_token:
        current_user = get_user_from_token(view_token, required_scope=GRAPH_VIEW_SCOPE)
    elif access_token:
        current_user = get_user_from_token(access_token)
    else:
        raise HTTPException(status_code=401, detail="Missing graph viewer token")
    target_user = _resolve_user_id(current_user, user_id)
    state = get_graph_state(target_user)

    try:
        graph_payload = get_graph_data(target_user)
        graph_data = graph_payload.get("graph_data", {})
        source_manifest = graph_payload.get("source_manifest") or {}
        fallback = graph_payload.get("fallback") or {}
    except FileNotFoundError:
        graph_data = {"nodes": [], "edges": []}
        source_manifest = {}
        fallback = {}

    target_user_json = _json_for_script(target_user)
    graph_data_json = _json_for_script(graph_data)
    state_json = _json_for_script(state)
    source_manifest_json = _json_for_script(source_manifest)
    fallback_json = _json_for_script(fallback)
    language_json = _json_for_script("zh" if lang == "zh" else "en")

    return HTMLResponse(
        f"""<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>StorySage Graph Viewer</title>
    <script src="https://cdn.jsdelivr.net/npm/cytoscape@3.30.3/dist/cytoscape.min.js"></script>
    <style>
      body {{
        font-family: Arial, sans-serif;
        margin: 0;
        background: #111827;
        color: #e5e7eb;
      }}
      .header {{
        padding: 12px 16px;
        border-bottom: 1px solid #374151;
        background: #0f172a;
      }}
      #cy {{
        width: 100vw;
        height: calc(100vh - 92px);
      }}
      .graph-shell {{
        display: grid;
        grid-template-columns: minmax(0, 1fr) 320px;
        height: calc(100vh - 92px);
      }}
      .detail-panel {{
        border-left: 1px solid #334155;
        background: rgba(15, 23, 42, 0.92);
        padding: 18px;
        overflow: auto;
      }}
      .detail-panel h2 {{
        font-size: 18px;
        line-height: 1.25;
        margin: 0 0 8px;
      }}
      .detail-panel p {{
        color: #cbd5e1;
        font-size: 13px;
        line-height: 1.55;
      }}
      .chip {{
        background: #1e293b;
        border: 1px solid #475569;
        border-radius: 999px;
        color: #dbeafe;
        display: inline-block;
        font-size: 11px;
        margin: 4px 4px 0 0;
        padding: 3px 8px;
      }}
      .legend {{
        color: #94a3b8;
        font-size: 12px;
        margin-top: 12px;
      }}
      .meta {{
        font-size: 12px;
        color: #9ca3af;
        margin-top: 4px;
      }}
      .evidence {{
        font-size: 12px;
        color: #cbd5e1;
        margin-top: 6px;
      }}
      .evidence code {{
        background: #1f2937;
        border: 1px solid #374151;
        border-radius: 999px;
        color: #bfdbfe;
        display: inline-block;
        margin: 2px 4px 0 0;
        padding: 2px 7px;
      }}
      .fallback {{
        color: #fde68a;
        font-size: 12px;
        margin-top: 4px;
      }}
      .warning {{
        padding: 12px 16px;
        color: #fca5a5;
      }}
      @media (max-width: 860px) {{
        .graph-shell {{
          grid-template-columns: 1fr;
          grid-template-rows: minmax(420px, 1fr) auto;
        }}
        .detail-panel {{
          border-left: 0;
          border-top: 1px solid #334155;
          max-height: 240px;
        }}
      }}
    </style>
  </head>
  <body>
    <div class="header">
      <div><strong>User:</strong> <span id="target-user"></span></div>
      <div class="meta" id="state"></div>
      <div class="evidence" id="evidence"></div>
    </div>
    <div class="graph-shell">
      <div id="cy"></div>
      <aside class="detail-panel">
        <h2 id="detail-title"></h2>
        <p id="detail-copy"></p>
        <div id="detail-meta"></div>
        <div class="legend" id="legend"></div>
      </aside>
    </div>
    <script>
      const targetUser = {target_user_json};
      const state = {state_json};
      const graphData = {graph_data_json};
      const sourceManifest = {source_manifest_json};
      const fallback = {fallback_json};
      const language = {language_json};
      const isZh = language === "zh";
      const text = {{
        status: isZh ? "状态" : "Status",
        updated: isZh ? "更新" : "Updated",
        unknown: isZh ? "未知" : "unknown",
        evidence: isZh ? "证据边界：" : "Evidence boundary: ",
        fallbackDraft: isZh
          ? "正在查看 RewindAI 关系/决策图谱草稿；MiroFish 同步不可用时会使用这个本地图谱。"
          : "Viewing RewindAI relationship/decision graph draft while MiroFish sync is unavailable.",
        fallbackGeneric: isZh ? "正在查看临时图谱草稿。" : "Viewing provisional graph fallback.",
        noGraph: isZh ? "还没有图谱数据。请先点击 Generate graph。" : "No graph data yet. Trigger rebuild first.",
        clickNode: isZh
          ? "点击一个节点或箭头，可以查看它代表的关系、事件、决策线索或心理机制。"
          : "Click a node or edge to inspect the relationship, incident, decision signal, or psychological mechanism it represents.",
        selected: isZh ? "当前节点" : "Selected node",
        selectedEdge: isZh ? "当前关系" : "Selected relationship",
        type: isZh ? "类型" : "Type",
        evidenceStatus: isZh ? "证据状态" : "Evidence status",
        source: isZh ? "来源" : "Source",
        legend: isZh
          ? "颜色表示节点类型：绿色=用户，蓝色=关系，橙色=事件/取舍，粉色=压力，紫色=决策规则，青色=simulation-test 信号。"
          : "Color shows node type: green=user, blue=relationship, orange=episode/trade-off, pink=pressure, purple=decision rule, teal=simulation-test signal.",
      }};
      document.getElementById("target-user").textContent = targetUser;
      const stateEl = document.getElementById("state");
      stateEl.textContent = `${{text.status}}: ${{state.status || text.unknown}} | ${{text.updated}}: ${{state.updated_at || "n/a"}}`;
      const evidenceEl = document.getElementById("evidence");
      const manifestSources = Array.isArray(sourceManifest.sources) ? sourceManifest.sources : [];
      if (manifestSources.length) {{
        evidenceEl.appendChild(document.createTextNode(text.evidence));
        for (const source of manifestSources) {{
          const chip = document.createElement("code");
          chip.textContent = `${{source.kind || source.id || "unknown"}}: ${{source.status || "unknown"}}`;
          evidenceEl.appendChild(chip);
        }}
      }}
      if (fallback && fallback.used) {{
        const fallbackEl = document.createElement("div");
        fallbackEl.className = "fallback";
        fallbackEl.textContent = fallback.kind === "relationship_decision_graph_draft"
          ? text.fallbackDraft
          : (fallback.reason || text.fallbackGeneric);
        document.querySelector(".header").appendChild(fallbackEl);
      }}
      document.getElementById("detail-title").textContent = isZh ? "图谱说明" : "Graph Details";
      document.getElementById("detail-copy").textContent = text.clickNode;
      document.getElementById("legend").textContent = text.legend;

      const labelForNode = (n) => {{
        if (isZh) return n.label_zh || n.name || n.label || n.label_en || n.id;
        return n.label_en || n.name || n.label || n.label_zh || n.id;
      }};
      const detailForNode = (n) => {{
        if (isZh) return n.detail_zh || n.detail || n.detail_en || "";
        return n.detail_en || n.detail || n.detail_zh || "";
      }};
      const labelForEdge = (e) => {{
        if (isZh) return e.label_zh || e.label || e.label_en || e.type || "";
        return e.label_en || e.label || e.label_zh || e.type || "";
      }};
      const detailForEdge = (e) => {{
        if (isZh) return e.detail_zh || e.detail || e.detail_en || "";
        return e.detail_en || e.detail || e.detail_zh || "";
      }};

      const sourceNodes = Array.isArray(graphData.nodes) ? graphData.nodes : [];
      const sourceEdges = Array.isArray(graphData.edges) ? graphData.edges : [];

      const nodes = sourceNodes.map((n, idx) => {{
        const id = (n.id || n.uuid || n.name || `n-${{idx}}`).toString();
        return {{
            data: {{
              id,
              label: labelForNode(n),
              detail: detailForNode(n),
              type: n.type || "unknown",
              evidenceStatus: n.evidence_status || "",
              sourceKind: n.source_kind || ""
            }}
          }};
      }});

      const edges = sourceEdges
        .map((e, idx) => {{
          const source = (e.source || e.from || e.src || "").toString();
          const target = (e.target || e.to || e.dst || "").toString();
          if (!source || !target) return null;
          return {{
            data: {{
              id: (e.id || `e-${{idx}}`).toString(),
              source,
              target,
              label: labelForEdge(e),
              detail: detailForEdge(e),
              type: e.type || "related"
            }}
          }};
        }})
        .filter(Boolean);

      if (!nodes.length) {{
        const warning = document.createElement("div");
        warning.className = "warning";
        warning.textContent = text.noGraph;
        document.getElementById("cy").appendChild(warning);
      }} else {{
        const cy = cytoscape({{
          container: document.getElementById("cy"),
          elements: [...nodes, ...edges],
          style: [
            {{
              selector: "node",
              style: {{
                "background-color": "#3b82f6",
                "label": "data(label)",
                "font-size": "10px",
                "text-wrap": "wrap",
                "text-max-width": "80px",
                "color": "#ffffff",
                "text-outline-width": 1,
                "text-outline-color": "#1e3a8a"
              }}
            }},
            {{ selector: 'node[type = "self"]', style: {{ "background-color": "#22c55e" }} }},
            {{ selector: 'node[type = "person_or_role"]', style: {{ "background-color": "#38bdf8" }} }},
            {{ selector: 'node[type = "decision_episode"]', style: {{ "background-color": "#f97316" }} }},
            {{ selector: 'node[type = "relationship_pressure"]', style: {{ "background-color": "#ec4899" }} }},
            {{ selector: 'node[type = "value_or_goal"]', style: {{ "background-color": "#a3e635" }} }},
            {{ selector: 'node[type = "tradeoff"]', style: {{ "background-color": "#f59e0b" }} }},
            {{ selector: 'node[type = "uncertainty"]', style: {{ "background-color": "#94a3b8" }} }},
            {{ selector: 'node[type = "decision_rule"]', style: {{ "background-color": "#8b5cf6" }} }},
            {{ selector: 'node[type = "simulation_signal"]', style: {{ "background-color": "#14b8a6" }} }},
            {{
              selector: "edge",
              style: {{
                "width": 1.5,
                "line-color": "#64748b",
                "target-arrow-color": "#64748b",
                "target-arrow-shape": "triangle",
                "curve-style": "bezier",
                "label": "data(label)",
                "font-size": "8px",
                "color": "#cbd5e1"
              }}
            }}
          ],
          layout: {{
            name: "cose",
            fit: true,
            padding: 20
          }}
        }});
        const renderDetails = (element, isEdge = false) => {{
          const data = element.data();
          document.getElementById("detail-title").textContent = data.label || (isEdge ? text.selectedEdge : text.selected);
          document.getElementById("detail-copy").textContent = data.detail || text.clickNode;
          const meta = document.getElementById("detail-meta");
          meta.innerHTML = "";
          const items = isEdge
            ? [[text.type, data.type]]
            : [
              [text.type, data.type],
              [text.evidenceStatus, data.evidenceStatus],
              [text.source, data.sourceKind],
            ];
          for (const item of items) {{
            if (!item[1]) continue;
            const chip = document.createElement("span");
            chip.className = "chip";
            chip.textContent = `${{item[0]}}: ${{item[1]}}`;
            meta.appendChild(chip);
          }}
        }};
        cy.on("tap", "node", (event) => renderDetails(event.target, false));
        cy.on("tap", "edge", (event) => renderDetails(event.target, true));
      }}
    </script>
  </body>
</html>
"""
    )

