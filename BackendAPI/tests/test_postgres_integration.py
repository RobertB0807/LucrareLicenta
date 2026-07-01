from __future__ import annotations

import os
import unittest
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import inspect

import db
import main

EXPECTED_LEARNING_LESSON_COUNT = 16


@unittest.skipUnless(
    os.getenv("RUN_POSTGRES_INTEGRATION", "").lower() == "true",
    "PostgreSQL integration tests are disabled",
)
class PostgresIntegrationTestCase(unittest.TestCase):
    def tearDown(self) -> None:
        db.engine.dispose()

    def test_migrations_and_primary_user_training_flow(self) -> None:
        self.assertTrue(db.DATABASE_URL.startswith("postgresql+psycopg://"))

        table_names = set(inspect(db.engine).get_table_names())
        self.assertTrue(
            {
                "users",
                "training_sessions",
                "scenario_attempts",
                "session_events",
                "user_learning_profiles",
                "user_learning_path_progress",
                "learning_lessons",
                "learning_lesson_sections",
                "learning_quiz_questions",
                "learning_quiz_options",
                "learning_quiz_attempts",
                "learning_quiz_answers",
            }.issubset(table_names)
        )

        with TestClient(main.app) as client:
            readiness = client.get("/health/ready")
            self.assertEqual(readiness.status_code, 200)

            registration = client.post(
                "/auth/register",
                json={
                    "email": f"postgres-{uuid4().hex}@example.invalid",
                    "password": f"Postgres-{uuid4().hex}",
                    "display_name": "Postgres Integration",
                },
            )
            self.assertEqual(registration.status_code, 200)
            token = registration.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            lessons = client.get("/learning/lessons", headers=headers)
            self.assertEqual(lessons.status_code, 200)
            self.assertEqual(len(lessons.json()["items"]), EXPECTED_LEARNING_LESSON_COUNT)

            generated = client.post(
                "/scenario/generate",
                headers=headers,
                json={"attack_type": "smishing", "difficulty": "medium"},
            )
            self.assertEqual(generated.status_code, 200)
            generated_payload = generated.json()

            evaluated = client.post(
                "/scenario/evaluate",
                headers=headers,
                json={
                    "scenario_id": generated_payload["scenario_id"],
                    "selected_option_id": generated_payload["options"][0]["id"],
                },
            )
            self.assertEqual(evaluated.status_code, 200)

            sessions = client.get("/sessions", headers=headers)
            self.assertEqual(sessions.status_code, 200)
            self.assertEqual(sessions.json()["total"], 1)


if __name__ == "__main__":
    unittest.main()
