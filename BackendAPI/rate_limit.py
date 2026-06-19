from __future__ import annotations

from collections import defaultdict, deque
from math import ceil
from threading import Lock
from time import monotonic

from redis.asyncio import Redis
from redis.exceptions import RedisError

from observability import (
    RATE_LIMIT_BACKEND_ERRORS_TOTAL,
    RATE_LIMIT_REJECTIONS_TOTAL,
)

REDIS_RATE_LIMIT_SCRIPT = """
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return {current, ttl}
"""


class RateLimiterUnavailableError(RuntimeError):
    pass


class DistributedRateLimiter:
    def __init__(
        self,
        *,
        limits: dict[str, tuple[int, int]],
        redis_url: str | None,
        fail_open: bool,
        key_prefix: str = "cyber-training:rate-limit",
    ) -> None:
        self._limits = limits.copy()
        self._redis_url = redis_url
        self._fail_open = fail_open
        self._key_prefix = key_prefix
        self._redis: Redis | None = (
            Redis.from_url(redis_url, decode_responses=True)
            if redis_url
            else None
        )
        self._local_hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    @property
    def backend_name(self) -> str:
        return "redis" if self._redis is not None else "memory"

    def reset(self) -> None:
        with self._lock:
            self._local_hits.clear()

    def configure_limits(self, limits: dict[str, tuple[int, int]]) -> None:
        with self._lock:
            self._limits = limits.copy()
            self._local_hits.clear()

    def snapshot_limits(self) -> dict[str, tuple[int, int]]:
        with self._lock:
            return self._limits.copy()

    def _local_retry_after(
        self,
        *,
        path: str,
        client_key: str,
        max_requests: int,
        window_seconds: int,
    ) -> int | None:
        now = monotonic()
        window_start = now - window_seconds
        key = f"{path}:{client_key}"

        with self._lock:
            hits = self._local_hits[key]
            while hits and hits[0] <= window_start:
                hits.popleft()
            if len(hits) >= max_requests:
                return max(1, ceil(window_seconds - (now - hits[0])))
            hits.append(now)
            return None

    async def retry_after_seconds(
        self,
        *,
        path: str,
        client_key: str,
    ) -> int | None:
        limit_cfg = self._limits.get(path)
        if limit_cfg is None:
            return None

        max_requests, window_seconds = limit_cfg
        if self._redis is None:
            retry_after = self._local_retry_after(
                path=path,
                client_key=client_key,
                max_requests=max_requests,
                window_seconds=window_seconds,
            )
            if retry_after is not None:
                RATE_LIMIT_REJECTIONS_TOTAL.labels(
                    path=path,
                    backend="memory",
                ).inc()
            return retry_after

        redis_key = f"{self._key_prefix}:{path}:{client_key}"
        try:
            result = await self._redis.eval(
                REDIS_RATE_LIMIT_SCRIPT,
                1,
                redis_key,
                window_seconds,
            )
            current = int(result[0])
            ttl = max(1, int(result[1]))
        except (RedisError, OSError, ValueError, TypeError) as exc:
            RATE_LIMIT_BACKEND_ERRORS_TOTAL.labels(backend="redis").inc()
            if not self._fail_open:
                raise RateLimiterUnavailableError(
                    "Redis rate-limit backend is unavailable"
                ) from exc
            return self._local_retry_after(
                path=path,
                client_key=client_key,
                max_requests=max_requests,
                window_seconds=window_seconds,
            )

        if current > max_requests:
            RATE_LIMIT_REJECTIONS_TOTAL.labels(
                path=path,
                backend="redis",
            ).inc()
            return ttl
        return None

    async def check_connection(self) -> None:
        if self._redis is not None:
            await self._redis.ping()

    async def close(self) -> None:
        if self._redis is not None:
            await self._redis.aclose()
