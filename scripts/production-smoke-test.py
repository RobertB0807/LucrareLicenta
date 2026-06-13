from __future__ import annotations

import json
import os
import sys
from urllib import error, request
from uuid import uuid4

BASE_URL = os.getenv("API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")


def call(
    method: str,
    path: str,
    *,
    payload: dict[str, object] | None = None,
    token: str | None = None,
) -> tuple[int, dict[str, object] | str]:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    http_request = request.Request(
        f"{BASE_URL}{path}",
        data=body,
        headers=headers,
        method=method,
    )
    try:
        with request.urlopen(http_request, timeout=15) as response:
            content = response.read().decode("utf-8")
            content_type = response.headers.get("content-type", "")
            if "application/json" in content_type:
                return response.status, json.loads(content)
            return response.status, content
    except error.HTTPError as exc:
        content = exc.read().decode("utf-8")
        raise RuntimeError(f"{method} {path} failed: {exc.code} {content}") from exc


def require_status(
    result: tuple[int, dict[str, object] | str],
    expected: int,
    label: str,
) -> dict[str, object] | str:
    status, payload = result
    if status != expected:
        raise RuntimeError(f"{label} returned {status}, expected {expected}")
    return payload


def main() -> int:
    require_status(call("GET", "/health"), 200, "liveness")
    require_status(call("GET", "/health/ready"), 200, "readiness")

    email = f"production-smoke-{uuid4().hex}@example.invalid"
    registration = require_status(
        call(
            "POST",
            "/auth/register",
            payload={
                "email": email,
                "password": f"Smoke-{uuid4().hex}",
                "display_name": "Production Smoke",
            },
        ),
        200,
        "registration",
    )
    if not isinstance(registration, dict):
        raise RuntimeError("Registration did not return JSON")
    token = registration.get("access_token")
    if not isinstance(token, str) or not token:
        raise RuntimeError("Registration did not return an access token")

    catalog = require_status(
        call("GET", "/scenario/catalog", token=token),
        200,
        "scenario catalog",
    )
    if not isinstance(catalog, dict) or not catalog.get("items"):
        raise RuntimeError("Scenario catalog is empty")

    lessons = require_status(
        call("GET", "/learning/lessons", token=token),
        200,
        "learning lesson catalog",
    )
    if not isinstance(lessons, dict) or not lessons.get("items"):
        raise RuntimeError("Learning lesson catalog is empty")
    first_lesson = lessons["items"][0]
    if not isinstance(first_lesson, dict) or not isinstance(first_lesson.get("id"), str):
        raise RuntimeError("Learning lesson catalog contains an invalid item")
    lesson_detail = require_status(
        call("GET", f"/learning/lessons/{first_lesson['id']}", token=token),
        200,
        "learning lesson detail",
    )
    if (
        not isinstance(lesson_detail, dict)
        or not lesson_detail.get("sections")
        or not lesson_detail.get("questions")
    ):
        raise RuntimeError("Learning lesson detail is incomplete")

    generated = require_status(
        call(
            "POST",
            "/scenario/generate",
            payload={"attack_type": "phishing", "difficulty": "easy"},
            token=token,
        ),
        200,
        "scenario generation",
    )
    if not isinstance(generated, dict):
        raise RuntimeError("Scenario generation did not return JSON")
    scenario_id = generated.get("scenario_id")
    options = generated.get("options")
    if (
        not isinstance(scenario_id, str)
        or not isinstance(options, list)
        or not options
        or not isinstance(options[0], dict)
        or not isinstance(options[0].get("id"), str)
    ):
        raise RuntimeError("Generated scenario payload is incomplete")

    require_status(
        call(
            "POST",
            "/scenario/evaluate",
            payload={
                "scenario_id": scenario_id,
                "selected_option_id": options[0]["id"],
            },
            token=token,
        ),
        200,
        "scenario evaluation",
    )

    metrics = require_status(call("GET", "/metrics"), 200, "metrics")
    if not isinstance(metrics, str) or "cyber_training_http_requests_total" not in metrics:
        raise RuntimeError("Prometheus metrics are missing expected counters")

    print("Production smoke test passed.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from exc
