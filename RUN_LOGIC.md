# RewindAI Run Logic

This file summarizes the local demo flow without including deployment history, maintainer identities, private machine paths, project IDs, or hosted service aliases.

## Components

- `StorySage/`: backend API for accounts, interview sessions, biography generation, graph/model state, simulation trace ingestion, reflection chat, and admin summaries.
- `StorySage_Frontend/`: main RewindAI cockpit, group workflow UI, biography page, graph/model controls, reflection chats, and admin UI.
- `Rewind-reigns/`: `simulation-test`, a public campus decision simulation that sends privacy-safe traces back to StorySage.
- `rewindai-mirofish-backend/`: lightweight graph-backend compatibility service.

## Local Startup

Use separate terminals for each service.

```powershell
cd "<PROJECT_ROOT>\StorySage"
python -m uvicorn api.index:app --host 127.0.0.1 --port 8000
```

```powershell
cd "<PROJECT_ROOT>\StorySage_Frontend"
npm install
npm run dev
```

```powershell
cd "<PROJECT_ROOT>\Rewind-reigns"
npm install
npm run dev
```

Optional graph compatibility service:

```powershell
cd "<PROJECT_ROOT>\rewindai-mirofish-backend\backend"
python -m flask --app app run --host 127.0.0.1 --port 5050
```

## Environment Variables

Do not commit real values. Use local untracked `.env` files or hosting-provider environment variable settings.

Backend examples:

```env
OPENAI_API_KEY=<provider-key>
DATABASE_URL=<postgres-or-sqlite-url>
DATA_DIR=./data
LOGS_DIR=./logs
REWINDAI_ADMIN_TOKEN=<admin-token>
MIROFISH_BASE_URL=<graph-backend-url>
MIROFISH_GRAPH_SYNC_ENABLED=false
PUBLIC_FRONTEND_URL=<frontend-url>
```

Frontend examples:

```env
VITE_API_BASE_URL=<storysage-api-url>
VITE_REWIND_APP_URL=<simulation-test-url>
```

Simulation examples:

```env
VITE_STORYSAGE_API_BASE_URL=<storysage-api-url>
```

## User Flow

Group 1:

1. Start with `simulation-test`.
2. Write a self-authored reflection.
3. Replay and submit the second run.

Group 2:

1. Start with `simulation-test`.
2. Use general AI reflection based only on the game report.
3. Replay and submit the second run.

Group 3:

1. Complete the natural interview.
2. Generate biography, relationship/decision graph, and mental-model draft.
3. Play the first public random simulation run.
4. Return to the cockpit and discuss unchosen paths with the clone reflection chat.
5. Replay and submit the second run.

Anonymous experience:

1. Explore interview, graph/model, clone reflection, and simulation in any order.
2. Clone reflection works without a game trace; traces only add an extra signal when available.
3. Optional product feedback can be saved for usability analysis.

## Verification

Run the available project checks before sharing:

```powershell
cd "<PROJECT_ROOT>\StorySage_Frontend"
npm run build
```

```powershell
cd "<PROJECT_ROOT>\StorySage"
python -m compileall src
```

Recommended smoke checks:

- Register a user in each group.
- Confirm the cockpit displays the correct workflow.
- Confirm interview send/finish, biography generation, graph/model generation, clone reflection chat, and simulation handoff.
- Confirm admin summaries load with an admin token.
- Confirm no API keys, credentials, local machine paths, logs, SQLite files, or deployment IDs are committed.
