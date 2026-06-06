from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import db
import main
import persistence_repository
from persistence_models import UserLearningProfileORM
import training_service


class ApiEndpointsTestCase(unittest.TestCase):
    def setUp(self) -> None:
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

        me = self.client.get("/auth/me", headers={"Authorization": f"Bearer {access_token}"})
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["email"], "tester@example.com")

        refresh = self.client.post("/auth/refresh", headers={"Authorization": f"Bearer {access_token}"})
        self.assertEqual(refresh.status_code, 200)
        refreshed_token = refresh.json()["access_token"]

        refreshed_me = self.client.get("/auth/me", headers={"Authorization": f"Bearer {refreshed_token}"})
        self.assertEqual(refreshed_me.status_code, 200)
        self.assertEqual(refreshed_me.json()["email"], "tester@example.com")

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
