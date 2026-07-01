from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

load_dotenv()

def _normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    if not url.startswith("postgresql://"):
        return url

    parts = urlsplit(url)
    allowed_query = {
        key: value
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key in {"sslmode", "sslcert", "sslkey", "sslrootcert", "application_name"}
    }
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(allowed_query), parts.fragment))


SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or "sqlite:///./data/interview_app.db"
if SQLALCHEMY_DATABASE_URL.startswith("sqlite:////tmp/") and os.getenv("POSTGRES_URL"):
    SQLALCHEMY_DATABASE_URL = os.getenv("POSTGRES_URL", SQLALCHEMY_DATABASE_URL)
SQLALCHEMY_DATABASE_URL = _normalize_database_url(SQLALCHEMY_DATABASE_URL)

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close() 
