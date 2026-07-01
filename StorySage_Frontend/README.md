# RewindAI Frontend

Main participant-facing web cockpit and admin dashboard.

## What It Does

- User registration, login, and group assignment.
- Natural interview entry.
- Biography, graph, and mental-model viewing.
- simulation-test launch and account handoff.
- Self, generic AI, and clone-style reflection flows.
- Privacy-bounded admin dashboard.

## Run Locally

```bash
npm install
npm run dev
```

Default local API targets:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_REWIND_APP_URL=http://127.0.0.1:5174
```

## Check

```bash
npm run build
npm run smoke:rewindai-ui
```

Do not put model-provider keys in frontend `VITE_*` variables.
