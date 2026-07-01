"""Prepare a local StorySage fixture for HTTP-level RewindAI loop checks."""

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_ROOT))

os.environ.setdefault(
    "STORYSAGE_JWT_SECRET",
    "storysage-local-http-fixture-jwt-secret-000000000000",
)
load_dotenv(PROJECT_ROOT / ".env", override=False)

from api.core.auth import create_access_token  # noqa: E402


def _data_root() -> Path:
    data_dir = Path(os.getenv("DATA_DIR", "data"))
    if data_dir.is_absolute():
        return data_dir
    return PROJECT_ROOT / data_dir


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-id", default="rewindai_http_smoke_user")
    args = parser.parse_args()

    user_id = args.user_id
    user_dir = _data_root() / user_id
    graph_dir = user_dir / "graph"
    graph_dir.mkdir(parents=True, exist_ok=True)

    biography = {
        "content": (
            "I am 20 years old and once lived at 123 Green Street. "
            "My advisor and a close classmate often pulled me in opposite directions: "
            "one valued ambition and public achievement, while the other needed emotional support. "
            "When energy was limited, I usually tried to help but looked for a boundary that would not damage trust."
        )
    }
    (user_dir / "biography_1.json").write_text(
        json.dumps(biography, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    graph_state = {
        "user_id": user_id,
        "status": "completed",
        "message": "HTTP smoke fixture graph is available.",
        "progress": 100,
        "updated_at": "http-smoke-fixture",
    }
    (graph_dir / "current_state.json").write_text(
        json.dumps(graph_state, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    graph_data = {
        "snapshot_id": "http-smoke-fixture",
        "updated_at": "http-smoke-fixture",
        "source_manifest": {
            "version": "1.0",
            "sources": [
                {
                    "id": "privacy_safe_autobiography",
                    "kind": "confirmed_autobiographical_grounding",
                    "status": "confirmed",
                },
                {
                    "id": "downstream_behavioral_traces",
                    "kind": "tentative_simulation_evidence",
                    "status": "tentative",
                },
            ],
        },
        "graph_data": {
            "nodes": [
                {"id": "advisor", "name": "advisor"},
                {"id": "classmate", "name": "close classmate"},
            ],
            "edges": [
                {"source": "advisor", "target": "classmate", "type": "conflict"},
                {"source": "classmate", "target": "advisor", "type": "trust"},
            ],
        },
    }
    (graph_dir / "current_data.json").write_text(
        json.dumps(graph_data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "user_id": user_id,
                "token": create_access_token({"sub": user_id}),
                "data_dir": str(_data_root()),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
