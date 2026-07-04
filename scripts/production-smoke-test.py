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
        with request.urlopen(http_request, timeout=30) as response:
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

    onboarding = require_status(
        call("GET", "/onboarding", token=token),
        200,
        "onboarding status",
    )
    if not isinstance(onboarding, dict) or onboarding.get("completed") is not False:
        raise RuntimeError("Onboarding initial status is invalid")
    questions = onboarding.get("questions")
    if not isinstance(questions, list) or len(questions) != 3:
        raise RuntimeError("Onboarding assessment questions are missing")
    onboarding_answers: list[dict[str, object]] = []
    for question in questions:
        if not isinstance(question, dict):
            raise RuntimeError("Onboarding question payload is invalid")
        options = question.get("options")
        if (
            not isinstance(question.get("id"), str)
            or not isinstance(options, list)
            or not options
            or not isinstance(options[0], dict)
            or not isinstance(options[0].get("id"), str)
        ):
            raise RuntimeError("Onboarding question options are invalid")
        onboarding_answers.append(
            {
                "question_id": question["id"],
                "selected_option_id": options[0]["id"],
            }
        )
    completed_onboarding = require_status(
        call(
            "POST",
            "/onboarding/complete",
            payload={
                "experience": "beginner",
                "learning_goal": "personal_safety",
                "answers": onboarding_answers,
            },
            token=token,
        ),
        200,
        "onboarding completion",
    )
    if (
        not isinstance(completed_onboarding, dict)
        or completed_onboarding.get("onboarding_completed") is not True
    ):
        raise RuntimeError("Onboarding completion failed")

    catalog = require_status(
        call("GET", "/scenario/catalog", token=token),
        200,
        "scenario catalog",
    )
    if not isinstance(catalog, dict) or not catalog.get("items"):
        raise RuntimeError("Scenario catalog is empty")

    learning_path = require_status(
        call("GET", "/learning/path", token=token),
        200,
        "learning path",
    )
    if (
        not isinstance(learning_path, dict)
        or not isinstance(learning_path.get("modules"), list)
        or not learning_path["modules"]
    ):
        raise RuntimeError("Learning path is incomplete")

    learning_profile = require_status(
        call("GET", "/learning/profile", token=token),
        200,
        "learning profile",
    )
    if not isinstance(learning_profile, dict) or "recommended_next" not in learning_profile:
        raise RuntimeError("Learning profile is incomplete")

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

    session_id = generated.get("session_id")
    if not isinstance(session_id, str) or not session_id:
        raise RuntimeError("Generated scenario did not include a session id")

    session_snapshot = require_status(
        call("GET", f"/session/{session_id}", token=token),
        200,
        "session snapshot",
    )
    if not isinstance(session_snapshot, dict) or session_snapshot.get("session_id") != session_id:
        raise RuntimeError("Session snapshot is incomplete")

    assistant = require_status(
        call(
            "POST",
            "/assistant/ask",
            payload={
                "message": "Explică-mi pe scurt ce trebuie verificat într-un email suspect.",
                "session_id": session_id,
                "scenario_id": scenario_id,
                "attack_type": "phishing",
                "difficulty": "easy",
            },
            token=token,
        ),
        200,
        "assistant guidance",
    )
    if (
        not isinstance(assistant, dict)
        or not isinstance(assistant.get("answer"), str)
        or assistant.get("safety_status") != "answered"
    ):
        raise RuntimeError("Assistant guidance response is incomplete")

    live_drill = require_status(
        call(
            "POST",
            "/live-drills",
            payload={
                "delivery_channel": "email",
                "recipient": email,
                "dry_run": True,
                "attack_type": "phishing",
                "difficulty": "easy",
                "session_id": session_id,
            },
            token=token,
        ),
        200,
        "live drill creation",
    )
    if not isinstance(live_drill, dict):
        raise RuntimeError("Live drill creation did not return JSON")
    live_drill_id = live_drill.get("id")
    tracking_url = live_drill.get("tracking_url")
    delivery_status = live_drill.get("delivery_status")
    if (
        not isinstance(live_drill_id, str)
        or not isinstance(tracking_url, str)
        or "/live-drills/track/" not in tracking_url
        or delivery_status != "dry_run"
    ):
        raise RuntimeError("Live drill payload is incomplete")

    live_drills = require_status(
        call("GET", "/live-drills/recent?limit=10", token=token),
        200,
        "live drill history",
    )
    if not isinstance(live_drills, dict) or not isinstance(live_drills.get("items"), list):
        raise RuntimeError("Live drill history is incomplete")
    if not any(
        isinstance(item, dict) and item.get("id") == live_drill_id
        for item in live_drills["items"]
    ):
        raise RuntimeError("Created live drill was not returned in history")

    live_report = require_status(
        call("POST", f"/live-drills/{live_drill_id}/report", payload={}, token=token),
        200,
        "live drill report",
    )
    if (
        not isinstance(live_report, dict)
        or live_report.get("id") != live_drill_id
        or live_report.get("reported_at") is None
    ):
        raise RuntimeError("Live drill report response is incomplete")

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
