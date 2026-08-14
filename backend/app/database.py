from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from backend.app.config import settings

settings.resolved_runtime_dir.mkdir(parents=True, exist_ok=True)
DATABASE_URL = settings.database_url or (
    f"sqlite:///{settings.resolved_runtime_dir / 'avito_dev.db'}"
)

engine_options = {"echo": settings.sql_echo}
if DATABASE_URL.startswith("sqlite:"):
    engine_options["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_options)

SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass
