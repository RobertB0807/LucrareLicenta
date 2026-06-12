from __future__ import annotations

import json
import logging
import unittest

from observability import JsonFormatter


class ObservabilityTestCase(unittest.TestCase):
    def test_json_formatter_emits_structured_context(self) -> None:
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg="request_completed",
            args=(),
            exc_info=None,
        )
        record.request_id = "request-123"
        record.status_code = 200
        record.duration_ms = 12

        payload = json.loads(JsonFormatter().format(record))

        self.assertEqual(payload["message"], "request_completed")
        self.assertEqual(payload["level"], "INFO")
        self.assertEqual(payload["request_id"], "request-123")
        self.assertEqual(payload["status_code"], 200)
        self.assertEqual(payload["duration_ms"], 12)
        self.assertIn("timestamp", payload)


if __name__ == "__main__":
    unittest.main()
