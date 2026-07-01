from pathlib import Path
from datetime import timedelta
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Request
from fastapi.responses import FileResponse
import openai
import os
import boto3
from botocore.exceptions import ClientError
import uuid
import tempfile
from dotenv import load_dotenv

load_dotenv()

from api.core.auth import get_current_user
from api.core.auth import create_scoped_token, get_user_from_token
from api.core.errors import internal_server_error, sanitize_public_error_text
from utils.constants.colors import RESET, RED

router = APIRouter(tags=["voice"])

# Initialize S3 client
s3_client = boto3.client(
    's3',
    aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY')
)
BUCKET_NAME = os.getenv('AWS_BUCKET_NAME')
LOCAL_TTS_ROOT = Path(os.getenv("DATA_DIR", "data")) / "tts"
LOCAL_TRANSCRIPTION_ROOT = Path(os.getenv("DATA_DIR", "data")) / "transcriptions"


def _safe_path_part(value: str) -> str:
    return "".join(char for char in value if char.isalnum() or char in {"-", "_"}) or "user"


def _safe_audio_suffix(filename: str | None) -> str:
    suffix = Path(filename or "").suffix.lower()
    if suffix in {".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".webm"}:
        return suffix
    return ".webm"


def _write_temp_audio_file(filename: str | None, contents: bytes) -> str:
    LOCAL_TRANSCRIPTION_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix=_safe_audio_suffix(filename),
        dir=LOCAL_TRANSCRIPTION_ROOT,
    ) as temp_file:
        temp_file.write(contents)
        return temp_file.name


def _save_local_tts_audio(current_user: str, audio_content: bytes) -> str:
    safe_user = _safe_path_part(current_user)
    audio_id = f"{uuid.uuid4()}.mp3"
    output_dir = LOCAL_TTS_ROOT / safe_user
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / audio_id
    output_path.write_bytes(audio_content)
    return f"/tts/audio/{safe_user}/{audio_id}"


def _local_audio_url(request: Request, relative_path: str, token: str) -> str:
    return f"{str(request.base_url).rstrip('/')}{relative_path}?token={token}"

@router.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(..., description="The audio file to transcribe"),
    current_user: str = Depends(get_current_user)
):
    """Transcribe audio file using OpenAI Whisper API"""
    try:
        if not audio:
            raise HTTPException(status_code=400, detail="No audio file provided")
            
        # Read the audio file
        contents = await audio.read()
        
        # Save temporarily with a generated filename, not the uploaded name.
        temp_path = _write_temp_audio_file(audio.filename, contents)
        
        try:
            # Initialize OpenAI client
            client = openai.OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
            
            # Transcribe using OpenAI Whisper
            with open(temp_path, "rb") as audio_file:
                transcript = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file
                )
            
            return {"text": transcript.text}
            
        finally:
            # Clean up temp file
            if os.path.exists(temp_path):
                os.remove(temp_path)
                
    except HTTPException:
        raise
    except Exception as e:
        print(
            f"{RED}transcribe_audio failed: "
            f"{sanitize_public_error_text(e)} ({type(e).__name__}){RESET}"
        )
        raise internal_server_error()

@router.post("/text-to-speech")
async def text_to_speech(
    payload: dict,
    http_request: Request,
    current_user: str = Depends(get_current_user)
):
    """Convert text to speech using OpenAI's TTS API and return a URL"""
    try:
        if not payload.get("text"):
            raise HTTPException(status_code=400, detail="No text provided")

        # Initialize OpenAI client
        client = openai.OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

        # Convert text to speech using OpenAI's TTS
        response = client.audio.speech.create(
            model="tts-1", # or "tts-1-hd" for higher quality
            voice="alloy", # can be alloy, echo, fable, onyx, nova, or shimmer
            input=payload["text"]
        )

        # Generate unique filename
        filename = f"tts/{current_user}/{uuid.uuid4()}.mp3"

        # Upload to S3 when configured; otherwise keep local demos self-contained.
        if not BUCKET_NAME:
            relative_path = _save_local_tts_audio(current_user, response.content)
            token = create_scoped_token(
                user_id=current_user,
                scope="tts_audio",
                expires_delta=timedelta(minutes=10),
            )
            return {
                "audioUrl": _local_audio_url(http_request, relative_path, token),
                "storage": "local",
            }

        try:
            s3_client.put_object(
                Bucket=BUCKET_NAME,
                Key=filename,
                Body=response.content,
                ContentType='audio/mpeg'
            )

            # Generate presigned URL that expires in 1 hour
            url = s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': BUCKET_NAME, 'Key': filename},
                ExpiresIn=3600
            )

            return {"audioUrl": url}

        except ClientError as e:
            print(f"Error uploading to S3: {sanitize_public_error_text(e)}")
            raise HTTPException(status_code=500, detail="Failed to store audio file")

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in text-to-speech: {sanitize_public_error_text(e)}")
        raise internal_server_error()


@router.get("/tts/audio/{user_id}/{audio_id}")
async def get_local_tts_audio(
    user_id: str,
    audio_id: str,
    token: str,
):
    """Serve locally stored TTS audio for demos without S3."""
    safe_user = _safe_path_part(user_id)
    token_user = get_user_from_token(token, required_scope="tts_audio")
    safe_current_user = _safe_path_part(token_user)
    safe_audio_id = _safe_path_part(audio_id.replace(".mp3", "")) + ".mp3"

    if safe_user != safe_current_user:
        raise HTTPException(status_code=403, detail="Cannot access another user's audio")

    audio_path = (LOCAL_TTS_ROOT / safe_user / safe_audio_id).resolve()
    root = LOCAL_TTS_ROOT.resolve()
    if root not in audio_path.parents or not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio not found")

    return FileResponse(
        path=str(audio_path),
        media_type="audio/mpeg",
        filename=safe_audio_id,
    )
