from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from app_config import (
    DEFAULT_DEVELOPMENT_JWT_SECRET,
    LOCAL_CORS_ORIGINS,
    RuntimeSettings,
    load_runtime_settings,
    normalize_app_environment,
    validate_runtime_config,
)


class AppConfigTestCase(unittest.TestCase):
    def test_environment_aliases_are_normalized(self) -> None:
        self.assertEqual(normalize_app_environment(None), "development")
        self.assertEqual(normalize_app_environment("dev"), "development")
        self.assertEqual(normalize_app_environment("testing"), "test")
        self.assertEqual(normalize_app_environment("prod"), "production")

        with self.assertRaises(ValueError):
            normalize_app_environment("staging")

    def test_development_defaults_are_local_and_docs_are_enabled(self) -> None:
        with patch.dict(
            os.environ,
            {"APP_ENV": "development"},
            clear=True,
        ):
            settings = load_runtime_settings()

        self.assertEqual(settings.environment, "development")
        self.assertEqual(settings.cors_origins, LOCAL_CORS_ORIGINS)
        self.assertFalse(settings.trust_proxy_headers)
        self.assertTrue(settings.api_docs_enabled)
        self.assertTrue(settings.auto_migrate)
        self.assertIsNone(settings.redis_url)
        self.assertTrue(settings.rate_limit_fail_open)
        self.assertFalse(settings.log_json)
        self.assertTrue(settings.metrics_enabled)

    def test_runtime_flags_and_origins_are_loaded(self) -> None:
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "production",
                "APP_CORS_ORIGINS": "https://app.example.com/, https://admin.example.com",
                "TRUST_PROXY_HEADERS": "true",
                "API_DOCS_ENABLED": "false",
                "AUTO_MIGRATE": "false",
                "REDIS_URL": "redis://redis:6379/0",
                "RATE_LIMIT_FAIL_OPEN": "false",
                "LOG_JSON": "true",
                "METRICS_ENABLED": "true",
                "SENTRY_DSN": "https://public@example.invalid/1",
                "SENTRY_TRACES_SAMPLE_RATE": "0.25",
            },
            clear=False,
        ):
            settings = load_runtime_settings()

        self.assertEqual(
            settings.cors_origins,
            ("https://app.example.com", "https://admin.example.com"),
        )
        self.assertTrue(settings.trust_proxy_headers)
        self.assertFalse(settings.api_docs_enabled)
        self.assertFalse(settings.auto_migrate)
        self.assertEqual(settings.redis_url, "redis://redis:6379/0")
        self.assertFalse(settings.rate_limit_fail_open)
        self.assertTrue(settings.log_json)
        self.assertEqual(settings.sentry_traces_sample_rate, 0.25)

    def test_production_rejects_insecure_configuration(self) -> None:
        settings = RuntimeSettings(
            environment="production",
            cors_origins=(),
            trust_proxy_headers=False,
            api_docs_enabled=False,
            auto_migrate=False,
            redis_url=None,
            rate_limit_fail_open=False,
            log_level="INFO",
            log_json=True,
            metrics_enabled=True,
            sentry_dsn=None,
            sentry_traces_sample_rate=0.0,
        )

        with self.assertRaisesRegex(RuntimeError, "APP_CORS_ORIGINS"):
            validate_runtime_config(
                settings,
                database_url="sqlite:///training.db",
                jwt_secret_key=DEFAULT_DEVELOPMENT_JWT_SECRET,
            )

    def test_production_accepts_postgres_strong_secret_and_exact_origin(self) -> None:
        settings = RuntimeSettings(
            environment="production",
            cors_origins=("https://app.example.com",),
            trust_proxy_headers=True,
            api_docs_enabled=False,
            auto_migrate=False,
            redis_url="redis://redis:6379/0",
            rate_limit_fail_open=False,
            log_level="INFO",
            log_json=True,
            metrics_enabled=True,
            sentry_dsn=None,
            sentry_traces_sample_rate=0.0,
        )

        validate_runtime_config(
            settings,
            database_url="postgresql+psycopg://user:pass@db/app",
            jwt_secret_key="a-unique-production-secret-that-is-long-enough",
        )

    def test_production_rejects_example_credentials(self) -> None:
        settings = RuntimeSettings(
            environment="production",
            cors_origins=("https://app.example.com",),
            trust_proxy_headers=True,
            api_docs_enabled=False,
            auto_migrate=False,
            redis_url="redis://redis:6379/0",
            rate_limit_fail_open=False,
            log_level="INFO",
            log_json=True,
            metrics_enabled=True,
            sentry_dsn=None,
            sentry_traces_sample_rate=0.0,
        )

        with self.assertRaisesRegex(RuntimeError, "example credential"):
            validate_runtime_config(
                settings,
                database_url=(
                    "postgresql+psycopg://user:"
                    "replace-with-a-strong-database-password@db/app"
                ),
                jwt_secret_key="replace-with-a-unique-random-secret-of-at-least-32-characters",
            )

    def test_wildcard_cors_is_rejected_in_every_environment(self) -> None:
        settings = RuntimeSettings(
            environment="development",
            cors_origins=("*",),
            trust_proxy_headers=False,
            api_docs_enabled=True,
            auto_migrate=True,
            redis_url=None,
            rate_limit_fail_open=True,
            log_level="DEBUG",
            log_json=False,
            metrics_enabled=True,
            sentry_dsn=None,
            sentry_traces_sample_rate=0.0,
        )

        with self.assertRaisesRegex(RuntimeError, "may not contain"):
            validate_runtime_config(
                settings,
                database_url="sqlite:///training.db",
                jwt_secret_key=DEFAULT_DEVELOPMENT_JWT_SECRET,
            )


if __name__ == "__main__":
    unittest.main()
