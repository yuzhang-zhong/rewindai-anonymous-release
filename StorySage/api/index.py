import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"

if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

# Vercel serverless functions only provide writable temporary storage.
os.environ.setdefault("DATA_DIR", "/tmp/storysage-data")
os.environ.setdefault("LOGS_DIR", "/tmp/storysage-logs")
os.environ.setdefault("USER_AGENT_PROFILES_DIR", "/tmp/storysage-data/sample_user_profiles")
database_url = os.getenv("DATABASE_URL", "")
postgres_url = os.getenv("POSTGRES_URL", "")
if not database_url or (postgres_url and database_url.startswith("sqlite:////tmp/")):
    os.environ["DATABASE_URL"] = postgres_url or "sqlite:////tmp/storysage-data/interview_app.db"
os.environ.setdefault("STORYSAGE_AUTO_SETUP_DB", "true")
os.environ.setdefault("MIROFISH_GRAPH_SYNC_ENABLED", "false")

from api.app import app  # noqa: E402
