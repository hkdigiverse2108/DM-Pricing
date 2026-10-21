import logging
import time

import httpx

from ..config import settings

log = logging.getLogger(__name__)


def forward(events: list[dict]) -> None:
    """POST normalized, already-verified events to the n8n webhook (with small retry)."""
    if not settings.N8N_WEBHOOK_URL or not events:
        return
    headers = {"X-Webhook-Secret": settings.N8N_API_KEY}
    for attempt in range(3):
        try:
            r = httpx.post(settings.N8N_WEBHOOK_URL, json={"events": events}, headers=headers, timeout=15)
            if r.status_code < 400:
                return
            log.warning("n8n returned %s", r.status_code)
        except httpx.HTTPError as e:
            log.warning("n8n forward failed: %s", e)
        time.sleep(2 ** attempt)
    log.error("giving up forwarding %d event(s) to n8n", len(events))
