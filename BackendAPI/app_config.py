from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

DEFAULT_DEVELOPMENT_JWT_SECRET = "dev-insecure-secret-change-me"
PRODUCTION_ENVIRONMENTS = {"production", "prod"}
TEST_ENVIRONMENTS = {"test", "testing"}
LOCAL_CORS_ORIGINS = (
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:19006",
    "http://127.0.0.1:19006",
)


def _env_flag(name: str, default: bool = False) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def _csv_env(name: str) -> tuple[str, ...]:
    raw_value = os.getenv(name, "")
    return tuple(
        value.strip().rstrip("/")
        for value in raw_value.split(",")
        if value.strip()
    )


def _float_env(name: str, default: float) -> float:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    try:
        return float(raw_value)
    except ValueError:
        return default


def normalize_app_environment(value: str | None) -> str:
    normalized = (value or "development").strip().lower()
    if normalized in PRODUCTION_ENVIRONMENTS:
        return "production"
    if normalized in TEST_ENVIRONMENTS:
        return "test"
    if normalized in {"development", "dev", "local"}:
        return "development"
    raise ValueError(
        "APP_ENV must be one of: development, test, production"
    )


@dataclass(frozen=True)
class RuntimeSettings:
    environment: str
    cors_origins: tuple[str, ...]
    trust_proxy_headers: bool
    api_docs_enabled: bool
    auto_migrate: bool
    redis_url: str | None
    rate_limit_fail_open: bool
    log_level: str
    log_json: bool
    metrics_enabled: bool
    sentry_dsn: str | None
    sentry_traces_sample_rate: float

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


def load_runtime_settings() -> RuntimeSettings:
    environment = normalize_app_environment(os.getenv("APP_ENV"))
    configured_origins = _csv_env("APP_CORS_ORIGINS")
    cors_origins = configured_origins
    if not cors_origins and environment != "production":
        cors_origins = LOCAL_CORS_ORIGINS
    redis_url = os.getenv("REDIS_URL", "").strip() or None

    return RuntimeSettings(
        environment=environment,
        cors_origins=cors_origins,
        trust_proxy_headers=_env_flag("TRUST_PROXY_HEADERS"),
        api_docs_enabled=_env_flag(
            "API_DOCS_ENABLED",
            default=environment != "production",
        ),
        auto_migrate=_env_flag(
            "AUTO_MIGRATE",
            default=environment != "production",
        ),
        redis_url=redis_url,
        rate_limit_fail_open=_env_flag(
            "RATE_LIMIT_FAIL_OPEN",
            default=environment != "production",
        ),
        log_level=os.getenv(
            "LOG_LEVEL",
            "INFO" if environment == "production" else "DEBUG",
        ).strip().upper(),
        log_json=_env_flag("LOG_JSON", default=environment == "production"),
        metrics_enabled=_env_flag("METRICS_ENABLED", default=True),
        sentry_dsn=os.getenv("SENTRY_DSN", "").strip() or None,
        sentry_traces_sample_rate=min(
            1.0,
            max(0.0, _float_env("SENTRY_TRACES_SAMPLE_RATE", 0.0)),
        ),
    )


def validate_runtime_config(
    settings: RuntimeSettings,
    *,
    database_url: str,
    jwt_secret_key: str,
) -> None:
    if any(origin == "*" for origin in settings.cors_origins):
        raise RuntimeError(
            "APP_CORS_ORIGINS may not contain '*'"
        )

    if not settings.is_production:
        return

    errors: list[str] = []
    if not settings.cors_origins:
        errors.append("APP_CORS_ORIGINS must contain at least one production origin")
    if (
        not jwt_secret_key
        or jwt_secret_key == DEFAULT_DEVELOPMENT_JWT_SECRET
        or jwt_secret_key.startswith("replace-with-")
        or len(jwt_secret_key) < 32
    ):
        errors.append("JWT_SECRET_KEY must be a unique value of at least 32 characters")
    if database_url.startswith("sqlite"):
        errors.append("DATABASE_URL must use PostgreSQL in production")
    if "replace-with-" in database_url:
        errors.append("DATABASE_URL still contains an example credential")
    if not settings.redis_url:
        errors.append("REDIS_URL is required in production")
    if settings.rate_limit_fail_open:
        errors.append("RATE_LIMIT_FAIL_OPEN must be false in production")
    if settings.auto_migrate:
        errors.append("AUTO_MIGRATE must be false in production")

    if errors:
        raise RuntimeError("Invalid production configuration: " + "; ".join(errors))
