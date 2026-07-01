# RewindAI

RewindAI is a research prototype for decision-centered autobiographical
grounding. The system asks users to tell natural stories, converts those stories
into a privacy-aware biography, relationship/decision graph, and mental-model
draft, then uses a campus decision simulation to support reflection on future
choices.

The project is designed around one central question:

> Can a natural-language personal grounding process help people inspect how they
> make decisions, compare alternative paths, and reflect before replaying a
> decision scenario?

This repository is an anonymous release. It does not include real API keys,
database passwords, local machine paths, hosting-owner URLs, `.env` files,
runtime logs, local databases, or personal credential files.

## What This Prototype Does

RewindAI combines four layers:

1. **Natural autobiographical interview**  
   Users describe meaningful moments in their own words. The system encourages
   concrete turning points, trade-offs, uncertainty, relationship pressure, and
   decision boundaries without turning the interview into a questionnaire.

2. **Grounding and interpretation layer**  
   StorySage produces an editable biography, an evidence-bounded
   relationship/decision graph, and a plain-language mental model. These outputs
   are treated as hypotheses, not psychological diagnoses.

3. **simulation-test**  
   A public campus decision game presents the same shared scenario deck to users.
   The game records choices, outcomes, resource changes, response timing, and
   failure categories as behavioral traces.

4. **Reflection support**  
   Depending on the assigned condition, users reflect alone, with a generic AI
   assistant, or with a clone-style assistant grounded in their own biography,
   graph, mental model, and first-run simulation trace.

## Repository Layout

| Path | Role |
| --- | --- |
| `StorySage/` | Backend API for accounts, interviews, biographies, graph/model state, clone reflection, trace ingestion, admin summaries, and persistence. |
| `StorySage_Frontend/` | Main RewindAI web cockpit and admin dashboard. This is the participant-facing frontend. |
| `Rewind-reigns/` | `simulation-test`, the campus decision simulation module used for behavioral traces. |
| `rewindai-mirofish-backend/` | Backend-only graph compatibility package. The frontend from the original graph project is intentionally not used here. |
| `docs/` | Design notes and technical documentation. |
| `deploy/` | Deployment examples with placeholders only. |
| `images/` | Architecture and framework figures used in documentation/poster drafts. |

## User Conditions

The prototype supports four entry modes.

| Mode | User-facing purpose | Flow |
| --- | --- | --- |
| `blank` / Group 1 | Baseline self-reflection | First simulation run -> self-written reflection -> second simulation run. |
| `contrast` / Group 2 | Generic AI reflection baseline | First simulation run -> general AI reflection using only the game report -> second simulation run. |
| `experiment` / Group 3 | Full RewindAI clone condition | Natural interview -> biography/graph/model -> first simulation run -> clone reflection -> second simulation run. |
| `anonymous` | Open product experience | Interview, graph, model, simulation, and clone-style reflection without research step labels. |

## Agent and Model Design

RewindAI separates responsibilities across lightweight agents and services.

- **Interviewer Agent** keeps the conversation natural, mirrors the user's story,
  and asks focused follow-up questions about concrete moments, trade-offs,
  missing information, decision boundaries, and counterfactual variables.
- **Session Scribe Agent** stores session memory and privacy-safe notes so that
  later biography, graph, and model generation can use stable evidence.
- **Session Coordinator / Planner Agent** keeps the interview scoped. It nudges
  the user toward a small number of meaningful topics rather than asking for a
  full life history.
- **Biography Writer Agent** turns interview evidence into an editable
  autobiography with an explicit decision-logic analysis section.
- **Graph Builder** extracts typed nodes such as people/roles, decision episodes,
  relationship pressure, protected values, trade-offs, uncertainty, and decision
  rules.
- **Mental Model Formulator** summarizes early, evidence-grounded hypotheses
  about how the user weighs choices.
- **Reflection Assistant** supports three reflection modes: self-reflection,
  generic AI reflection, and clone-style reflection grounded in the user's own
  model and trace evidence.
- **Admin Aggregator** summarizes privacy-bounded study data, group assignment,
  simulation traces, reflection status, feedback, and clone similarity.

## Graph Design

The graph is not a generic mind map. It is intended to represent decision
structure.

Typical node types:

- `self`
- `person_or_role`
- `decision_episode`
- `relationship_pressure`
- `value_or_goal`
- `tradeoff`
- `uncertainty`
- `decision_rule`
- `simulation_signal`

Typical edge types:

- `involved_in`
- `pressured_by`
- `balanced_against`
- `protected`
- `risked`
- `conditioned_by`
- `suggests_rule`
- `tentative_trace_signal`

Interview and biography evidence is treated as confirmed autobiographical
grounding. simulation-test traces are treated as tentative behavioral signals.

## Data Collected by the Demo

The current prototype focuses on compact behavioral and reflection data rather
than broad demographic collection.

Collected or derived data includes:

- anonymous user ID and assigned group;
- interview/session counts and biography/model/graph availability;
- simulation run summaries;
- card IDs, decision directions, card domains, risk levels, response time,
  before/after resource states, and failure categories;
- reflection type and status;
- clone-similarity summaries for Group 3 when available;
- product feedback for anonymous/open experience mode;
- privacy-signal counts and collection-event metadata.

The admin dashboard is designed to avoid showing raw interview transcripts by
default.

## Privacy and Security Boundaries

This anonymous release is configured to avoid committing sensitive material.

Do not commit:

- model provider API keys;
- database URLs containing passwords;
- service-role or admin tokens;
- local `.env` files;
- local SQLite databases or logs;
- credential JSON files;
- Vercel/hosting local state;
- personal machine paths;
- deployment-owner URLs or project IDs.

Use placeholders in documentation and configure real values only through a local
untracked `.env` file or the deployment platform's environment-variable UI.

Important environment variables:

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

Install dependencies separately for each service.

### 1. StorySage backend

```powershell
cd StorySage
pip install -r requirements.txt
python src/main.py --mode setup_db
python src/main.py --mode server --port 8000
```

### 2. RewindAI frontend

```powershell
cd StorySage_Frontend
npm install
npm run dev
```

Default local URL: `http://127.0.0.1:5173`

### 3. simulation-test

```powershell
cd Rewind-reigns
npm install
npm run dev
```

Default local URL: `http://127.0.0.1:5174`

### 4. Optional graph backend

```powershell
cd rewindai-mirofish-backend/backend
pip install -r requirements.txt
python run.py
```

The StorySage local graph fallback can still produce a relationship/decision
graph when this optional backend is unavailable.

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

For the broader local demo flow, see `RUN_LOGIC.md`.

## Research Use

The prototype supports an ablation-style comparison:

- Group 1 estimates what users do with self-reflection only.
- Group 2 estimates what changes when users receive generic AI reflection.
- Group 3 estimates what changes when reflection is grounded in the user's own
  autobiographical model and first-run trace.
- Anonymous mode supports open-ended product experience and feedback collection.

The current implementation is a demo/research prototype, not a clinical or
psychological assessment system. Generated biographies, graphs, and mental
models should be interpreted as reflective hypotheses.

## Additional Documentation

- `RUN_LOGIC.md` explains the local demo sequence.
- `REWINDAI_ACCEPTANCE_MATRIX.md` lists verification gates.
- `REWINDAI_PROJECT_TECHNICAL_DOCUMENTATION.md` describes the project design,
  agents, data flow, and research instrumentation in more detail.
- `StorySage/readme.md`, `StorySage_Frontend/README.md`, and
  `Rewind-reigns/README.md` document the major submodules.
