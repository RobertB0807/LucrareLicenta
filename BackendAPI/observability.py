from __future__ import annotations

from datetime import datetime, timezone
import json
import logging
import sys
from time import monotonic
from typing import Any

from prometheus_client import Counter, Histogram, generate_latest

from app_config import RuntimeSettings

HTTP_REQUESTS_TOTAL = Counter(
    "cyber_training_http_requests_total",
    "Total HTTP requests handled by the API.",
    ("method", "path", "status"),
)
HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "cyber_training_http_request_duration_seconds",
    "HTTP request duration in seconds.",
    ("method", "path"),
)
RATE_LIMIT_REJECTIONS_TOTAL = Counter(
    "cyber_training_rate_limit_rejections_total",
    "Total requests rejected by rate limiting.",
    ("path", "backend"),
)
RATE_LIMIT_BACKEND_ERRORS_TOTAL = Counter(
    "cyber_training_rate_limit_backend_errors_total",
    "Total rate-limit backend errors.",
    ("backend",),
)

STANDARD_LOG_RECORD_FIELDS = {
    "args",
    "asctime",
    "created",
    "exc_info",
    "exc_text",
    "filename",
    "funcName",
    "levelname",
    "levelno",
    "lineno",
    "module",
    "msecs",
    "message",
    "msg",
    "name",
    "pathname",
    "process",
    "processName",
    "relativeCreated",
    "stack_info",
    "thread",
    "threadName",
    "taskName",
}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in STANDARD_LOG_RECORD_FIELDS and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging(settings: RuntimeSettings) -> None:
    handler = logging.StreamHandler(sys.stdout)
    if settings.log_json:
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)s [%(name)s] %(message)s"
            )
        )

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(settings.log_level)


def initialize_error_tracking(settings: RuntimeSettings) -> bool:
    if not settings.sentry_dsn:
        return False

    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        send_default_pii=False,
    )
    return True


def observe_request(
    *,
    method: str,
    path: str,
    status_code: int,
    started_at: float,
) -> int:
    duration_seconds = monotonic() - started_at
    HTTP_REQUESTS_TOTAL.labels(
        method=method,
        path=path,
        status=str(status_code),
    ).inc()
    HTTP_REQUEST_DURATION_SECONDS.labels(
        method=method,
        path=path,
    ).observe(duration_seconds)
    return round(duration_seconds * 1000)


def prometheus_payload() -> bytes:
    return generate_latest()
