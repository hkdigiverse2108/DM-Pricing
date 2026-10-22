import json
import logging

import redis

from ..config import settings

log = logging.getLogger(__name__)
client = redis.Redis.from_url(settings.REDIS_URL, socket_connect_timeout=1, socket_timeout=1, decode_responses=True)
_r = client


def get_json(key: str):
    try:
        v = _r.get(key)
        return json.loads(v) if v else None
    except Exception as e:  # cache is best-effort
        log.debug("cache get failed: %s", e)
        return None


def set_json(key: str, value, ttl: int = 60) -> bool:
    try:
        _r.setex(key, ttl, json.dumps(value))
        return True
    except Exception as e:
        log.debug("cache set failed: %s", e)
        return False


def delete(*keys: str) -> None:
    try:
        _r.delete(*keys)
    except Exception as e:
        log.debug("cache delete failed: %s", e)
