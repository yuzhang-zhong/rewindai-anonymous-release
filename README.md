# RewindAI

RewindAI is a research prototype for decision-centered autobiographical
grounding. It combines a natural interview, biography generation, a
relationship/decision graph, a plain-language mental model, a campus decision
simulation, and reflection support.

The core question is:

> Can personal grounding from natural language help people inspect how they make
> decisions, reflect on alternative paths, and make different choices in a later
> simulation run?

This is an anonymous release. It excludes real API keys, database passwords,
local machine paths, hosting-owner URLs, `.env` files, logs, local databases, and
credential files.

## System Overview

RewindAI has three main parts:

| Module | Purpose |
| --- | --- |
| `StorySage/` | Backend for interviews, biographies, graph/model generation, reflection, trace ingestion, admin summaries, and persistence. |
| `StorySage_Frontend/` | Main RewindAI web cockpit and admin dashboard. |
| `Rewind-reigns/` | `simulation-test`, a campus decision game that records behavioral traces. |
| `rewindai-mirofish-backend/` | Optional backend-only graph compatibility service. |

The intended flow is:

1. A user tells natural autobiographical stories.
2. StorySage turns those stories into a biography, graph, and mental-model draft.
3. The user plays a shared campus decision simulation.
4. The simulation trace returns to StorySage.
5. The user reflects alone, with generic AI, or with a clone-style assistant.
6. The user replays the simulation and the system summarizes changes.

## Research Conditions

| Mode | Flow |
| --- | --- |
| `blank` / Group 1 | First simulation run -> self-reflection -> second simulation run. |
| `contrast` / Group 2 | First simulation run -> generic AI reflection using only the game report -> second simulation run. |
| `experiment` / Group 3 | Interview -> biography/graph/model -> first simulation run -> clone reflection -> second simulation run. |
| `anonymous` | Open product experience without research step labels. |

## Agents and Evidence

The backend separates the work across lightweight agents:

- **Interviewer** conducts natural conversation and asks focused probes about
  turning points, trade-offs, uncertainty, and relationship pressure.
- **Session Scribe** stores privacy-safe session memory.
- **Session Coordinator / Planner** keeps the interview focused on a few
  meaningful topics rather than a long questionnaire.
- **Biography Writer** creates an editable autobiography with decision-logic
  analysis.
- **Graph Builder** extracts relationship roles, decision episodes, values,
  trade-offs, uncertainty, and decision rules.
- **Mental Model Formulator** summarizes evidence-grounded hypotheses for
  reflection.

Interview/biography evidence is treated as autobiographical grounding.
simulation-test traces are treated as tentative behavioral signals.

## Privacy Boundary

Do not commit:

- model provider keys;
- database URLs with passwords;
- admin or service-role tokens;
- `.env` files;
- local databases or logs;
- credential JSON/PEM/key files;
- local absolute paths;
- hosting project IDs or owner-specific deployment URLs.

Configure real values through untracked local environment files or the hosting
platform environment-variable UI.

Example variables:

```env
OPENAI_API_KEY=<model-provider-key>
DATABASE_URL=<postgres-or-local-sqlite-url>
JWT_SECRET_KEY=<long-random-secret>
REWINDAI_ADMIN_TOKEN=<admin-token>
PUBLIC_FRONTEND_URL=http://127.0.0.1:5173
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_REWIND_APP_URL=http://127.0.0.1:5174
MIROFISH_GRAPH_SYNC_ENABLED=false
MIROFISH_BASE_URL=<optional-public-graph-backend-url>
```

Never expose provider keys through frontend `VITE_*` variables.

## Local Development

Start the backend:

```powershell
cd StorySage
pip install -r requirements.txt
python src/main.py --mode setup_db
python src/main.py --mode server --port 8000
```

Start the main frontend:

```powershell
cd StorySage_Frontend
npm install
npm run dev
```

Start simulation-test:

```powershell
cd Rewind-reigns
npm install
npm run dev
```

Default local URLs:

- RewindAI cockpit: `http://127.0.0.1:5173`
- StorySage API: `http://127.0.0.1:8000`
- simulation-test: `http://127.0.0.1:5174`

## Verification

Useful smoke checks:

```powershell
cd StorySage
python scripts/smoke_rewindai_backend.py
```

```powershell
cd StorySage_Frontend
npm run build
npm run smoke:rewindai-ui
```

```powershell
cd Rewind-reigns
npm run smoke:session
npm run smoke:bridge
```

## More Documentation

- `RUN_LOGIC.md` explains the local demo sequence.
- `REWINDAI_ACCEPTANCE_MATRIX.md` lists verification gates.
- `REWINDAI_PROJECT_TECHNICAL_DOCUMENTATION.md` gives the fuller project,
  agent, graph, and research-design documentation.
