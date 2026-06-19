from __future__ import annotations

import unittest

from redis.exceptions import ConnectionError

from rate_limit import DistributedRateLimiter, RateLimiterUnavailableError


class FakeRedis:
    def __init__(self, *, results: list[list[int]] | None = None, error: Exception | None = None) -> None:
        self.results = results or []
        self.error = error
        self.closed = False

    async def eval(self, *_args):
        if self.error:
            raise self.error
        return self.results.pop(0)

    async def ping(self) -> bool:
        if self.error:
            raise self.error
        return True

    async def aclose(self) -> None:
        self.closed = True


class RateLimitTestCase(unittest.IsolatedAsyncioTestCase):
    async def test_memory_backend_blocks_after_limit(self) -> None:
        limiter = DistributedRateLimiter(
            limits={"/test": (2, 60)},
            redis_url=None,
            fail_open=True,
        )

        self.assertIsNone(
            await limiter.retry_after_seconds(path="/test", client_key="client")
        )
        self.assertIsNone(
            await limiter.retry_after_seconds(path="/test", client_key="client")
        )
        self.assertGreaterEqual(
            await limiter.retry_after_seconds(path="/test", client_key="client"),
            1,
        )

    async def test_redis_backend_uses_shared_counter_result(self) -> None:
        limiter = DistributedRateLimiter(
            limits={"/test": (2, 60)},
            redis_url="redis://example.invalid:6379/0",
            fail_open=False,
        )
        fake_redis = FakeRedis(results=[[1, 60], [3, 42]])
        limiter._redis = fake_redis  # type: ignore[assignment]

        self.assertIsNone(
            await limiter.retry_after_seconds(path="/test", client_key="client")
        )
        self.assertEqual(
            await limiter.retry_after_seconds(path="/test", client_key="client"),
            42,
        )

        await limiter.close()
        self.assertTrue(fake_redis.closed)

    async def test_redis_failure_is_fail_closed_when_configured(self) -> None:
        limiter = DistributedRateLimiter(
            limits={"/test": (2, 60)},
            redis_url="redis://example.invalid:6379/0",
            fail_open=False,
        )
        limiter._redis = FakeRedis(error=ConnectionError("offline"))  # type: ignore[assignment]

        with self.assertRaises(RateLimiterUnavailableError):
            await limiter.retry_after_seconds(path="/test", client_key="client")

    async def test_redis_failure_falls_back_to_memory_in_development(self) -> None:
        limiter = DistributedRateLimiter(
            limits={"/test": (1, 60)},
            redis_url="redis://example.invalid:6379/0",
            fail_open=True,
        )
        limiter._redis = FakeRedis(error=ConnectionError("offline"))  # type: ignore[assignment]

        self.assertIsNone(
            await limiter.retry_after_seconds(path="/test", client_key="client")
        )
        self.assertGreaterEqual(
            await limiter.retry_after_seconds(path="/test", client_key="client"),
            1,
        )


if __name__ == "__main__":
    unittest.main()
