# RewindAI MiroFish Backend

Backend-only deployment package for connecting StorySage/RewindAI to MiroFish graph construction.

This repository intentionally excludes the original MiroFish frontend, local uploads, logs, virtual environments, and `.env` files.

## Required Environment Variables

Configure these in the hosting platform, not in git:

```env
FLASK_DEBUG=false
MIROFISH_ENV=production
PORT=5001
SECRET_KEY=<long-random-secret>
MIROFISH_CORS_ORIGINS=<public-frontend-origin>,<optional-preview-origin>
LLM_API_KEY=<openai-compatible-api-key>
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL_NAME=gpt-4o-mini
ZEP_API_KEY=<zep-cloud-api-key>
```

## Render Deployment

The included `render.yaml` is the preferred deployment path because graph construction uses background work and persistent upload folders.

1. Create a new Render Blueprint from this repository.
2. Set the secret environment variables above.
3. Wait for `/health` to report `runtime.configured=true`.
4. Configure StorySage:

```env
MIROFISH_GRAPH_SYNC_ENABLED=true
MIROFISH_BASE_URL=<public-graph-backend-url>
```

## Local Smoke Test

```powershell
cd backend
python scripts/smoke_contract.py
```
