# StorySage Backend

Backend for RewindAI's interview, biography, graph, mental-model, trace, clone
reflection, and admin-summary APIs.

## What It Does

- Runs natural autobiographical interviews.
- Stores privacy-safe session evidence.
- Generates biography drafts and decision-logic summaries.
- Builds relationship/decision graph data.
- Creates mental-model drafts for reflection.
- Receives simulation-test traces.

## Run Locally

```bash
pip install -r requirements.txt
python src/main.py --mode setup_db
python src/main.py --mode server --port 8000
```

## Smoke Test

```bash
python scripts/smoke_rewindai_backend.py
```

Use environment variables for API keys, database URLs, admin tokens, and graph
backend URLs. Do not commit real secrets or local credential files.
