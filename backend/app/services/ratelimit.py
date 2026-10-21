"""Tiny Redis fixed-window rate limiter used as a FastAPI dependency (fails open if Redis is down)."""
import logging

from fastapi import HTTPException, Request

from .cache import client

log = logging.getLogger(__name__)


def rate_limit(bucket: str, limit: int, window_seconds: int):
    def dependency(request: Request) -> None:
        ip = request.client.host if request.client else "unknown"
        key = f"rl:{bucket}:{ip}"
        try:
            pipe = client.pipeline()
            pipe.incr(key)
            pipe.ttl(key)
            count, ttl = pipe.execute()
            if ttl is None or ttl < 0:  # first hit (or key lost its expiry)
                client.expire(key, window_seconds)
                ttl = window_seconds
        except Exception as e:
            log.debug("rate limiter unavailable: %s", e)
            return
        if count > limit:
            raise HTTPException(429, "Too many attempts. Please wait a few minutes and try again.",
                                headers={"Retry-After": str(max(int(ttl), 1))})

    return dependency
