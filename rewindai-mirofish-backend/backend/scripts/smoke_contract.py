"""Dependency-light contract smoke test for the MiroFish backend.

This intentionally avoids external LLM/Zep calls. It verifies the Flask app
factory, health route, graph route registration, and basic request validation
used by the StorySage integration.
"""

import os
import sys
from io import BytesIO
from pathlib import Path
from typing import Any
from unittest.mock import patch


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))


def expect(condition: bool, label: str, detail: Any = None) -> None:
    if condition:
        print(f"PASS {label}")
        return

    print(f"FAIL {label}")
    if detail is not None:
        print(f"     {detail}")
    raise SystemExit(1)


def expect_no_public_secret_leak(payload: Any, label: str) -> None:
    serialized = repr(payload)
    lowered = serialized.lower()
    expect("traceback" not in lowered, f"{label} does not expose traceback", payload)
    expect("<OPENAI_API_KEY_PLACEHOLDER>" not in serialized, f"{label} redacts OpenAI-style key", payload)
    expect("<USER_HOME>" not in serialized, f"{label} redacts local path", payload)


def main() -> None:
    os.environ.setdefault("LLM_API_KEY", "smoke-key")
    os.environ.setdefault("ZEP_API_KEY", "smoke-key")

    from app import create_app
    from app.config import Config
    from app.utils.logger import sanitize_log_message

    app = create_app()
    client = app.test_client()

    health = client.get("/health")
    expect(health.status_code == 200, "health route returns 200", health.data)
    health_json = health.get_json()
    expect(
        health_json.get("service") == "MiroFish Backend" and health_json.get("status") == "ok",
        "health route returns expected service payload",
        health_json,
    )
    expect(
        health_json.get("runtime", {}).get("cors", {}).get("wildcard") is True,
        "health route exposes local-dev CORS wildcard status",
        health_json,
    )
    original_env = Config.ENVIRONMENT
    original_origins = list(Config.CORS_ORIGINS)
    original_secret = Config.SECRET_KEY
    try:
        Config.ENVIRONMENT = "production"
        Config.CORS_ORIGINS = ["*"]
        Config.SECRET_KEY = "mirofish-secret-key"
        production_status = Config.runtime_status()
        expect(
            production_status["production"] is True and production_status["configured"] is False,
            "production runtime rejects unsafe MiroFish defaults",
            production_status,
        )
        expect(
            any("MIROFISH_CORS_ORIGINS" in item for item in production_status["errors"]),
            "production runtime rejects wildcard CORS",
            production_status,
        )
        expect(
            any("SECRET_KEY" in item for item in production_status["errors"]),
            "production runtime rejects development secret key",
            production_status,
        )
        Config.CORS_ORIGINS = ["https://storysage.example.com"]
        Config.SECRET_KEY = "mirofish-smoke-secret-that-is-not-default"
        production_status = Config.runtime_status()
        expect(
            production_status["production"] is True and production_status["configured"] is True,
            "production runtime accepts explicit CORS and non-development secret",
            production_status,
        )
    finally:
        Config.ENVIRONMENT = original_env
        Config.CORS_ORIGINS = original_origins
        Config.SECRET_KEY = original_secret

    routes = {rule.rule for rule in app.url_map.iter_rules()}
    required_routes = {
        "/api/graph/ontology/generate",
        "/api/graph/build",
        "/api/graph/task/<task_id>",
        "/api/graph/data/<graph_id>",
    }
    missing = sorted(required_routes - routes)
    expect(not missing, "StorySage graph integration routes are registered", missing)

    ontology_response = client.post(
        "/api/graph/ontology/generate",
        data={"simulation_requirement": "smoke"},
    )
    expect(
        ontology_response.status_code == 400,
        "ontology route validates missing files without external calls",
        ontology_response.get_json(),
    )
    expect(
        ontology_response.get_json().get("success") is False,
        "ontology validation returns success false",
        ontology_response.get_json(),
    )

    build_response = client.post("/api/graph/build", json={})
    expect(
        build_response.status_code == 400,
        "graph build route validates missing project_id without external calls",
        build_response.get_json(),
    )
    expect(
        build_response.get_json().get("success") is False,
        "graph build validation returns success false",
        build_response.get_json(),
    )

    sensitive_error = (
        "provider failed api_key=<OPENAI_API_KEY_PLACEHOLDER> "
        "at <USER_HOME>\\secret.txt"
    )
    sanitized_log = sanitize_log_message(
        "Traceback (most recent call last): "
        f"{sensitive_error}"
    )
    expect("traceback" in sanitized_log.lower(), "log sanitizer keeps traceback boundary marker")
    expect("<OPENAI_API_KEY_PLACEHOLDER>" not in sanitized_log, "log sanitizer redacts OpenAI-style key")
    expect("<USER_HOME>" not in sanitized_log, "log sanitizer redacts local path")

    def fail_generate(*_: Any, **__: Any) -> None:
        raise RuntimeError(sensitive_error)

    with patch("app.api.graph.OntologyGenerator.generate", fail_generate):
        ontology_error_response = client.post(
            "/api/graph/ontology/generate",
            data={
                "simulation_requirement": "privacy smoke",
                "files": (BytesIO(b"hello from smoke"), "source.txt"),
            },
            content_type="multipart/form-data",
        )
    expect(
        ontology_error_response.status_code == 500,
        "ontology route converts internal exceptions to safe public errors",
        ontology_error_response.get_json(),
    )
    expect_no_public_secret_leak(
        ontology_error_response.get_json(),
        "ontology error response",
    )

    class FailingGraphBuilder:
        def __init__(self, *_: Any, **__: Any) -> None:
            pass

        def get_graph_data(self, graph_id: str) -> None:
            raise RuntimeError(sensitive_error)

    with patch("app.api.graph.GraphBuilderService", FailingGraphBuilder):
        graph_data_error_response = client.get("/api/graph/data/graph_smoke")
    expect(
        graph_data_error_response.status_code == 500,
        "graph data route converts internal exceptions to safe public errors",
        graph_data_error_response.get_json(),
    )
    expect_no_public_secret_leak(
        graph_data_error_response.get_json(),
        "graph data error response",
    )

    class FailingZepEntityReader:
        def filter_defined_entities(self, *_: Any, **__: Any) -> None:
            raise RuntimeError(sensitive_error)

    with patch("app.api.simulation.ZepEntityReader", lambda: FailingZepEntityReader()):
        simulation_error_response = client.get("/api/simulation/entities/graph_smoke")
    expect(
        simulation_error_response.status_code == 500,
        "simulation route converts internal exceptions to safe public errors",
        simulation_error_response.get_json(),
    )
    expect_no_public_secret_leak(
        simulation_error_response.get_json(),
        "simulation error response",
    )

    class FailingSimulationManager:
        def get_simulation(self, *_: Any, **__: Any) -> None:
            raise RuntimeError(sensitive_error)

    with patch("app.api.report.SimulationManager", lambda: FailingSimulationManager()):
        report_error_response = client.post(
            "/api/report/generate",
            json={"simulation_id": "sim_smoke"},
        )
    expect(
        report_error_response.status_code == 500,
        "report route converts internal exceptions to safe public errors",
        report_error_response.get_json(),
    )
    expect_no_public_secret_leak(
        report_error_response.get_json(),
        "report error response",
    )

    print("PASS MiroFish contract smoke test completed")


if __name__ == "__main__":
    main()
