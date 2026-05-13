from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_SQLITE_DATABASE_URL = f"sqlite:///{BASE_DIR / 'training_data.db'}"


def normalize_database_url(raw_url: str) -> str:
    if raw_url.startswith("postgres://"):
        return raw_url.replace("postgres://", "postgresql+psycopg://", 1)
    if raw_url.startswith("postgresql://"):
        return raw_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return raw_url


DATABASE_URL = normalize_database_url(
    os.getenv("DATABASE_URL", DEFAULT_SQLITE_DATABASE_URL).strip()
)


class Base(DeclarativeBase):
    pass


def build_engine(database_url: str):
    engine_kwargs: dict[str, object] = {}
    if database_url.startswith("sqlite"):
        engine_kwargs["connect_args"] = {"check_same_thread": False}
    return create_engine(database_url, **engine_kwargs)


engine = build_engine(DATABASE_URL)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)


def init_db() -> None:
    try:
        from alembic import command
        from alembic.config import Config
    except ModuleNotFoundError:
        import persistence_models  # noqa: F401

        Base.metadata.create_all(bind=engine)
        return

    config = Config(str(BASE_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BASE_DIR / "migrations"))
    config.set_main_option("sqlalchemy.url", DATABASE_URL)
    command.upgrade(config, "head")
