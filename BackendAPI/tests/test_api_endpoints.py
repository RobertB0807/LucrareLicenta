from __future__ import annotations

import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import db
from llm_service import LlmScenarioGeneration
import main
import persistence_repository
from persistence_models import UserLearningProfileORM
from scenario_models import ScenarioTemplate
import training_service


class ApiEndpointsTestCase(unittest.TestCase):
    def setUp(self) -> None:
        env_patcher = patch.dict(os.environ, {"LLM_ENABLED": "false"}, clear=False)
        env_patcher.start()
        self.addCleanup(env_patcher.stop)

        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        test_db_path = Path(temp_dir.name) / "test_training_data.db"
        database_url = f"sqlite:///{test_db_path}"

        self.original_database_url = db.DATABASE_URL
        self.original_engine = db.engine
        self.original_session_local = db.SessionLocal
        self.original_repository_session_local = persistence_repository.SessionLocal

        testing_engine = create_engine(database_url, connect_args={"check_same_thread": False})
        testing_session_local = sessionmaker(bind=testing_engine, autoflush=False, autocommit=False)

        db.DATABASE_URL = database_url
        db.engine = testing_engine
        db.SessionLocal = testing_session_local
        persistence_repository.SessionLocal = testing_session_local

        training_service.scenario_contexts.clear()

        db.init_db()
        main.rate_limiter.reset()
        self.client = TestClient(main.app)
        self.auth_headers = self._register_and_auth_headers("tester@example.com")

        def restore_state() -> None:
            training_service.scenario_contexts.clear()
            main.rate_limiter.configure_limits(
                {
                    "/scenario/generate": (30, 60),
                    "/scenario/evaluate": (60, 60),
                    "/assistant/ask": (60, 60),
                }
            )
            db.DATABASE_URL = self.original_database_url
            db.engine = self.original_engine
            db.SessionLocal = self.original_session_local
            persistence_repository.SessionLocal = self.original_repository_session_local
            testing_engine.dispose()

        self.addCleanup(restore_state)

    def _register_and_auth_headers(self, email: str) -> dict[str, str]:
        response = self.client.post(
            "/auth/register",
            json={
                "email": email,
                "password": "strong-pass-123",
                "display_name": "Tester",
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.auth_user_id = payload["user"]["id"]
        token = payload["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def test_health_returns_ok(self) -> None:
        response = main.health()
        self.assertEqual(response, {"status": "ok"})

    def test_generate_evaluate_and_session_endpoints(self) -> None:
        generated = main.generate_scenario(
            main.GenerateScenarioRequest(attack_type="phishing", difficulty="easy")
        )
        generated_payload = generated.model_dump()

        session_id = generated_payload["session_id"]
        scenario_id = generated_payload["scenario_id"]
        options = generated_payload["options"]

        self.assertTrue(isinstance(session_id, str) and session_id)
        self.assertTrue(isinstance(scenario_id, str) and scenario_id)
        self.assertTrue(isinstance(options, list) and len(options) > 0)

        evaluated = main.evaluate_scenario(
            main.EvaluateScenarioRequest(
                scenario_id=scenario_id,
                selected_option_id=options[0]["id"],
            )
        )
        evaluated_payload = evaluated.model_dump()

        self.assertIn("is_correct", evaluated_payload)
        self.assertIn(evaluated_payload["score_delta"], {-5, 0, 10})
        self.assertGreaterEqual(evaluated_payload["session_stats"]["total_attempts"], 1)

        snapshot = main.get_session_snapshot(session_id)
        snapshot_payload = snapshot.model_dump()
        self.assertEqual(snapshot_payload["session_id"], session_id)
        self.assertGreaterEqual(snapshot_payload["generated_scenarios"], 1)
        self.assertGreaterEqual(snapshot_payload["evaluated_scenarios"], 1)
        self.assertTrue(isinstance(snapshot_payload["session_stats"]["recent_events"], list))
        self.assertGreaterEqual(len(snapshot_payload["session_stats"]["recent_events"]), 1)

        events = main.get_session_events(session_id=session_id, limit=5, offset=0)
        events_payload = events.model_dump()
        self.assertEqual(events_payload["session_id"], session_id)
        self.assertEqual(events_payload["limit"], 5)
        self.assertEqual(events_payload["offset"], 0)
        self.assertGreaterEqual(events_payload["total"], 1)
        self.assertGreaterEqual(len(events_payload["events"]), 1)

        trends = main.get_session_trends(session_id=session_id, limit=10, offset=0)
        trends_payload = trends.model_dump()
        self.assertEqual(trends_payload["session_id"], session_id)
        self.assertEqual(trends_payload["limit"], 10)
        self.assertEqual(trends_payload["offset"], 0)
        self.assertGreaterEqual(trends_payload["total"], 1)
        self.assertGreaterEqual(len(trends_payload["points"]), 1)
        self.assertIn("score_after", trends_payload["points"][0])
        self.assertIn("accuracy_after", trends_payload["points"][0])

        filtered_trends = main.get_session_trends(
            session_id=session_id,
            limit=10,
            offset=0,
            attack_type="phishing",
        ).model_dump()
        self.assertTrue(all(point["attack_type"] == "phishing" for point in filtered_trends["points"]))

        future_since = datetime.now(timezone.utc) + timedelta(days=1)
        empty_trends = main.get_session_trends(
            session_id=session_id,
            limit=10,
            offset=0,
            since=future_since,
        ).model_dump()
        self.assertEqual(empty_trends["total"], 0)

        trend_aggregates = main.get_session_trend_aggregates(
            session_id=session_id,
            attack_type="phishing",
        ).model_dump()
        self.assertEqual(trend_aggregates["session_id"], session_id)
        self.assertIn("total_attempts", trend_aggregates)
        self.assertIn("by_day", trend_aggregates)
        self.assertIn("by_attack", trend_aggregates)
        self.assertTrue(all(item["attack_type"] == "phishing" for item in trend_aggregates["by_attack"]))

    def test_evaluate_after_context_cache_reset_uses_persisted_rule(self) -> None:
        generated = main.generate_scenario(
            main.GenerateScenarioRequest(attack_type="smishing", difficulty="medium")
        )
        generated_payload = generated.model_dump()
        scenario_id = generated_payload["scenario_id"]
        options = generated_payload["options"]

        training_service.scenario_contexts.clear()

        evaluated = main.evaluate_scenario(
            main.EvaluateScenarioRequest(
                scenario_id=scenario_id,
                selected_option_id=options[0]["id"],
            )
        )
        evaluated_payload = evaluated.model_dump()
        self.assertIn("is_correct", evaluated_payload)
        self.assertIn(evaluated_payload["score_delta"], {-5, 0, 10})

    def test_evaluate_retry_with_same_option_is_idempotent(self) -> None:
        generated = self.client.post(
            "/scenario/generate",
            json={"attack_type": "phishing", "difficulty": "easy"},
            headers=self.auth_headers,
        )
        self.assertEqual(generated.status_code, 200)
        generated_payload = generated.json()
        request_payload = {
            "scenario_id": generated_payload["scenario_id"],
            "selected_option_id": generated_payload["options"][0]["id"],
        }

        first = self.client.post(
            "/scenario/evaluate",
            json=request_payload,
            headers=self.auth_headers,
        )
        retry = self.client.post(
            "/scenario/evaluate",
            json=request_payload,
            headers=self.auth_headers,
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(retry.status_code, 200)
        self.assertFalse(first.json()["was_already_evaluated"])
        self.assertTrue(retry.json()["was_already_evaluated"])
        self.assertEqual(retry.json()["is_correct"], first.json()["is_correct"])
        self.assertEqual(retry.json()["score_delta"], first.json()["score_delta"])
        self.assertEqual(retry.json()["explanation"], first.json()["explanation"])
        self.assertEqual(retry.json()["session_stats"]["total_attempts"], 1)

        events = self.client.get(
            f"/session/{generated_payload['session_id']}/events",
            headers=self.auth_headers,
        ).json()["events"]
        evaluated_events = [
            event for event in events if event["event_type"] == "answer_evaluated"
        ]
        self.assertEqual(len(evaluated_events), 1)

        learning_rows = persistence_repository.fetch_user_learning_profiles(self.auth_user_id)
        matching_rows = [
            row
            for row in learning_rows
            if row["attack_type"] == "phishing" and row["difficulty"] == "easy"
        ]
        self.assertEqual(len(matching_rows), 1)
        self.assertEqual(matching_rows[0]["attempts"], 1)

    def test_evaluate_retry_with_different_option_returns_conflict(self) -> None:
        generated = self.client.post(
            "/scenario/generate",
            json={"attack_type": "smishing", "difficulty": "medium"},
            headers=self.auth_headers,
        )
        self.assertEqual(generated.status_code, 200)
        generated_payload = generated.json()
        options = generated_payload["options"]
        self.assertGreaterEqual(len(options), 2)

        first = self.client.post(
            "/scenario/evaluate",
            json={
                "scenario_id": generated_payload["scenario_id"],
                "selected_option_id": options[0]["id"],
            },
            headers=self.auth_headers,
        )
        conflict = self.client.post(
            "/scenario/evaluate",
            json={
                "scenario_id": generated_payload["scenario_id"],
                "selected_option_id": options[1]["id"],
            },
            headers=self.auth_headers,
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(conflict.status_code, 409)
        self.assertIn("already evaluated", conflict.json()["detail"])

        snapshot = self.client.get(
            f"/session/{generated_payload['session_id']}",
            headers=self.auth_headers,
        ).json()
        self.assertEqual(snapshot["session_stats"]["total_attempts"], 1)
        self.assertEqual(snapshot["evaluated_scenarios"], 1)

    def test_concurrent_same_option_evaluations_apply_once(self) -> None:
        generated = main.generate_scenario(
            main.GenerateScenarioRequest(
                attack_type="impersonation",
                difficulty="hard",
            )
        ).model_dump()
        request_payload = main.EvaluateScenarioRequest(
            scenario_id=generated["scenario_id"],
            selected_option_id=generated["options"][0]["id"],
        )

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [
                executor.submit(main.evaluate_scenario, request_payload)
                for _ in range(2)
            ]
            results = [future.result().model_dump() for future in futures]

        self.assertEqual(
            sorted(result["was_already_evaluated"] for result in results),
            [False, True],
        )
        snapshot = main.get_session_snapshot(generated["session_id"]).model_dump()
        self.assertEqual(snapshot["session_stats"]["total_attempts"], 1)
        self.assertEqual(snapshot["evaluated_scenarios"], 1)
        evaluated_events = [
            event
            for event in snapshot["session_stats"]["recent_events"]
            if event["event_type"] == "answer_evaluated"
        ]
        self.assertEqual(len(evaluated_events), 1)

    def test_generated_scenario_can_be_restored_after_context_cache_reset(self) -> None:
        generated = self.client.post(
            "/scenario/generate",
            json={
                "attack_type": "phishing",
                "difficulty": "easy",
                "template_id": "phishing-easy-2",
            },
            headers=self.auth_headers,
        )
        self.assertEqual(generated.status_code, 200)
        generated_payload = generated.json()

        training_service.scenario_contexts.clear()

        restored = self.client.get(
            f"/scenario/{generated_payload['scenario_id']}",
            headers=self.auth_headers,
        )
        self.assertEqual(restored.status_code, 200)
        self.assertEqual(restored.json(), generated_payload)

    def test_generated_scenario_read_is_owner_scoped(self) -> None:
        generated = self.client.post(
            "/scenario/generate",
            json={"attack_type": "smishing", "difficulty": "hard"},
            headers=self.auth_headers,
        )
        self.assertEqual(generated.status_code, 200)
        scenario_id = generated.json()["scenario_id"]
        other_user_headers = self._register_and_auth_headers("scenario-reader@example.com")

        blocked = self.client.get(
            f"/scenario/{scenario_id}",
            headers=other_user_headers,
        )
        self.assertEqual(blocked.status_code, 404)
        self.assertEqual(blocked.json()["detail"], "Scenario not found")

    def test_unknown_generated_scenario_returns_404(self) -> None:
        response = self.client.get(
            "/scenario/does-not-exist",
            headers=self.auth_headers,
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Scenario not found")

    def test_session_reads_do_not_depend_on_mutated_in_memory_progress(self) -> None:
        first_generated = main.generate_scenario(
            main.GenerateScenarioRequest(attack_type="phishing", difficulty="easy")
        )
        first_payload = first_generated.model_dump()
        session_id = first_payload["session_id"]

        main.evaluate_scenario(
            main.EvaluateScenarioRequest(
                scenario_id=first_payload["scenario_id"],
                selected_option_id=first_payload["options"][0]["id"],
            )
        )

        tampered = training_service.get_or_create_session(session_id)
        tampered.total_attempts = 999
        tampered.total_score = 999

        second_generated = main.generate_scenario(
            main.GenerateScenarioRequest(
                attack_type="smishing",
                difficulty="medium",
                session_id=session_id,
            )
        )
        second_payload = second_generated.model_dump()
        main.evaluate_scenario(
            main.EvaluateScenarioRequest(
                scenario_id=second_payload["scenario_id"],
                selected_option_id=second_payload["options"][0]["id"],
            )
        )

        snapshot = main.get_session_snapshot(session_id).model_dump()
        self.assertEqual(snapshot["session_stats"]["total_attempts"], 2)
        self.assertLess(snapshot["session_stats"]["total_score"], 100)

    def test_unknown_session_endpoints_return_404(self) -> None:
        with self.assertRaises(HTTPException) as snapshot_exc:
            main.get_session_snapshot("does-not-exist")
        self.assertEqual(snapshot_exc.exception.status_code, 404)
        self.assertEqual(snapshot_exc.exception.detail, "Session not found")

        with self.assertRaises(HTTPException) as events_exc:
            main.get_session_events(session_id="does-not-exist", limit=20, offset=0)
        self.assertEqual(events_exc.exception.status_code, 404)
        self.assertEqual(events_exc.exception.detail, "Session not found")

        with self.assertRaises(HTTPException) as trends_exc:
            main.get_session_trends(session_id="does-not-exist", limit=20, offset=0)
        self.assertEqual(trends_exc.exception.status_code, 404)
        self.assertEqual(trends_exc.exception.detail, "Session not found")

        with self.assertRaises(HTTPException) as trend_aggregates_exc:
            main.get_session_trend_aggregates(session_id="does-not-exist")
        self.assertEqual(trend_aggregates_exc.exception.status_code, 404)
        self.assertEqual(trend_aggregates_exc.exception.detail, "Session not found")

    def test_evaluate_unknown_scenario_returns_404(self) -> None:
        with self.assertRaises(HTTPException) as evaluation_exc:
            main.evaluate_scenario(
                main.EvaluateScenarioRequest(
                    scenario_id="missing-scenario",
                    selected_option_id="ignore",
                )
            )
        self.assertEqual(evaluation_exc.exception.status_code, 404)
        self.assertEqual(evaluation_exc.exception.detail, "Scenario not found")

    def test_assistant_ask_returns_guidance(self) -> None:
        response = self.client.post(
            "/assistant/ask",
            json={
                "message": "Cum identific un email de phishing?",
                "attack_type": "phishing",
                "difficulty": "easy",
            },
            headers=self.auth_headers,
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(isinstance(payload.get("answer"), str) and payload["answer"])
        self.assertTrue(isinstance(payload.get("quick_tips"), list))
        self.assertGreaterEqual(len(payload["quick_tips"]), 3)

    def test_scenario_catalog_returns_items(self) -> None:
        response = self.client.get("/scenario/catalog", headers=self.auth_headers)
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("items", payload)
        self.assertTrue(isinstance(payload["items"], list))
        self.assertGreater(len(payload["items"]), 0)

        first_item = payload["items"][0]
        self.assertIn("id", first_item)
        self.assertIn("attack_type", first_item)
        self.assertIn("difficulty", first_item)
        self.assertIn("channel", first_item)
        self.assertIn("attacker_message_preview", first_item)

    def test_generate_uses_exact_catalog_template_when_template_id_is_provided(self) -> None:
        catalog = self.client.get("/scenario/catalog", headers=self.auth_headers).json()
        selected_item = next(
            item
            for item in catalog["items"]
            if item["id"] == "phishing-easy-2"
        )

        response = self.client.post(
            "/scenario/generate",
            json={
                "attack_type": selected_item["attack_type"],
                "difficulty": selected_item["difficulty"],
                "template_id": selected_item["id"],
            },
            headers=self.auth_headers,
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        expected_template = training_service.SCENARIO_LIBRARY[("phishing", "easy")][1]
        self.assertEqual(payload["attacker_message"], expected_template.attacker_message)
        self.assertEqual(payload["channel"], expected_template.channel)
        self.assertEqual(payload["options"], [option.model_dump() for option in expected_template.options])
        self.assertEqual(payload["red_flags"], expected_template.red_flags)
        self.assertEqual(payload["content_source"], "rule_based")

    def test_rule_based_generation_avoids_immediate_template_repetition(self) -> None:
        first_response = self.client.post(
            "/scenario/generate",
            json={"attack_type": "phishing", "difficulty": "easy"},
            headers=self.auth_headers,
        )
        self.assertEqual(first_response.status_code, 200)
        first_payload = first_response.json()

        second_response = self.client.post(
            "/scenario/generate",
            json={
                "attack_type": "phishing",
                "difficulty": "easy",
                "session_id": first_payload["session_id"],
            },
            headers=self.auth_headers,
        )
        self.assertEqual(second_response.status_code, 200)
        second_payload = second_response.json()

        self.assertNotEqual(first_payload["template_id"], second_payload["template_id"])
        self.assertNotEqual(
            first_payload["attacker_message"],
            second_payload["attacker_message"],
        )

    @patch("training_service.generate_llm_scenario")
    def test_generate_uses_and_restores_valid_llm_scenario(
        self,
        generate_llm_scenario_mock,
    ) -> None:
        generated_template = ScenarioTemplate.model_validate(
            {
                "channel": "sms",
                "attacker_message": (
                    "Mesaj generat local: confirmă livrarea la colet-verificare.invalid "
                    "în următoarele zece minute."
                ),
                "options": [
                    {"id": "comply", "text": "Urmez linkul și completez datele cerute."},
                    {"id": "verify", "text": "Verific livrarea în aplicația oficială."},
                    {"id": "report", "text": "Raportez mesajul și blochez expeditorul."},
                ],
                "red_flags": [
                    "Presiune de timp",
                    "Domeniu extern primit prin SMS",
                    "Solicitare neașteptată de date",
                ],
                "rule": {
                    "correct_option_id": "verify",
                    "correct_explanation": "Corect. Verificarea se face separat, prin canalul oficial.",
                    "incorrect_explanation": "Linkul din mesaj poate conduce la un portal controlat de atacator.",
                },
            }
        )
        generate_llm_scenario_mock.return_value = LlmScenarioGeneration(
            template=generated_template,
            model="qwen3:8b",
            generation_ms=1234,
            fallback_reason=None,
        )

        generated = self.client.post(
            "/scenario/generate",
            json={"attack_type": "smishing", "difficulty": "medium"},
            headers=self.auth_headers,
        )
        self.assertEqual(generated.status_code, 200)
        payload = generated.json()
        self.assertEqual(payload["content_source"], "ollama")
        self.assertEqual(payload["llm_model"], "qwen3:8b")
        self.assertEqual(payload["generation_ms"], 1234)
        self.assertIsNone(payload["template_id"])

        restored = self.client.get(
            f"/scenario/{payload['scenario_id']}",
            headers=self.auth_headers,
        )
        self.assertEqual(restored.status_code, 200)
        self.assertEqual(restored.json(), payload)

    @patch("training_service.generate_llm_scenario")
    def test_catalog_template_bypasses_llm_generation(
        self,
        generate_llm_scenario_mock,
    ) -> None:
        generated = self.client.post(
            "/scenario/generate",
            json={
                "attack_type": "phishing",
                "difficulty": "easy",
                "template_id": "phishing-easy-1",
            },
            headers=self.auth_headers,
        )

        self.assertEqual(generated.status_code, 200)
        generate_llm_scenario_mock.assert_not_called()

    def test_generate_rejects_template_id_for_different_selection(self) -> None:
        response = self.client.post(
            "/scenario/generate",
            json={
                "attack_type": "phishing",
                "difficulty": "easy",
                "template_id": "smishing-easy-1",
            },
            headers=self.auth_headers,
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("does not match", response.json()["detail"])

    def test_assistant_ask_rejects_empty_message(self) -> None:
        response = self.client.post(
            "/assistant/ask",
            json={"message": "   "},
            headers=self.auth_headers,
        )
        self.assertEqual(response.status_code, 422)

    def test_learning_profile_endpoint_reflects_adaptive_attempts(self) -> None:
        persistence_repository.record_user_learning_attempt(
            user_id=self.auth_user_id,
            attack_type="phishing",
            difficulty="easy",
            is_correct=False,
        )
        persistence_repository.record_user_learning_attempt(
            user_id=self.auth_user_id,
            attack_type="smishing",
            difficulty="medium",
            is_correct=True,
        )

        with persistence_repository.session_scope() as test_session:
            rows = (
                test_session.query(UserLearningProfileORM)
                .filter(UserLearningProfileORM.user_id == self.auth_user_id)
                .all()
            )
            for row in rows:
                if row.attack_type == "phishing":
                    row.last_attempt_at = datetime.now(timezone.utc) - timedelta(days=4)
                else:
                    row.last_attempt_at = datetime.now(timezone.utc) + timedelta(days=4)

        profile = self.client.get("/learning/profile", headers=self.auth_headers)
        self.assertEqual(profile.status_code, 200)
        payload = profile.json()

        self.assertEqual(payload["user_id"], self.auth_user_id)
        self.assertGreaterEqual(payload["overall_mastery"], 0)
        self.assertGreaterEqual(payload["coverage"], 0)
        self.assertGreaterEqual(payload["review_summary"]["due_now"], 1)
        self.assertEqual(payload["review_queue"][0]["attack_type"], "phishing")
        self.assertEqual(payload["review_queue"][0]["status"], "due_now")
        self.assertEqual(payload["recommended_next"]["attack_type"], "phishing")
        self.assertIn("recommended_next", payload)

    def test_learning_path_tracks_lessons_scenarios_xp_and_unlocks_modules(self) -> None:
        initial = self.client.get("/learning/path", headers=self.auth_headers)
        self.assertEqual(initial.status_code, 200)
        initial_payload = initial.json()
        self.assertEqual(initial_payload["xp"], 0)
        self.assertEqual(initial_payload["level"], 1)
        self.assertEqual(initial_payload["modules"][0]["status"], "available")
        self.assertEqual(initial_payload["modules"][1]["status"], "locked")
        self.assertEqual(initial_payload["next_action"]["lesson_id"], "phishing-101")

        completed_lesson = self.client.post(
            "/learning/path/lessons/phishing-101/complete",
            headers=self.auth_headers,
        )
        self.assertEqual(completed_lesson.status_code, 200)
        self.assertFalse(completed_lesson.json()["was_already_completed"])
        self.assertEqual(completed_lesson.json()["path"]["xp"], 25)
        self.assertEqual(completed_lesson.json()["path"]["current_streak"], 1)

        duplicate_lesson = self.client.post(
            "/learning/path/lessons/phishing-101/complete",
            headers=self.auth_headers,
        )
        self.assertEqual(duplicate_lesson.status_code, 200)
        self.assertTrue(duplicate_lesson.json()["was_already_completed"])
        self.assertEqual(duplicate_lesson.json()["path"]["xp"], 25)

        locked_lesson = self.client.post(
            "/learning/path/lessons/fake-websites/complete",
            headers=self.auth_headers,
        )
        self.assertEqual(locked_lesson.status_code, 409)

        for attack_type in ("phishing", "smishing"):
            for _ in range(2):
                generated = self.client.post(
                    "/scenario/generate",
                    json={"attack_type": attack_type, "difficulty": "easy"},
                    headers=self.auth_headers,
                )
                self.assertEqual(generated.status_code, 200)
                generated_payload = generated.json()
                context = persistence_repository.fetch_scenario_context(
                    generated_payload["scenario_id"]
                )
                self.assertIsNotNone(context)
                evaluated = self.client.post(
                    "/scenario/evaluate",
                    json={
                        "scenario_id": generated_payload["scenario_id"],
                        "selected_option_id": context["correct_option_id"],
                    },
                    headers=self.auth_headers,
                )
                self.assertEqual(evaluated.status_code, 200)
                self.assertTrue(evaluated.json()["is_correct"])

        path = self.client.get("/learning/path", headers=self.auth_headers)
        self.assertEqual(path.status_code, 200)
        payload = path.json()
        self.assertEqual(payload["xp"], 105)
        self.assertEqual(payload["level"], 2)
        self.assertEqual(payload["modules"][0]["status"], "completed")
        self.assertEqual(payload["modules"][1]["status"], "available")
        self.assertEqual(payload["completed_modules"], 1)
        self.assertTrue(payload["badges"][0]["unlocked"])
        self.assertTrue(
            next(badge for badge in payload["badges"] if badge["id"] == "pathfinder")[
                "unlocked"
            ]
        )

    def test_learning_path_requires_authentication_and_rejects_unknown_lesson(self) -> None:
        unauthorized = self.client.get("/learning/path")
        self.assertEqual(unauthorized.status_code, 401)

        unknown = self.client.post(
            "/learning/path/lessons/not-a-real-lesson/complete",
            headers=self.auth_headers,
        )
        self.assertEqual(unknown.status_code, 404)

    def test_learning_path_progress_is_isolated_between_users(self) -> None:
        first_user_id = self.auth_user_id
        completed = self.client.post(
            "/learning/path/lessons/phishing-101/complete",
            headers=self.auth_headers,
        )
        self.assertEqual(completed.status_code, 200)
        self.assertEqual(completed.json()["path"]["user_id"], first_user_id)
        self.assertEqual(completed.json()["path"]["xp"], 25)

        other_headers = self._register_and_auth_headers("path-isolation@example.com")
        other_user_id = self.auth_user_id
        other_path = self.client.get("/learning/path", headers=other_headers)
        self.assertEqual(other_path.status_code, 200)
        self.assertEqual(other_path.json()["user_id"], other_user_id)
        self.assertEqual(other_path.json()["xp"], 0)
        self.assertEqual(other_path.json()["modules"][0]["steps"][0]["status"], "available")

        original_path = self.client.get("/learning/path", headers=self.auth_headers)
        self.assertEqual(original_path.status_code, 200)
        self.assertEqual(original_path.json()["user_id"], first_user_id)
        self.assertEqual(original_path.json()["xp"], 25)
        self.assertEqual(original_path.json()["modules"][0]["steps"][0]["status"], "completed")

    def test_request_validation_rejects_invalid_identifiers(self) -> None:
        response = self.client.post(
            "/scenario/evaluate",
            json={
                "scenario_id": "invalid id with spaces",
                "selected_option_id": "click",
            },
            headers=self.auth_headers,
        )
        self.assertEqual(response.status_code, 422)

        response = self.client.get("/session/invalid id with spaces", headers=self.auth_headers)
        self.assertEqual(response.status_code, 422)

    def test_auth_endpoints_and_protected_routes(self) -> None:
        login = self.client.post(
            "/auth/login",
            json={
                "email": "tester@example.com",
                "password": "strong-pass-123",
            },
        )
        self.assertEqual(login.status_code, 200)
        access_token = login.json()["access_token"]
        refresh_token = login.json()["refresh_token"]

        me = self.client.get("/auth/me", headers={"Authorization": f"Bearer {access_token}"})
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["email"], "tester@example.com")

        refresh = self.client.post(
            "/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        self.assertEqual(refresh.status_code, 200)
        refreshed_token = refresh.json()["access_token"]
        self.assertTrue(refresh.json()["refresh_token"])
        self.assertNotEqual(refresh.json()["refresh_token"], refresh_token)

        refreshed_me = self.client.get("/auth/me", headers={"Authorization": f"Bearer {refreshed_token}"})
        self.assertEqual(refreshed_me.status_code, 200)
        self.assertEqual(refreshed_me.json()["email"], "tester@example.com")

        invalid_refresh = self.client.post(
            "/auth/refresh",
            json={"refresh_token": access_token},
        )
        self.assertEqual(invalid_refresh.status_code, 401)

        unauthorized = self.client.get("/scenario/catalog")
        self.assertEqual(unauthorized.status_code, 401)

    def test_auth_error_responses_include_cors_headers(self) -> None:
        response = self.client.get(
            "/auth/me",
            headers={"Origin": "http://localhost:8081"},
        )
        self.assertEqual(response.status_code, 401)
        self.assertIn("access-control-allow-origin", response.headers)
        self.assertIn(response.headers["access-control-allow-origin"], {"*", "http://localhost:8081"})

    def test_firebase_user_mapping_error_includes_cors_headers(self) -> None:
        class StubFirebaseIdentity:
            uid = "firebase-conflict"
            email = "conflict@example.com"
            display_name = "Conflict"

        original_verify = main.verify_firebase_id_token
        original_create_or_update = main.create_or_update_firebase_user
        main.verify_firebase_id_token = lambda _: StubFirebaseIdentity()
        main.create_or_update_firebase_user = lambda **_: (_ for _ in ()).throw(ValueError("conflict"))
        self.addCleanup(setattr, main, "verify_firebase_id_token", original_verify)
        self.addCleanup(setattr, main, "create_or_update_firebase_user", original_create_or_update)

        response = self.client.get(
            "/auth/me",
            headers={
                "Origin": "http://localhost:8081",
                "Authorization": "Bearer firebase-token",
            },
        )
        self.assertEqual(response.status_code, 409)
        self.assertIn("access-control-allow-origin", response.headers)
        self.assertEqual(response.json()["detail"], "conflict")

    def test_session_ownership_blocks_cross_user_access(self) -> None:
        first = self.client.post(
            "/scenario/generate",
            json={"attack_type": "phishing", "difficulty": "easy"},
            headers=self.auth_headers,
        )
        self.assertEqual(first.status_code, 200)
        session_id = first.json()["session_id"]

        other_headers = self._register_and_auth_headers("other@example.com")
        forbidden = self.client.get(f"/session/{session_id}", headers=other_headers)
        self.assertEqual(forbidden.status_code, 404)

    def test_session_history_is_paginated_owner_scoped_and_includes_pending_scenario(self) -> None:
        pending = self.client.post(
            "/scenario/generate",
            json={"attack_type": "phishing", "difficulty": "easy"},
            headers=self.auth_headers,
        )
        self.assertEqual(pending.status_code, 200)
        pending_payload = pending.json()

        completed = self.client.post(
            "/scenario/generate",
            json={"attack_type": "smishing", "difficulty": "hard"},
            headers=self.auth_headers,
        )
        self.assertEqual(completed.status_code, 200)
        completed_payload = completed.json()
        evaluated = self.client.post(
            "/scenario/evaluate",
            json={
                "scenario_id": completed_payload["scenario_id"],
                "selected_option_id": completed_payload["options"][0]["id"],
            },
            headers=self.auth_headers,
        )
        self.assertEqual(evaluated.status_code, 200)

        other_headers = self._register_and_auth_headers("history-other@example.com")
        other = self.client.post(
            "/scenario/generate",
            json={"attack_type": "impersonation", "difficulty": "medium"},
            headers=other_headers,
        )
        self.assertEqual(other.status_code, 200)

        first_page = self.client.get(
            "/sessions?limit=1&offset=0",
            headers=self.auth_headers,
        )
        self.assertEqual(first_page.status_code, 200)
        first_payload = first_page.json()
        self.assertEqual(first_payload["total"], 2)
        self.assertEqual(first_payload["limit"], 1)
        self.assertEqual(first_payload["offset"], 0)
        self.assertEqual(len(first_payload["items"]), 1)
        self.assertEqual(first_payload["items"][0]["session_id"], completed_payload["session_id"])

        second_page = self.client.get(
            "/sessions?limit=1&offset=1",
            headers=self.auth_headers,
        )
        self.assertEqual(second_page.status_code, 200)
        history_items = first_payload["items"] + second_page.json()["items"]
        history_by_id = {item["session_id"]: item for item in history_items}

        self.assertEqual(
            set(history_by_id),
            {pending_payload["session_id"], completed_payload["session_id"]},
        )
        pending_item = history_by_id[pending_payload["session_id"]]
        self.assertEqual(pending_item["pending_scenario_id"], pending_payload["scenario_id"])
        self.assertEqual(pending_item["latest_attack_type"], "phishing")
        self.assertEqual(pending_item["latest_difficulty"], "easy")
        self.assertEqual(pending_item["generated_scenarios"], 1)
        self.assertEqual(pending_item["evaluated_scenarios"], 0)

        completed_item = history_by_id[completed_payload["session_id"]]
        self.assertIsNone(completed_item["pending_scenario_id"])
        self.assertEqual(completed_item["latest_attack_type"], "smishing")
        self.assertEqual(completed_item["latest_difficulty"], "hard")
        self.assertEqual(completed_item["generated_scenarios"], 1)
        self.assertEqual(completed_item["evaluated_scenarios"], 1)
        self.assertEqual(completed_item["total_attempts"], 1)

    def test_session_history_requires_authentication(self) -> None:
        response = self.client.get("/sessions")
        self.assertEqual(response.status_code, 401)

    def test_session_history_returns_empty_page_for_new_user(self) -> None:
        empty_user_headers = self._register_and_auth_headers("history-empty@example.com")
        response = self.client.get("/sessions", headers=empty_user_headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"total": 0, "limit": 20, "offset": 0, "items": []},
        )

    def test_rate_limiting_blocks_excessive_requests(self) -> None:
        original_limits = main.rate_limiter.snapshot_limits()
        self.addCleanup(main.rate_limiter.configure_limits, original_limits)

        main.rate_limiter.configure_limits({"/health": (2, 60)})

        headers = {"x-forwarded-for": "198.51.100.25"}
        first = self.client.get("/health", headers=headers)
        second = self.client.get("/health", headers=headers)
        third = self.client.get("/health", headers=headers)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(third.status_code, 429)
        self.assertIn("Retry-After", third.headers)


if __name__ == "__main__":
    unittest.main()
