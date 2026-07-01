"""Production WSGI entrypoint for the backend-only MiroFish service."""

from app import create_app
from app.config import Config


errors = Config.validate()
if errors:
    raise RuntimeError("MiroFish production runtime is not configured: " + "; ".join(errors))

app = create_app()
