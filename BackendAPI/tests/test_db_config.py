from __future__ import annotations

import unittest

import db


class DbConfigTestCase(unittest.TestCase):
    def test_normalize_database_url_maps_postgres_schemes_to_psycopg(self) -> None:
        self.assertEqual(
            db.normalize_database_url("postgres://user:pass@localhost:5432/app"),
            "postgresql+psycopg://user:pass@localhost:5432/app",
        )
        self.assertEqual(
            db.normalize_database_url("postgresql://user:pass@localhost:5432/app"),
            "postgresql+psycopg://user:pass@localhost:5432/app",
        )

    def test_normalize_database_url_keeps_sqlite_unchanged(self) -> None:
        sqlite_url = "sqlite:///tmp/test.db"
        self.assertEqual(db.normalize_database_url(sqlite_url), sqlite_url)


if __name__ == "__main__":
    unittest.main()
