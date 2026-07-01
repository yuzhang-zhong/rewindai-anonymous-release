"""Smoke test for the local RewindAI backend integration.

This test is intentionally dependency-light:
- no external LLM calls
- no live MiroFish server
- no browser

It verifies the local evidence loop:
privacy sanitizer -> graph constraints -> formulation -> simulation-test handoff
-> trace ingest -> trace summary -> formulation stale marker.

It also protects two browser-facing integration details:
- graph viewer can be opened with a query-token URL
- graph viewer uses a short-lived scoped view token instead of the login token
- privacy prompt guards are present in long-term memory/biography prompts
"""

import asyncio
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from fastapi import HTTPException


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_ROOT))


def expect(condition: bool, label: str, detail: Any = None) -> None:
    if condition:
        print(f"PASS {label}")
        return

    print(f"FAIL {label}")
    if detail is not None:
        print(f"     {detail}")
    raise SystemExit(1)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


async def main() -> None:
    os.environ.setdefault(
        "STORYSAGE_JWT_SECRET",
        "storysage-local-smoke-jwt-secret-000000000000",
    )

    from agents.biography_team.section_writer.prompts import get_prompt as writer_prompt
    from agents.biography_team.session_coordinator.prompts import INTERVIEW_QUESTIONS_PROMPT
    from agents.interviewer.prompts import get_prompt as interviewer_prompt
    from agents.session_scribe.prompts import get_prompt as scribe_prompt
    from agents.session_scribe.tools import UpdateMemoryBank
    from api.app import app, health_check
    from api.core.auth import create_access_token
    from aiohttp import web
    from api.routers.biography import edit_biography, get_latest_biography
    import api.routers.chat as chat_router
    import api.routers.formulation as formulation_router
    import api.routers.graph_public as graph_public_router
    import api.routers.voice as voice_router
    from api.routers.graph_public import get_graph_public_data, get_graph_view_token, graph_ui, rebuild_graph_public
    from api.routers.register import register_user
    from api.schemas.auth import RegisterRequest
    from api.schemas.biography import BiographyEdit, EditData
    from api.schemas.chat import SessionStatus, TopicsFeedbackRequest
    from api.routers.simulation_profile import (
        RewindAIContract,
        SimulationTraceRecord,
        SimulationTraceRequest,
        _create_trace_token,
        _validate_trace_contract,
        get_simulation_profile,
        get_simulation_test_handoff,
        ingest_simulation_trace,
    )
    from api.services.mirofish_graph_sync import build_graph_source_payload
    from api.services.mirofish_graph_sync import get_graph_data
    from api.services.mirofish_graph_sync import get_graph_state
    from api.services.mental_model import (
        build_mental_model_formulation,
        get_current_mental_model_formulation,
        try_mark_mental_model_stale,
    )
    from api.services.privacy import classify_sensitive_content, sanitize_privacy_safe_text
    from api.services.simulation_traces import load_simulation_trace_summary
    from content.biography.biography import Biography
    from content.memory_bank.memory import Memory, MemorySearchResult
    from content.memory_bank.memory_bank_base import MemoryBankBase
    from content.session_agenda.session_agenda import SessionAgenda
    from database.database import SessionLocal, engine
    from database.models import Base, DBSimulationTrace, DBSession, DBUser, DBUserProfile
    from starlette.requests import Request
    from utils.llm.gcp_credentials import (
        require_gcp_credentials_path,
        resolve_gcp_credentials_path,
    )
    from utils.speech.text_to_speech import create_tts_engine

    class SmokeMemoryBank(MemoryBankBase):
        def add_memory(
            self,
            title: str,
            text: str,
            importance_score: int,
            source_interview_response: str,
            metadata: dict[str, Any] | None = None,
            question_ids: list[str] | None = None,
        ) -> Memory:
            memory = Memory(
                id="MEM_SMOKE_PRIVACY",
                title=title,
                text=text,
                metadata=metadata or {},
                importance_score=importance_score,
                timestamp=datetime.now(timezone.utc),
                source_interview_response=source_interview_response,
                question_ids=question_ids or [],
            )
            self.memories.append(memory)
            return memory

        def search_memories(self, query: str, k: int = 5) -> list[MemorySearchResult]:
            return []

        def _save_implementation_specific(self, path: str) -> None:
            return None

        def _load_implementation_specific(self, user_id: str, base_path: str | None = None) -> None:
            return None

    with tempfile.TemporaryDirectory() as temp_dir:
        os.environ["DATA_DIR"] = temp_dir
        user_id = "rewindai_smoke_user"
        user_dir = Path(temp_dir) / user_id

        temp_credential = Path(temp_dir) / "relative-gcp-credentials.json"
        temp_credential.write_text("{}", encoding="utf-8")
        original_cwd = Path.cwd()
        try:
            os.chdir(temp_dir)
            expect(
                resolve_gcp_credentials_path(temp_credential.name) == temp_credential.resolve(),
                "GCP credentials resolver supports cwd-relative paths",
            )
        finally:
            os.chdir(original_cwd)

        project_credential = PROJECT_ROOT / ".tmp-smoke-gcp-credentials.json"
        try:
            project_credential.write_text("{}", encoding="utf-8")
            expect(
                resolve_gcp_credentials_path(project_credential.name) == project_credential.resolve(),
                "GCP credentials resolver supports StorySage-root-relative paths",
            )
        finally:
            project_credential.unlink(missing_ok=True)

        workspace_credential = PROJECT_ROOT.parent / ".tmp-smoke-gcp-credentials.json"
        try:
            workspace_credential.write_text("{}", encoding="utf-8")
            expect(
                resolve_gcp_credentials_path(workspace_credential.name) == workspace_credential.resolve(),
                "GCP credentials resolver supports workspace-root-relative paths",
            )
        finally:
            workspace_credential.unlink(missing_ok=True)

        try:
            require_gcp_credentials_path("missing-smoke-gcp-credentials.json")
            expect(False, "GCP credentials resolver rejects missing paths")
        except ValueError as error:
            expect(
                "Checked:" in str(error),
                "GCP credentials resolver explains checked paths",
            )

        original_provider_env = {
            name: os.environ.get(name)
            for name in ("MODEL_NAME", "GCP_PROJECT", "GCP_REGION", "GCP_CREDENTIALS")
        }
        os.environ["MODEL_NAME"] = "gemini-2.5-flash"
        os.environ["GCP_PROJECT"] = "storysage-smoke"
        os.environ["GCP_REGION"] = "us-central1"
        os.environ["GCP_CREDENTIALS"] = str(temp_credential)

        expect(any(route.path == "/health" for route in app.routes), "StorySage health route is registered")
        session_unique_constraints = {
            constraint.name
            for constraint in DBSession.__table__.constraints
        }
        expect(
            "unique_user_session_seq" in session_unique_constraints,
            "database model enforces per-user session sequence uniqueness",
        )
        Base.metadata.create_all(bind=engine)
        expect(
            DBUserProfile.__tablename__ in Base.metadata.tables
            and DBSimulationTrace.__tablename__ in Base.metadata.tables,
            "database model includes durable profile and simulation trace tables",
        )
        smoke_db = SessionLocal()
        try:
            if not smoke_db.query(DBUser).filter(DBUser.user_id == user_id).first():
                smoke_db.add(DBUser(user_id=user_id, password_hash="smoke-password-hash"))
                smoke_db.commit()
        finally:
            smoke_db.close()
        health = await health_check()
        for name, value in original_provider_env.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
        expect(health.get("ok") is True, "StorySage health route returns ok")
        auth_health = health.get("auth", {}).get("jwt_secret", {})
        expect(
            "using_development_fallback" in auth_health,
            "StorySage health exposes JWT secret configuration status",
        )
        expect(
            "secret-key-here" not in json.dumps(health, ensure_ascii=False),
            "StorySage health does not expose JWT secret value",
        )
        llm_health = health.get("providers", {}).get("llm", {})
        expect(
            llm_health.get("provider") == "vertex_gemini",
            "StorySage health exposes LLM provider family",
        )
        expect(
            llm_health.get("configured") is True,
            "StorySage health reports resolved GCP provider config",
        )
        expect(
            llm_health.get("gcp", {}).get("credentials_resolved") is True,
            "StorySage health reports GCP credentials resolution",
        )
        health_json = json.dumps(health, ensure_ascii=False)
        expect(
            temp_credential.name in health_json,
            "StorySage health shows non-secret GCP credential basename",
        )
        expect(
            str(temp_credential) not in health_json,
            "StorySage health does not expose full GCP credential path",
        )
        runtime_health = health.get("runtime", {})
        expect(
            "go_live_ready" in runtime_health
            and isinstance(runtime_health.get("go_live_blockers"), list),
            "StorySage health exposes go-live readiness fields",
        )
        expect(
            runtime_health.get("cors", {}).get("wildcard") is True,
            "StorySage health exposes local-dev CORS wildcard status",
        )
        expect(
            runtime_health.get("cors", {}).get("origin_count") == 1,
            "StorySage health exposes CORS origin count",
        )
        try:
            create_tts_engine("google")
            expect(False, "unsupported TTS provider fails before runtime")
        except ValueError as error:
            expect(
                "openai" in str(error).lower(),
                "unsupported TTS provider explains available provider",
            )

        class FailingRegisterDB:
            rolled_back = False

            def query(self, *_args: Any, **_kwargs: Any) -> None:
                raise RuntimeError(
                    "db failed token=<OPENAI_API_KEY_PLACEHOLDER> "
                    "at <USER_HOME>\\register.db"
                )

            def rollback(self) -> None:
                self.rolled_back = True

        failing_register_db = FailingRegisterDB()
        try:
            await register_user(
                RegisterRequest(user_id="safe_register_user", password="safe-password"),
                db=failing_register_db,
            )
            expect(False, "register internal errors use safe public 500")
        except HTTPException as error:
            detail = str(error.detail)
            expect(error.status_code == 500, "register internal errors use safe public 500")
            expect("<OPENAI_API_KEY_PLACEHOLDER>" not in detail, "register public 500 omits secret")
            expect("<USER_HOME>" not in detail, "register public 500 omits local path")
            expect(
                detail == "Internal server error. Please try again.",
                "register public 500 uses stable generic detail",
                detail,
            )
            expect(failing_register_db.rolled_back, "register internal error rolls back db session")

        fake_provider_key = "<OPENAI_API_KEY_PLACEHOLDER>"
        raw_biography = (
            "I am 20 years old and live at 123 Green Street. "
            "I often walk on Green Street before difficult conversations with Dr. Rivera. "
            "My email is smoke@example.com. I often balance helping classmates "
            "with protecting my own energy. "
            f"I pasted a provider token={fake_provider_key} into my notes by mistake."
        )
        write_json(user_dir / "biography_1.json", {"content": raw_biography})

        broken_user_id = "rewindai_broken_bio_user"
        broken_user_dir = Path(temp_dir) / broken_user_id
        broken_user_dir.mkdir(parents=True, exist_ok=True)
        (broken_user_dir / "biography_1.json").write_text(
            "{ broken json token=<OPENAI_API_KEY_PLACEHOLDER> <USER_HOME>\\bio.json",
            encoding="utf-8",
        )
        try:
            get_latest_biography(broken_user_id)
            expect(False, "biography read failures use safe public 500")
        except HTTPException as error:
            detail = str(error.detail)
            expect(error.status_code == 500, "biography read failures use safe public 500")
            expect("sk-bio-secret" not in detail, "biography public 500 omits secret")
            expect("<USER_HOME>" not in detail, "biography public 500 omits local path")
            expect(
                detail == "Internal server error. Please try again.",
                "biography public 500 uses stable generic detail",
                detail,
            )
        try:
            await get_simulation_profile(current_user=broken_user_id)
            expect(False, "simulation profile read failures use safe public 500")
        except HTTPException as error:
            detail = str(error.detail)
            expect(error.status_code == 500, "simulation profile read failures use safe public 500")
            expect("sk-bio-secret" not in detail, "simulation profile public 500 omits secret")
            expect("<USER_HOME>" not in detail, "simulation profile public 500 omits local path")
            expect(
                detail == "Internal server error. Please try again.",
                "simulation profile public 500 uses stable generic detail",
                detail,
            )

        write_json(
            user_dir / "graph" / "current_state.json",
            {"status": "completed", "updated_at": "smoke-now"},
        )
        write_json(
            user_dir / "graph" / "current_data.json",
            {
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
                        {"id": "n1", "name": "classmates"},
                        {"id": "n2", "name": "advisor"},
                    ],
                    "edges": [
                        {"source": "n1", "target": "n2", "type": "trust"},
                        {"source": "n2", "target": "n1", "label": "obligation"},
                    ],
                }
            },
        )

        class FakeSpeechResponse:
            content = b"fake-mp3-bytes"

        class FakeSpeechClient:
            def create(self, **kwargs: Any) -> FakeSpeechResponse:
                return FakeSpeechResponse()

        class FakeAudioClient:
            speech = FakeSpeechClient()

        class FakeOpenAIClient:
            audio = FakeAudioClient()

        original_openai_client = voice_router.openai.OpenAI
        original_bucket_name = voice_router.BUCKET_NAME
        original_local_tts_root = voice_router.LOCAL_TTS_ROOT
        original_local_transcription_root = voice_router.LOCAL_TRANSCRIPTION_ROOT
        voice_router.openai.OpenAI = lambda api_key=None: FakeOpenAIClient()
        voice_router.BUCKET_NAME = None
        voice_router.LOCAL_TTS_ROOT = Path(temp_dir) / "tts"
        voice_router.LOCAL_TRANSCRIPTION_ROOT = Path(temp_dir) / "transcriptions"
        try:
            request = Request({
                "type": "http",
                "method": "POST",
                "path": "/text-to-speech",
                "headers": [(b"host", b"127.0.0.1:8000")],
                "scheme": "http",
                "server": ("127.0.0.1", 8000),
                "client": ("127.0.0.1", 50000),
            })
            tts_response = await voice_router.text_to_speech(
                payload={"text": "Hello from the local TTS fallback."},
                http_request=request,
                current_user=user_id,
            )
            expect(tts_response.get("storage") == "local", "TTS falls back to local storage without S3")
            parsed_audio_url = urlparse(tts_response["audioUrl"])
            audio_token = parse_qs(parsed_audio_url.query).get("token", [""])[0]
            expect(bool(audio_token), "TTS local fallback returns scoped audio token")
            expect("Authorization" not in tts_response["audioUrl"], "TTS local fallback does not expose auth header material")
            audio_parts = parsed_audio_url.path.strip("/").split("/")
            audio_response = await voice_router.get_local_tts_audio(
                user_id=audio_parts[-2],
                audio_id=audio_parts[-1],
                token=audio_token,
            )
            expect(Path(audio_response.path).read_bytes() == b"fake-mp3-bytes", "TTS local audio endpoint serves saved mp3")
            try:
                await voice_router.text_to_speech(
                    payload={},
                    http_request=request,
                    current_user=user_id,
                )
                expect(False, "TTS rejects missing text")
            except HTTPException as error:
                expect(error.status_code == 400, "TTS missing text preserves HTTP 400")

            try:
                await voice_router.transcribe_audio(audio=None, current_user=user_id)
                expect(False, "transcribe rejects missing audio")
            except HTTPException as error:
                expect(error.status_code == 400, "transcribe missing audio preserves HTTP 400")

            temp_audio_path = Path(
                voice_router._write_temp_audio_file("../unsafe-name.wav", b"audio")
            ).resolve()
            expect(
                temp_audio_path.parent == voice_router.LOCAL_TRANSCRIPTION_ROOT.resolve(),
                "transcribe temp file stays inside local transcription directory",
            )
            expect(temp_audio_path.name.startswith("tmp"), "transcribe temp file uses generated filename")
            temp_audio_path.unlink(missing_ok=True)

            class FailingSpeechClient:
                def create(self, **kwargs: Any) -> None:
                    raise RuntimeError(
                        "tts failed api_key=<OPENAI_API_KEY_PLACEHOLDER> "
                        "at <USER_HOME>\\voice.txt"
                    )

            class FailingTTSAudioClient:
                speech = FailingSpeechClient()

            class FailingTTSOpenAIClient:
                audio = FailingTTSAudioClient()

            voice_router.openai.OpenAI = lambda api_key=None: FailingTTSOpenAIClient()
            try:
                await voice_router.text_to_speech(
                    payload={"text": "please fail safely"},
                    http_request=request,
                    current_user=user_id,
                )
                expect(False, "TTS provider failures use safe public 500")
            except HTTPException as error:
                detail = str(error.detail)
                expect(error.status_code == 500, "TTS provider failures use safe public 500")
                expect("<OPENAI_API_KEY_PLACEHOLDER>" not in detail, "TTS public 500 omits provider key")
                expect("<USER_HOME>" not in detail, "TTS public 500 omits local path")
                expect(
                    detail == "Internal server error. Please try again.",
                    "TTS public 500 uses stable generic detail",
                    detail,
                )

            class FakeUploadFile:
                filename = "sample.webm"

                async def read(self) -> bytes:
                    return b"fake-audio"

            class FailingTranscriptionsClient:
                def create(self, **kwargs: Any) -> None:
                    raise RuntimeError(
                        "transcribe failed token=<OPENAI_API_KEY_PLACEHOLDER> "
                        "at <USER_HOME>\\transcribe.webm"
                    )

            class FailingTranscribeAudioClient:
                transcriptions = FailingTranscriptionsClient()

            class FailingTranscribeOpenAIClient:
                audio = FailingTranscribeAudioClient()

            voice_router.openai.OpenAI = lambda api_key=None: FailingTranscribeOpenAIClient()
            try:
                await voice_router.transcribe_audio(
                    audio=FakeUploadFile(),
                    current_user=user_id,
                )
                expect(False, "transcribe provider failures use safe public 500")
            except HTTPException as error:
                detail = str(error.detail)
                expect(error.status_code == 500, "transcribe provider failures use safe public 500")
                expect("<OPENAI_API_KEY_PLACEHOLDER>" not in detail, "transcribe public 500 omits provider key")
                expect("<USER_HOME>" not in detail, "transcribe public 500 omits local path")
                expect(
                    detail == "Internal server error. Please try again.",
                    "transcribe public 500 uses stable generic detail",
                    detail,
                )
        finally:
            voice_router.openai.OpenAI = original_openai_client
            voice_router.BUCKET_NAME = original_bucket_name
            voice_router.LOCAL_TTS_ROOT = original_local_tts_root
            voice_router.LOCAL_TRANSCRIPTION_ROOT = original_local_transcription_root

        safe = sanitize_privacy_safe_text(raw_biography)
        expect("smoke@example.com" not in safe, "privacy removes email")
        expect("123 Green Street" not in safe, "privacy removes street address")
        expect("on Green Street" not in safe, "privacy generalizes street-only place reference")
        expect("Dr. Rivera" not in safe, "privacy substitutes titled private names")
        expect("academic mentor" in safe, "privacy keeps role meaning after named-person substitution")
        expect("20 years old" not in safe, "privacy generalizes exact age")
        expect(fake_provider_key not in safe, "privacy removes credential-like text")
        expect("[credential omitted]" in safe, "privacy marks omitted credentials in sanitized text")
        privacy_signals = classify_sensitive_content(raw_biography)
        privacy_signal_text = json.dumps(privacy_signals, ensure_ascii=False)
        expect(privacy_signals["available"] is True, "privacy labels sensitive content")
        expect(privacy_signals["risk_level"] == "high", "privacy labels high risk content")
        expect("direct_contact" in privacy_signal_text, "privacy labels direct contact")
        expect("credential_or_secret" in privacy_signal_text, "privacy labels credential-like text")
        expect("exact_address" in privacy_signal_text, "privacy labels exact address")
        expect("local_place_reference" in privacy_signal_text, "privacy labels street-only place reference")
        expect("named_authority_or_private_person" in privacy_signal_text, "privacy labels titled private names")
        expect(privacy_signals["review_required"] is True, "privacy review is required for sensitive content")
        expect("smoke@example.com" not in privacy_signal_text, "privacy labels omit raw email")
        expect("123 Green Street" not in privacy_signal_text, "privacy labels omit raw address")
        expect("Dr. Rivera" not in privacy_signal_text, "privacy labels omit raw named person")
        expect(fake_provider_key not in privacy_signal_text, "privacy labels omit raw credential")

        prompt_checks = [
            ("scribe memory", scribe_prompt("update_memory_question_bank")),
            ("scribe notes", scribe_prompt("update_session_agenda")),
            ("writer normal", writer_prompt("normal")),
            ("writer baseline", writer_prompt("baseline")),
        ]
        for label, prompt in prompt_checks:
            expect("Privacy-Safe" in prompt, f"{label} includes privacy prompt guard")
            expect("{PRIVACY_SAFE" not in prompt, f"{label} renders privacy prompt guard")

        coordinator_prompt = INTERVIEW_QUESTIONS_PROMPT.format(
            selected_topics="energy boundaries\nadvisor conflict",
            questions_and_notes="",
            follow_up_questions="",
            event_stream="",
            behavioral_trace_summary="Available: True. 4 decisions recorded around risk and energy.",
            similar_questions_warning="",
            warning_output_format="",
            tool_descriptions="<add_interview_question />",
        )
        expect(
            "3-5 main questions total" in coordinator_prompt,
            "coordinator prompt owns 3-5 critical incident planning",
        )
        expect(
            "Each main question should open one critical incident or high-stakes scenario" in coordinator_prompt,
            "coordinator prompt makes each main question incident-centered",
        )
        expect(
            "not a broad survey of the user's entire life" in coordinator_prompt,
            "coordinator prompt rejects broad life-survey agendas",
        )
        expect(
            "Downstream Simulation Traces" in coordinator_prompt
            and "Treat simulation behavior as a hint, not a confirmed fact" in coordinator_prompt,
            "coordinator prompt treats traces as tentative agenda hints",
        )
        expect(
            "Available: True. 4 decisions recorded around risk and energy." in coordinator_prompt,
            "coordinator prompt receives behavioral trace summary",
        )

        interviewer_rendered_prompt = interviewer_prompt("normal")
        expect(
            "Once the user has described a specific high-stakes moment" in interviewer_rendered_prompt,
            "interviewer prompt only ladder-probes after a concrete incident",
        )
        expect(
            "Ask at most ONE trace-informed question at a time" in interviewer_rendered_prompt,
            "interviewer prompt limits trace-informed probing",
        )
        expect(
            "do not state simulation patterns as facts" in interviewer_rendered_prompt.lower(),
            "interviewer prompt keeps simulation traces tentative",
        )

        memory_map: dict[str, str] = {}
        added_memories: list[Memory] = []
        memory_bank = SmokeMemoryBank()
        memory_tool = UpdateMemoryBank(
            memory_bank=memory_bank,
            update_memory_map=lambda temp_id, real_id: memory_map.update({temp_id: real_id}),
            on_memory_added=lambda memory: added_memories.append(memory),
            get_current_response=lambda: raw_biography,
        )
        memory_tool._run(
            temp_id="MEM_TEMP_PRIVACY",
            title="Contact from smoke@example.com",
            text=raw_biography,
            metadata={"where": "123 Green Street", "age": "20 years old"},
            importance_score=7,
        )
        stored_memory = memory_bank.memories[0]
        stored_memory_text = json.dumps(stored_memory.to_dict(), ensure_ascii=False)
        expect(memory_map["MEM_TEMP_PRIVACY"] == stored_memory.id, "memory tool maps temp id")
        expect(len(added_memories) == 1, "memory tool tracks added memory")
        expect("smoke@example.com" not in stored_memory_text, "memory tool omits raw email")
        expect("123 Green Street" not in stored_memory_text, "memory tool omits raw address")
        expect(fake_provider_key not in stored_memory_text, "memory tool omits raw credential")
        expect(
            stored_memory.metadata["privacy_signals"]["risk_level"] == "high",
            "memory tool stores privacy signal summary",
        )
        expect(
            "smoke@example.com" not in json.dumps(stored_memory.metadata["privacy_signals"], ensure_ascii=False),
            "memory privacy signals omit raw matched text",
        )

        agenda = SessionAgenda(
            user_id,
            0,
            {"question_strings": {"General": ["Where did you live during that period?"]}},
        )
        agenda.add_note("1", raw_biography)
        stored_note = agenda.get_question("1").notes[0]
        expect("smoke@example.com" not in stored_note, "session note omits raw email")
        expect("123 Green Street" not in stored_note, "session note omits raw address")
        expect(fake_provider_key not in stored_note, "session note omits raw credential")
        expect(
            agenda.get_question("1").note_privacy_signals[0]["risk_level"] == "high",
            "session note stores privacy signal summary",
        )
        agenda.add_note("", raw_biography)
        expect(
            agenda.additional_note_privacy_signals[0]["risk_level"] == "high",
            "additional session note stores privacy signal summary",
        )

        formulation = build_mental_model_formulation(user_id)
        expect(formulation["stale"] is False, "formulation starts fresh")
        expect(formulation["evidence"]["graph"]["available"] is True, "formulation sees graph")
        expect(
            formulation["evidence"]["privacy_signals"]["risk_level"] == "high",
            "formulation includes privacy signal summary",
        )
        expect(
            "smoke@example.com" not in formulation["formulation"]["grounding_summary"],
            "formulation summary is privacy-safe",
        )
        expect(
            fake_provider_key not in formulation["formulation"]["grounding_summary"],
            "formulation summary omits raw credential",
        )
        graph_source_payload = build_graph_source_payload(user_id)
        graph_source_text = graph_source_payload["text"]
        expect("Evidence Boundary Manifest" in graph_source_text, "graph source includes evidence manifest")
        expect(
            "confirmed_autobiographical_grounding" in graph_source_text,
            "graph source marks biography as confirmed",
        )
        expect(
            "tentative_simulation_evidence" in graph_source_text,
            "graph source marks traces as tentative",
        )
        expect(
            "smoke@example.com" not in graph_source_text,
            "graph source is privacy-safe",
        )
        expect(
            fake_provider_key not in graph_source_text,
            "graph source omits raw credential",
        )
        expect(
            graph_source_payload["manifest"]["privacy_signals"]["risk_level"] == "high",
            "graph source includes privacy signal summary",
        )

        structured_bio = Biography(user_id)
        await structured_bio.add_section("1 Early Life", content=raw_biography)
        await structured_bio.save()
        rebuilt_after_structured_bio = build_mental_model_formulation(user_id)
        expect(
            rebuilt_after_structured_bio["stale"] is False,
            "formulation rebuilds fresh after structured biography fixture",
        )
        edited_biography_content = (
            "I am 20 years old and once lived at 123 Green Street, but the decision pattern "
            "I want to preserve is that I help classmates while setting clearer energy boundaries. "
            f"My email edit@example.com and token={fake_provider_key} should not be preserved downstream."
        )
        latest_bio_after_edit = await edit_biography(
            [
                BiographyEdit(
                    type="CONTENT_CHANGE",
                    sectionId="1 Early Life",
                    title="1 Early Life",
                    data=EditData(newContent=edited_biography_content),
                    timestamp=1,
                )
            ],
            current_user=user_id,
        )
        expect(
            latest_bio_after_edit["subsections"]["1 Early Life"]["content"] == edited_biography_content,
            "biography edit endpoint saves changed content",
        )
        after_biography_edit = get_current_mental_model_formulation(user_id)
        expect(
            after_biography_edit is not None and after_biography_edit["status"] == "stale",
            "biography edit marks formulation stale",
        )
        expect(
            "Biography edited through API" in after_biography_edit["stale_reason"],
            "biography edit records stale reason",
        )

        mock_calls: list[str] = []

        async def mock_ontology(request: web.Request) -> web.Response:
            await request.post()
            mock_calls.append("ontology")
            return web.json_response({"success": True, "data": {"project_id": "mock-project"}})

        async def mock_build(request: web.Request) -> web.Response:
            await request.json()
            mock_calls.append("build")
            return web.json_response({"success": True, "data": {"task_id": "mock-task"}})

        async def mock_task(request: web.Request) -> web.Response:
            mock_calls.append(f"task:{request.match_info['task_id']}")
            return web.json_response(
                {
                    "success": True,
                    "data": {
                        "status": "completed",
                        "result": {"graph_id": "mock-graph"},
                    },
                }
            )

        async def mock_data(request: web.Request) -> web.Response:
            mock_calls.append(f"data:{request.match_info['graph_id']}")
            return web.json_response(
                {
                    "success": True,
                    "data": {
                        "nodes": [
                            {"id": "mock-advisor", "name": "mock advisor"},
                            {"id": "mock-classmate", "name": "mock classmate"},
                        ],
                        "edges": [
                            {
                                "source": "mock-advisor",
                                "target": "mock-classmate",
                                "type": "obligation",
                            }
                        ],
                    },
                }
            )

        mock_app = web.Application()
        mock_app.router.add_post("/api/graph/ontology/generate", mock_ontology)
        mock_app.router.add_post("/api/graph/build", mock_build)
        mock_app.router.add_get("/api/graph/task/{task_id}", mock_task)
        mock_app.router.add_get("/api/graph/data/{graph_id}", mock_data)
        mock_runner = web.AppRunner(mock_app)
        await mock_runner.setup()
        mock_site = web.TCPSite(mock_runner, "127.0.0.1", 0)
        await mock_site.start()
        mock_socket = mock_site._server.sockets[0]
        mock_port = mock_socket.getsockname()[1]
        original_mirofish_url = os.environ.get("MIROFISH_BASE_URL")
        original_poll = os.environ.get("MIROFISH_TASK_POLL_INTERVAL_SEC")
        original_timeout = os.environ.get("MIROFISH_GRAPH_BUILD_TIMEOUT_SEC")
        os.environ["MIROFISH_BASE_URL"] = f"http://127.0.0.1:{mock_port}"
        os.environ["MIROFISH_TASK_POLL_INTERVAL_SEC"] = "0.05"
        os.environ["MIROFISH_GRAPH_BUILD_TIMEOUT_SEC"] = "5"
        try:
            rebuild_response = await rebuild_graph_public(user_id=None, current_user=user_id)
            expect(
                rebuild_response["data"]["status"] == "running",
                "graph rebuild starts through StorySage public endpoint",
            )
            for _ in range(100):
                rebuild_state = get_graph_state(user_id)
                if rebuild_state.get("status") in {"completed", "failed"}:
                    break
                await asyncio.sleep(0.05)
            expect(rebuild_state["status"] == "completed", "graph rebuild completes through mocked MiroFish")
            expect("ontology" in mock_calls, "graph rebuild calls MiroFish ontology route")
            expect("build" in mock_calls, "graph rebuild calls MiroFish build route")
            expect("task:mock-task" in mock_calls, "graph rebuild polls MiroFish task route")
            expect("data:mock-graph" in mock_calls, "graph rebuild fetches MiroFish graph data")
            rebuilt_public_data = await get_graph_public_data(user_id=None, current_user=user_id)
            expect(
                rebuilt_public_data["data"]["source_manifest"]["sources"][0]["kind"]
                == "confirmed_autobiographical_grounding",
                "public graph data keeps evidence manifest after rebuild",
            )
            expect(
                rebuilt_public_data["data"]["graph_data"]["nodes"][0]["name"] == "mock advisor",
                "public graph data returns rebuilt MiroFish graph",
            )
        finally:
            if original_mirofish_url is None:
                os.environ.pop("MIROFISH_BASE_URL", None)
            else:
                os.environ["MIROFISH_BASE_URL"] = original_mirofish_url
            if original_poll is None:
                os.environ.pop("MIROFISH_TASK_POLL_INTERVAL_SEC", None)
            else:
                os.environ["MIROFISH_TASK_POLL_INTERVAL_SEC"] = original_poll
            if original_timeout is None:
                os.environ.pop("MIROFISH_GRAPH_BUILD_TIMEOUT_SEC", None)
            else:
                os.environ["MIROFISH_GRAPH_BUILD_TIMEOUT_SEC"] = original_timeout
            await mock_runner.cleanup()

        profile = await get_simulation_profile(current_user=user_id)
        expect(
            profile["rewindai_contract"]["protocol"] == "rewindai.grounding",
            "profile exports grounding contract",
        )
        expect(
            profile["trace_ingest"]["accepts"]["protocol"] == "rewindai.trace",
            "profile declares trace contract",
        )
        guidance = profile["grounding"]["card_generation_guidance"]
        expect(guidance["version"] == "1.0", "profile exports card generation guidance")
        expect(guidance["graph_pressure_card_quota"] >= 3, "guidance includes graph pressure quota")
        expect("military" in guidance["target_meters"], "guidance includes trace-informed target meter")
        expect(
            "counterfactual_reflection_goal" in guidance
            and "unchosen_option_prompt" in guidance
            and "assisted_replay_goal" in guidance,
            "guidance exports counterfactual reflection goals",
        )
        expect(
            "considered but did not take" in guidance["counterfactual_reflection_goal"]
            and "Which choice did you consider but not make" in guidance["unchosen_option_prompt"],
            "guidance frames unchosen choices for clone rehearsal",
        )
        expect(
            "Treat simulation traces as tentative evidence." in guidance["safety_rules"],
            "guidance exports safety rules",
        )
        expect(
            any("counterfactual rehearsals" in rule for rule in guidance["safety_rules"]),
            "guidance asks clone to simulate unchosen paths",
        )
        expect(guidance["rules"] == guidance["safety_rules"], "guidance keeps legacy rules alias")
        constraints = profile["grounding"]["graph_constraints"]
        expect(constraints["available"] is True, "profile exports graph constraints")
        expect("obligation" in constraints["relation_types"], "profile exports relation types")
        current_graph_data = get_graph_data(user_id)
        expect(
            current_graph_data["source_manifest"]["sources"][0]["kind"]
            == "confirmed_autobiographical_grounding",
            "graph data returns source manifest",
        )
        expect(
            "graph-derived relationship constraints" in profile["rewind"]["scenario"],
            "Rewind scenario mentions graph-derived constraints",
        )
        expect(
            profile["grounding"]["mental_model_formulation"] is not None,
            "profile includes mental model summary",
        )

        handoff = await get_simulation_test_handoff(current_user=user_id)
        expect(
            handoff["rewindai_contract"]["protocol"] == "rewindai.simulation_test_handoff",
            "simulation-test handoff uses trace-only contract",
        )
        expect(
            handoff["simulation_test"]["personalized_cards"] is False,
            "simulation-test handoff disables personalized cards",
        )
        expect(
            handoff["simulation_test"]["card_policy"] == "public_random_campus_deck",
            "simulation-test handoff declares public random campus deck",
        )
        expect(
            handoff["trace_ingest"]["accepts"]["source_module"] == "simulation-test",
            "simulation-test handoff declares simulation-test trace source",
        )
        smoke_db = SessionLocal()
        try:
            stored_profile = (
                smoke_db.query(DBUserProfile)
                .filter(DBUserProfile.user_id == user_id)
                .first()
            )
            expect(
                stored_profile is not None and stored_profile.study_group == "experiment",
                "simulation-test handoff persists user profile in SQL",
            )
        finally:
            smoke_db.close()
        handoff_text = json.dumps(handoff, ensure_ascii=False)
        expect(
            "graph_constraints" not in handoff_text
            and "mental_model_formulation" not in handoff_text
            and "card_generation_guidance" not in handoff_text,
            "simulation-test handoff omits profile-derived generation guidance",
        )
        expect(
            profile["grounding"]["privacy_signals"]["available"] is True,
            "profile includes privacy signal summary",
        )
        expect(
            "edit@example.com" not in json.dumps(profile, ensure_ascii=False),
            "profile sanitizes edited biography contact detail",
        )
        expect(
            fake_provider_key not in json.dumps(profile, ensure_ascii=False),
            "profile sanitizes edited biography credential",
        )

        view_token_response = await get_graph_view_token(user_id=None, current_user=user_id)
        view_token = view_token_response["data"]["view_token"]
        expect(view_token_response["data"]["expires_in_minutes"] <= 10, "graph view token is short-lived")

        graph_view = await graph_ui(
            user_id=user_id,
            view_token=view_token,
        )
        graph_html = graph_view.body.decode("utf-8")
        expect("StorySage Graph Viewer" in graph_html, "graph ui opens with scoped view token")
        graph_view_without_user_id = await graph_ui(user_id=None, view_token=view_token)
        expect(
            "StorySage Graph Viewer" in graph_view_without_user_id.body.decode("utf-8"),
            "graph ui infers user from scoped view token",
        )
        try:
            await graph_ui(user_id="another_user", view_token=view_token)
            expect(False, "graph ui rejects mismatched scoped view token")
        except Exception as exc:
            expect(
                getattr(exc, "status_code", None) == 403,
                "graph ui rejects mismatched scoped view token",
                detail=str(exc),
            )
        expect("mock classmate" in graph_html, "graph ui embeds graph node labels")
        expect("confirmed_autobiographical_grounding" in graph_html, "graph ui shows confirmed evidence boundary")
        expect("tentative_simulation_evidence" in graph_html, "graph ui shows tentative evidence boundary")
        expect(".innerHTML" not in graph_html, "graph ui avoids innerHTML for evidence boundary")

        original_graph_get_data = graph_public_router.get_graph_data
        graph_public_router.get_graph_data = lambda _user_id: (_ for _ in ()).throw(
            FileNotFoundError(
                "missing graph token=<OPENAI_API_KEY_PLACEHOLDER> "
                "at <USER_HOME>\\graph.json"
            )
        )
        try:
            await get_graph_public_data(user_id=None, current_user=user_id)
            expect(False, "graph public missing data uses safe public 404")
        except HTTPException as error:
            detail = str(error.detail)
            expect(error.status_code == 404, "graph public missing data uses safe public 404")
            expect(detail == "Graph data not found", "graph public missing data uses stable 404 detail", detail)
            expect("<OPENAI_API_KEY_PLACEHOLDER>" not in detail, "graph public 404 omits secret")
            expect("<USER_HOME>" not in detail, "graph public 404 omits local path")
        finally:
            graph_public_router.get_graph_data = original_graph_get_data

        original_get_formulation = formulation_router.get_current_mental_model_formulation
        original_build_formulation = formulation_router.build_mental_model_formulation
        formulation_router.get_current_mental_model_formulation = lambda _user_id: None
        formulation_router.build_mental_model_formulation = lambda _user_id: (_ for _ in ()).throw(
            FileNotFoundError(
                "missing biography token=<OPENAI_API_KEY_PLACEHOLDER> "
                "at <USER_HOME>\\biography.json"
            )
        )
        try:
            await formulation_router.get_current_formulation(refresh=False, current_user=user_id)
            expect(False, "formulation current missing evidence uses safe public 404")
        except HTTPException as error:
            detail = str(error.detail)
            expect(error.status_code == 404, "formulation current missing evidence uses safe public 404")
            expect(
                detail == "Mental model evidence not found",
                "formulation current missing evidence uses stable 404 detail",
                detail,
            )
            expect("<OPENAI_API_KEY_PLACEHOLDER>" not in detail, "formulation current 404 omits secret")
            expect("<USER_HOME>" not in detail, "formulation current 404 omits local path")
        try:
            await formulation_router.rebuild_formulation(current_user=user_id)
            expect(False, "formulation rebuild missing evidence uses safe public 404")
        except HTTPException as error:
            detail = str(error.detail)
            expect(error.status_code == 404, "formulation rebuild missing evidence uses safe public 404")
            expect(
                detail == "Mental model evidence not found",
                "formulation rebuild missing evidence uses stable 404 detail",
                detail,
            )
            expect("<OPENAI_API_KEY_PLACEHOLDER>" not in detail, "formulation rebuild 404 omits secret")
            expect("<USER_HOME>" not in detail, "formulation rebuild 404 omits local path")
        finally:
            formulation_router.get_current_mental_model_formulation = original_get_formulation
            formulation_router.build_mental_model_formulation = original_build_formulation

        legacy_graph_view = await graph_ui(
            user_id=user_id,
            access_token=create_access_token({"sub": user_id}),
            view_token=None,
        )
        legacy_graph_html = legacy_graph_view.body.decode("utf-8")
        expect("StorySage Graph Viewer" in legacy_graph_html, "graph ui keeps access-token compatibility")

        try:
            _validate_trace_contract(
                RewindAIContract(
                    protocol=f"bad-protocol token={fake_provider_key} at <USER_HOME>\\trace.json",
                    version="1.0",
                    source_module="simulation-test",
                    target_module="storysage",
                )
            )
            expect(False, "invalid trace protocol is rejected")
        except HTTPException as error:
            detail = str(error.detail)
            expect(error.status_code == 400, "invalid trace protocol returns 400")
            expect(fake_provider_key not in detail, "invalid trace protocol detail omits secret")
            expect("<USER_HOME>" not in detail, "invalid trace protocol detail omits local path")
            expect("[REDACTED_SECRET]" in detail, "invalid trace protocol detail redacts secret")
            expect("[REDACTED_PATH]" in detail, "invalid trace protocol detail redacts local path")

        trace_contract_warning = _validate_trace_contract(
            RewindAIContract(
                protocol="rewindai.trace",
                version=fake_provider_key,
                source_module=f"browser token={fake_provider_key}",
                target_module="<USER_HOME>\\storysage",
            )
        )
        trace_contract_warning_text = json.dumps(trace_contract_warning, ensure_ascii=False)
        expect(
            fake_provider_key not in trace_contract_warning_text,
            "trace contract warnings omit secret",
        )
        expect(
            "<USER_HOME>" not in trace_contract_warning_text,
            "trace contract warnings omit local path",
        )
        expect(
            "[REDACTED_SECRET]" in trace_contract_warning_text,
            "trace contract warnings redact secret",
        )
        expect(
            "[REDACTED_PATH]" in trace_contract_warning_text,
            "trace contract warnings redact local path",
        )

        trace_request = SimulationTraceRequest(
            trace_token=_create_trace_token(user_id),
            source="simulation-test",
            contract={
                "protocol": "rewindai.trace",
                "version": "1.0",
                "source_module": "simulation-test",
                "target_module": "storysage",
            },
            record=SimulationTraceRecord(
                sessionId="smoke-session",
                rulerName=user_id,
                language="en",
                startedAt="smoke-start",
                updatedAt="smoke-update",
                initialSnapshot={"groundingSource": {"source": "storysage"}},
                finalState={"ended": False},
                history=[
                    {
                        "cardId": "card-1",
                        "speaker": "classmate",
                        "optionText": "Help Dr. Rivera at 456 Blue Street, but set a boundary",
                        "direction": "right",
                        "riskLevel": "medium",
                        "decisionType": "boundary",
                        "targetMeter": "military",
                        "outcomeLabel": f"Your energy is protected. Follow-up went to trace@example.com with token={fake_provider_key}.",
                        "effects": {"military": 12, "people": -6},
                    }
                ],
                reflection={
                    "protocol": "rewindai.counterfactual_reflection",
                    "evidence_boundary": "tentative_counterfactual_rehearsal",
                    "source_session_id": "smoke-session",
                    "source_run_started_at": "smoke-start",
                    "user_reflection": f"I considered emailing trace@example.com and asking Dr. Rivera for a softer delay with token={fake_provider_key}.",
                    "unchosen_option": "Ask for a softer delay instead of setting the boundary immediately.",
                    "simulated_choice": {
                        "source_card_id": "card-1",
                        "source_card_domain": "deadline-pressure",
                        "original_choice": "Set the boundary immediately.",
                        "attempted_choice": "Ask for a softer delay instead.",
                        "imitation_basis": ["round-one mode: boundary", "first-run gameplay trace"],
                    },
                    "simulated_effects": {"military": 4, "people": -4},
                    "simulated_outcome": "As-if decision simulation / Clone-as-user simulation: the clone tries the softer delay. Simulated alternative outcome: military +4, people -4.",
                    "clone_rehearsal": "Clone-as-user simulation: the user tries the softer delay; the cost shifts toward people and future constraints.",
                    "second_run_rule": "Second-run inspiration rule: test one softer delay only when energy is protected.",
                    "created_at": "smoke-reflection-created",
                    "updated_at": "smoke-reflection-updated",
                },
            ),
        )
        trace_response = await ingest_simulation_trace(trace_request)
        expect(trace_response["contract"]["accepted"] is True, "trace contract is accepted")
        expect(trace_response["contract"]["version"] == "1.0", "trace contract version is returned")
        expect(trace_response["formulation_stale"] is True, "trace marks formulation stale")
        expect(trace_response["warning"] is None, "trace stale marker has no warning")
        smoke_db = SessionLocal()
        try:
            stored_sql_trace = (
                smoke_db.query(DBSimulationTrace)
                .filter(
                    DBSimulationTrace.user_id == user_id,
                    DBSimulationTrace.source == "simulation-test",
                    DBSimulationTrace.session_id == "smoke-session",
                )
                .first()
            )
            expect(
                stored_sql_trace is not None and stored_sql_trace.decisions == 1,
                "trace ingest persists simulation run in SQL",
            )
        finally:
            smoke_db.close()

        stored_trace_path = user_dir / "simulation_traces" / "simulation-test-smoke-session.json"
        stored_trace_text = stored_trace_path.read_text(encoding="utf-8")
        stored_trace = json.loads(stored_trace_text)
        expect("trace@example.com" not in stored_trace_text, "trace storage omits raw email")
        expect("456 Blue Street" not in stored_trace_text, "trace storage omits raw address")
        expect("Dr. Rivera" not in stored_trace_text, "trace storage omits raw named person")
        expect(fake_provider_key not in stored_trace_text, "trace storage omits raw credential")
        expect(
            stored_trace["record"]["reflection"]["evidence_boundary"] == "tentative_counterfactual_rehearsal",
            "trace storage keeps counterfactual reflection evidence boundary",
        )
        expect(
            "Clone-as-user simulation" in stored_trace["record"]["reflection"]["clone_rehearsal"],
            "trace storage keeps clone counterfactual rehearsal text",
        )
        expect(
            stored_trace["record"]["reflection"]["simulated_choice"]["attempted_choice"]
            == "Ask for a softer delay instead.",
            "trace storage keeps clone as-if simulated choice",
        )
        expect(
            stored_trace["record"]["reflection"]["simulated_effects"]["people"] == -4,
            "trace storage keeps clone simulated meter shift",
        )
        expect(
            stored_trace["privacy_signals"]["risk_level"] == "high",
            "trace storage keeps privacy signal summary",
        )
        trace_index_path = user_dir / "simulation_traces" / "index.json"
        trace_index = json.loads(trace_index_path.read_text(encoding="utf-8"))
        trace_index_text = json.dumps(trace_index, ensure_ascii=False)
        expect(
            trace_index["traces"][0]["file"] == stored_trace_path.name,
            "trace index stores relative trace file reference",
        )
        expect("path" not in trace_index["traces"][0], "trace index omits absolute path field")
        expect(str(Path(temp_dir)) not in trace_index_text, "trace index omits local data root")
        expect("<USER_HOME>" not in trace_index_text, "trace index omits user-local paths")

        trace_summary = load_simulation_trace_summary(user_id)
        expect(trace_summary["available"] is True, "trace summary is available")
        expect(trace_summary["decision_count"] == 1, "trace summary counts decisions")
        expect(
            trace_summary["counterfactual_reflections"][0]["evidence_boundary"]
            == "tentative_counterfactual_rehearsal",
            "trace summary includes counterfactual reflection evidence boundary",
        )
        expect(
            "Second-run inspiration rule"
            in trace_summary["counterfactual_reflections"][0]["second_run_rule"],
            "trace summary includes second-run inspiration from clone rehearsal",
        )
        expect(
            "As-if decision simulation"
            in trace_summary["counterfactual_reflections"][0]["simulated_outcome"],
            "trace summary includes clone as-if simulated outcome",
        )
        expect(
            trace_summary["counterfactual_reflections"][0]["simulated_choice"]["attempted_choice"]
            == "Ask for a softer delay instead.",
            "trace summary includes clone simulated attempted choice",
        )
        expect(
            trace_summary["privacy_signals"]["risk_level"] == "high",
            "trace summary aggregates privacy signals",
        )
        trace_summary_text = json.dumps(trace_summary, ensure_ascii=False)
        expect("trace@example.com" not in trace_summary_text, "trace summary omits raw email")
        expect("456 Blue Street" not in trace_summary_text, "trace summary omits raw address")
        expect("Dr. Rivera" not in trace_summary_text, "trace summary omits raw named person")
        expect(fake_provider_key not in trace_summary_text, "trace summary omits raw credential")

        graph_source_after_trace = build_graph_source_payload(user_id)
        graph_source_after_trace_text = graph_source_after_trace["text"]
        expect(
            "Trace Privacy Signal Summary" in graph_source_after_trace_text,
            "graph source includes trace privacy signal summary",
        )
        expect("trace@example.com" not in graph_source_after_trace_text, "graph source omits trace raw email")
        expect("456 Blue Street" not in graph_source_after_trace_text, "graph source omits trace raw address")
        expect("Dr. Rivera" not in graph_source_after_trace_text, "graph source omits trace raw named person")
        expect(fake_provider_key not in graph_source_after_trace_text, "graph source omits trace raw credential")

        current = get_current_mental_model_formulation(user_id)
        expect(current is not None and current["status"] == "stale", "current formulation is stale")

        original = try_mark_mental_model_stale(user_id, "best-effort check")
        expect("marked" in original and "warning" in original, "best-effort marker returns contract")

        class FakeBiographyOrchestrator:
            def __init__(self) -> None:
                self.biography_update_in_progress = False
                self.selected_topics: list[str] | None = None

            async def set_selected_topics(self, topics: list[str]) -> None:
                self.selected_topics = topics

        class FakeInterviewSession:
            def __init__(self) -> None:
                self.session_id = 42
                self.biography_orchestrator = FakeBiographyOrchestrator()
                self.ended = False

            def end_session(self) -> None:
                self.ended = True

        class FakeSessionManager:
            def __init__(self, session: FakeInterviewSession) -> None:
                self.session = session
                self.marked_user: str | None = None

            def get_session_status(self, current_user: str) -> SessionStatus:
                return SessionStatus.ACTIVE

            def get_active_session(self, current_user: str) -> FakeInterviewSession:
                return self.session

            def mark_session_ending(self, current_user: str) -> None:
                self.marked_user = current_user

        fake_session = FakeInterviewSession()
        fake_manager = FakeSessionManager(fake_session)
        stale_calls: list[dict[str, str]] = []
        graph_rebuild_calls: list[dict[str, str]] = []
        original_chat_manager = chat_router.session_manager
        original_chat_stale_marker = chat_router.try_mark_mental_model_stale
        original_chat_graph_rebuild = chat_router.trigger_graph_rebuild

        try:
            chat_router.session_manager = fake_manager

            def fake_stale_marker(current_user: str, reason: str) -> dict[str, Any]:
                stale_calls.append({"user_id": current_user, "reason": reason})
                return {"marked": True, "warning": None}

            def fake_graph_rebuild(current_user: str, source: str) -> dict[str, Any]:
                graph_rebuild_calls.append({"user_id": current_user, "source": source})
                return {"started": True}

            chat_router.try_mark_mental_model_stale = fake_stale_marker
            chat_router.trigger_graph_rebuild = fake_graph_rebuild

            end_response = await chat_router.end_session(
                TopicsFeedbackRequest(selected_topics=["boundary with classmates"]),
                current_user=user_id,
            )
        finally:
            chat_router.session_manager = original_chat_manager
            chat_router.try_mark_mental_model_stale = original_chat_stale_marker
            chat_router.trigger_graph_rebuild = original_chat_graph_rebuild

        expect(end_response.status == "success", "chat end returns success")
        expect(fake_session.ended is True, "chat end closes interview session")
        expect(
            fake_session.biography_orchestrator.selected_topics == ["boundary with classmates"],
            "chat end applies selected biography topics",
        )
        expect(fake_manager.marked_user == user_id, "chat end marks session ending")
        expect(
            stale_calls == [{"user_id": user_id, "reason": "Biography updated after interview session 42."}],
            "chat end marks formulation stale after biography update",
        )
        expect(
            graph_rebuild_calls == [{"user_id": user_id, "source": "end_session"}],
            "chat end triggers graph rebuild after biography update",
        )

        class NoActiveSessionManager:
            def get_active_session(self, current_user: str) -> None:
                return None

        original_chat_manager = chat_router.session_manager
        try:
            chat_router.session_manager = NoActiveSessionManager()
            try:
                await chat_router.like_message(db=None, current_user=user_id)
                expect(False, "chat like preserves no-active-session 404")
            except HTTPException as exc:
                expect(
                    exc.status_code == 404,
                    "chat like preserves no-active-session 404",
                    exc.detail,
                )
                expect(
                    "No active session found" in str(exc.detail),
                    "chat like preserves public 404 message",
                    exc.detail,
                )
        finally:
            chat_router.session_manager = original_chat_manager

        class FailingSessionManager:
            def get_active_session(self, current_user: str) -> None:
                raise RuntimeError(
                    "provider failed token=<OPENAI_API_KEY_PLACEHOLDER> "
                    "at <USER_HOME>\\private.txt"
                )

        class RollbackOnlyDb:
            def __init__(self) -> None:
                self.rolled_back = False

            def rollback(self) -> None:
                self.rolled_back = True

        original_chat_manager = chat_router.session_manager
        try:
            chat_router.session_manager = FailingSessionManager()
            failing_db = RollbackOnlyDb()
            try:
                await chat_router.like_message(db=failing_db, current_user=user_id)
                expect(False, "chat internal errors use safe public 500")
            except HTTPException as exc:
                detail = str(exc.detail)
                expect(
                    exc.status_code == 500,
                    "chat internal errors use safe public 500",
                    exc.detail,
                )
                expect(
                    "sk-chat-secret" not in detail and "<USER_HOME>" not in detail,
                    "chat public 500 omits secret and local path",
                    exc.detail,
                )
                expect(
                    detail == "Internal server error. Please try again.",
                    "chat public 500 uses stable generic detail",
                    exc.detail,
                )
                expect(failing_db.rolled_back is True, "chat internal error rolls back db session")
        finally:
            chat_router.session_manager = original_chat_manager

    print("PASS RewindAI backend smoke test completed")


if __name__ == "__main__":
    asyncio.run(main())
