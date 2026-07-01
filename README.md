# RewindAI

RewindAI is a research demo for decision-centered autobiographical grounding. It combines a natural interview, biography generation, relationship/decision graph construction, mental-model drafting, a public campus decision simulation, reflection support, and an admin dashboard for privacy-conscious research data collection.

## Repository Layout

- `StorySage/` — backend API for accounts, interviews, biographies, graph/model state, reflection, trace ingestion, admin summaries, and persistence.
- `StorySage_Frontend/` — main RewindAI web cockpit and admin UI.
- `Rewind-reigns/` — `simulation-test`, the public campus decision simulation used for behavioral traces.
- `rewindai-mirofish-backend/` — lightweight graph backend compatibility service.
- `docs/` — project documentation and research notes.
- `deploy/` — deployment helpers and hosting notes.

## Security Notes

This repository intentionally does not include real API keys, database passwords, Vercel local state, Supabase service-role keys, Google credentials, logs, SQLite databases, or personal machine paths. Configure real values only through the hosting platform environment-variable UI or local untracked `.env` files.

Important environment variables include:

- `OPENAI_API_KEY`
- `DATABASE_URL`
- `REWINDAI_ADMIN_TOKEN`
- `MIROFISH_BASE_URL`
- `MIROFISH_GRAPH_SYNC_ENABLED`

Do not expose model provider keys through frontend `VITE_*` variables.

## Current Research Conditions

- `blank` / Group 1: first simulation run, self-reflection, second run.
- `contrast` / Group 2: first simulation run, general AI reflection without biography or graph context, second run.
- `experiment` / Group 3: interview and model grounding, first simulation run, clone reflection, second run.
- `anonymous`: full open RewindAI experience without study-condition framing.

## Local Development

Install and run each service from its own directory. See `RUN_LOGIC.md` and `REWINDAI_PROJECT_TECHNICAL_DOCUMENTATION.md` for the detailed demo flow, agent design, graph logic, and research instrumentation.
