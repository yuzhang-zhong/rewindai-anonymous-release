# StorySage Backend

StorySage is the autobiographical grounding backend used by RewindAI. It runs a
natural interview, stores conversation state, produces a biography draft, derives
a relationship and decision graph, and builds a plain-language mental model for
reflection support.

This anonymous release removes original author identifiers, private deployment
URLs, local machine paths, and credential files. Configure model providers and
databases through environment variables only.

## Core Agents

- **Interviewer Agent** conducts open-ended conversation and asks focused probes
  when a turning point, trade-off, uncertainty, or relationship pressure appears.
- **Session Scribe Agent** stores privacy-bounded conversation memory and keeps
  the latest session usable across refreshes.
- **Session Coordinator / Planner Agent** keeps the interview scoped to a small
  number of high-value topics rather than a questionnaire.
- **Biography Writer Agent** converts interview evidence into an editable
  autobiographical profile with explicit decision-logic analysis.
- **Graph Builder** extracts relationship roles, decision episodes, values,
  trade-offs, uncertainty, and tentative simulation signals.
- **Mental Model Formulator** summarizes evidence-grounded hypotheses that can
  support clone-style reflection.

## Setup

Requirements:

- Python 3.12+
- A database URL for durable deployments
- A model provider key supplied through environment variables

Install dependencies:

```bash
pip install -r requirements.txt
```

Run database setup:

```bash
python src/main.py --mode setup_db
```

Start the API:

```bash
python src/main.py --mode server --port 8000
```

The frontend package lives in `../StorySage_Frontend`.

## Important Environment Variables

```env
DATABASE_URL=<postgres-or-local-sqlite-url>
OPENAI_API_KEY=<model-provider-key>
JWT_SECRET_KEY=<long-random-secret>
PUBLIC_FRONTEND_URL=http://127.0.0.1:5173
MIROFISH_GRAPH_SYNC_ENABLED=false
MIROFISH_BASE_URL=<optional-graph-backend-url>
REWINDAI_ADMIN_TOKEN=<admin-token>
```

Never commit concrete secrets, service-role tokens, database passwords, or local
credential files.

## Local Smoke Test

```bash
python scripts/smoke_rewindai_backend.py
```

This checks interview, biography, graph, formulation, trace ingestion, privacy
redaction, and admin-data contracts without requiring public deployment.
