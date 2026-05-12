from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import db
import persistence_repository
from persistence_models import ScenarioAttemptORM


class PersistenceRepositoryTestCase(unittest.TestCase):
    def setUp(self) -> None:
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        test_db_path = Path(temp_dir.name) / "test_repo_training_data.db"
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

        db.init_db()

        def restore_state() -> None:
            db.DATABASE_URL = self.original_database_url
            db.engine = self.original_engine
            db.SessionLocal = self.original_session_local
            persistence_repository.SessionLocal = self.original_repository_session_local
            testing_engine.dispose()

        self.addCleanup(restore_state)

    def _seed_session(self, session_id: str) -> None:
        persistence_repository.upsert_session_progress(
            session_id=session_id,
            total_score=0,
            total_attempts=0,
            total_correct=0,
            correct_streak=0,
            incorrect_streak=0,
            per_attack_stats={
                "phishing": {"attempts": 0, "correct": 0},
                "smishing": {"attempts": 0, "correct": 0},
                "impersonation": {"attempts": 0, "correct": 0},
            },
        )

    def test_fetch_session_events_respects_order_pagination_and_filters(self) -> None:
        session_id = "repo-events-session"
        self._seed_session(session_id)
        base = datetime(2026, 5, 1, 10, 0, tzinfo=timezone.utc)

        for idx in range(5):
            persistence_repository.record_session_event(
                session_id=session_id,
                event_id=f"event-{idx}",
                timestamp_iso=(base + timedelta(minutes=idx)).isoformat(),
                event_type="answer_evaluated",
                title=f"Event {idx}",
                detail=f"Detail {idx}",
                tone="neutral",
            )

        paged = persistence_repository.fetch_session_events(session_id, limit=2, offset=1)
        self.assertIsNotNone(paged)
        assert paged is not None
        self.assertEqual(paged["total"], 5)
        self.assertEqual([event["id"] for event in paged["events"]], ["event-3", "event-2"])

        windowed = persistence_repository.fetch_session_events(
            session_id,
            limit=10,
            offset=0,
            since=base + timedelta(minutes=2),
            until=base + timedelta(minutes=3),
        )
        self.assertIsNotNone(windowed)
        assert windowed is not None
        self.assertEqual(windowed["total"], 2)
        self.assertEqual([event["id"] for event in windowed["events"]], ["event-3", "event-2"])

        empty_page = persistence_repository.fetch_session_events(session_id, limit=10, offset=99)
        self.assertIsNotNone(empty_page)
        assert empty_page is not None
        self.assertEqual(empty_page["total"], 5)
        self.assertEqual(empty_page["events"], [])

    def test_fetch_session_trends_filters_and_running_metrics(self) -> None:
        session_id = "repo-trends-session"
        self._seed_session(session_id)
        base = datetime(2026, 5, 2, 12, 0, tzinfo=timezone.utc)

        attempts = [
            ("scn-1", "phishing", "easy", True, 10, base + timedelta(minutes=1)),
            ("scn-2", "smishing", "medium", False, -5, base + timedelta(minutes=2)),
            ("scn-3", "phishing", "hard", True, 10, base + timedelta(minutes=3)),
            ("scn-4", "impersonation", "easy", False, 0, base + timedelta(minutes=4)),
        ]

        for scenario_id, attack_type, difficulty, is_correct, score_delta, _ in attempts:
            persistence_repository.record_scenario_evaluation(
                scenario_id=scenario_id,
                session_id=session_id,
                attack_type=attack_type,
                difficulty=difficulty,
                selected_option_id="click",
                is_correct=is_correct,
                score_delta=score_delta,
                explanation="test",
                recommendation_attack_type="phishing",
                recommendation_difficulty="easy",
            )

        with persistence_repository.session_scope() as test_session:
            rows = (
                test_session.query(ScenarioAttemptORM)
                .filter(ScenarioAttemptORM.session_id == session_id)
                .order_by(ScenarioAttemptORM.id.asc())
                .all()
            )
            for row, (_, _, _, _, _, evaluated_at) in zip(rows, attempts):
                row.evaluated_at = evaluated_at

        trends = persistence_repository.fetch_session_trends(session_id, limit=10, offset=0)
        self.assertIsNotNone(trends)
        assert trends is not None
        self.assertEqual(trends["total"], 4)
        self.assertEqual([point["score_after"] for point in trends["points"]], [10, 5, 15, 15])
        self.assertEqual([point["attempt_index"] for point in trends["points"]], [1, 2, 3, 4])

        phishing_only = persistence_repository.fetch_session_trends(
            session_id,
            limit=10,
            offset=0,
            attack_type="phishing",
        )
        self.assertIsNotNone(phishing_only)
        assert phishing_only is not None
        self.assertEqual(phishing_only["total"], 2)
        self.assertEqual([point["score_after"] for point in phishing_only["points"]], [10, 20])
        self.assertTrue(all(point["attack_type"] == "phishing" for point in phishing_only["points"]))

        between_two_and_three = persistence_repository.fetch_session_trends(
            session_id,
            limit=10,
            offset=0,
            since=base + timedelta(minutes=2),
            until=base + timedelta(minutes=3),
        )
        self.assertIsNotNone(between_two_and_three)
        assert between_two_and_three is not None
        self.assertEqual(between_two_and_three["total"], 2)
        self.assertEqual([point["score_after"] for point in between_two_and_three["points"]], [-5, 5])

        offset_out_of_range = persistence_repository.fetch_session_trends(session_id, limit=10, offset=99)
        self.assertIsNotNone(offset_out_of_range)
        assert offset_out_of_range is not None
        self.assertEqual(offset_out_of_range["total"], 4)
        self.assertEqual(offset_out_of_range["points"], [])

    def test_fetch_repository_queries_return_none_for_unknown_session(self) -> None:
        self.assertIsNone(persistence_repository.fetch_session_events("missing-session", limit=20, offset=0))
        self.assertIsNone(persistence_repository.fetch_session_trends("missing-session", limit=20, offset=0))


if __name__ == "__main__":
    unittest.main()
