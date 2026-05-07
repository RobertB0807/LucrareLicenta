from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import db
import main
import persistence_repository
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

        training_service.session_progress.clear()
        training_service.scenario_contexts.clear()

        db.init_db()

        def restore_state() -> None:
            training_service.session_progress.clear()
            training_service.scenario_contexts.clear()
            db.DATABASE_URL = self.original_database_url
            db.engine = self.original_engine
            db.SessionLocal = self.original_session_local
            persistence_repository.SessionLocal = self.original_repository_session_local
            testing_engine.dispose()

        self.addCleanup(restore_state)

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

    def test_unknown_session_endpoints_return_404(self) -> None:
        with self.assertRaises(HTTPException) as snapshot_exc:
            main.get_session_snapshot("does-not-exist")
        self.assertEqual(snapshot_exc.exception.status_code, 404)
        self.assertEqual(snapshot_exc.exception.detail, "Session not found")

        with self.assertRaises(HTTPException) as events_exc:
            main.get_session_events(session_id="does-not-exist", limit=20, offset=0)
        self.assertEqual(events_exc.exception.status_code, 404)
        self.assertEqual(events_exc.exception.detail, "Session not found")

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


if __name__ == "__main__":
    unittest.main()
