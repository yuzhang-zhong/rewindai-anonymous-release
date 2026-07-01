# Graph Backend Compatibility Service

Optional backend-only service for graph construction compatibility.

## What It Does

- Accepts graph-building requests from StorySage.
- Runs backend graph/report logic without shipping a separate graph frontend.
- Can be replaced by StorySage's local graph fallback for simple demos.

## Run Locally

```powershell
cd backend
pip install -r requirements.txt
python run.py
```

## Check

```powershell
cd backend
python scripts/smoke_contract.py
```

Configure secrets and public origins in the hosting platform. Do not commit
`.env` files, API keys, uploads, logs, or local data.
