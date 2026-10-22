import hashlib
import hmac
import json
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import ConnectedAccount
from ..services import n8n

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


@router.get("/instagram")
@router.get("/meta")
def verify(mode: str = Query(alias="hub.mode", default=""),
           token: str = Query(alias="hub.verify_token", default=""),
           challenge: str = Query(alias="hub.challenge", default="")):
    if mode == "subscribe" and settings.META_VERIFY_TOKEN and hmac.compare_digest(token, settings.META_VERIFY_TOKEN):
        return Response(challenge, media_type="text/plain")
    raise HTTPException(403, "Verification failed")


def signature_ok(body: bytes, header: str) -> bool:
    return any(
        hmac.compare_digest(header, "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest())
        for secret in settings.webhook_secrets
    )


def _instagram_events(payload: dict) -> list[dict]:
    events: list[dict] = []
    for entry in payload.get("entry", []) or []:
        acc = str(entry.get("id", ""))
        base = {"platform": "instagram", "account_external_id": acc, "ig_account_id": acc}  # ig_account_id: legacy alias
        for ch in entry.get("changes", []) or []:
            if ch.get("field") != "comments":
                continue
            v = ch.get("value", {}) or {}
            frm = v.get("from", {}) or {}
            if str(frm.get("id", "")) == acc:  # our own public replies echo back
                continue
            events.append({**base, "type": "comment", "comment_id": v.get("id"), "text": v.get("text", ""),
                           "media_id": (v.get("media") or {}).get("id"), "from_id": frm.get("id"),
                           "from_username": frm.get("username"), "parent_id": v.get("parent_id"),
                           "timestamp": entry.get("time")})
        events.extend(_messaging_events(entry, base))
    return events


def _facebook_events(payload: dict) -> list[dict]:
    events: list[dict] = []
    for entry in payload.get("entry", []) or []:
        page = str(entry.get("id", ""))
        base = {"platform": "facebook", "account_external_id": page}
        for ch in entry.get("changes", []) or []:
            v = ch.get("value", {}) or {}
            if ch.get("field") != "feed" or v.get("item") != "comment" or v.get("verb") != "add":
                continue
            frm = v.get("from", {}) or {}
            if str(frm.get("id", "")) == page:  # the Page's own replies
                continue
            events.append({**base, "type": "comment", "comment_id": v.get("comment_id"), "text": v.get("message", ""),
                           "media_id": v.get("post_id"), "from_id": frm.get("id"), "from_username": frm.get("name"),
                           "parent_id": v.get("parent_id"), "timestamp": v.get("created_time") or entry.get("time")})
        events.extend(_messaging_events(entry, base))
    return events


def _messaging_events(entry: dict, base: dict) -> list[dict]:
    out: list[dict] = []
    for m in entry.get("messaging", []) or []:
        msg = m.get("message") or {}
        if msg.get("is_echo"):
            continue
        out.append({**base, "type": "postback" if m.get("postback") else "message",
                    "sender_id": (m.get("sender") or {}).get("id"),
                    "recipient_id": (m.get("recipient") or {}).get("id"),
                    "message": msg or None, "postback": m.get("postback"), "timestamp": m.get("timestamp")})
    return out


def normalize(payload: dict) -> list[dict]:
    obj = payload.get("object")
    if obj == "instagram":
        return _instagram_events(payload)
    if obj == "page":
        return _facebook_events(payload)
    return []


@router.post("/instagram")
@router.post("/meta")
async def receive(request: Request, bg: BackgroundTasks, db: Session = Depends(get_db)):
    # Read the raw bytes ONCE: the HMAC must be computed over exactly what Meta sent, and the
    # same bytes are parsed afterwards (never call request.json() after request.body()).
    body = await request.body()
    if not settings.webhook_secrets:
        raise HTTPException(503, "Webhook not configured")
    if not signature_ok(body, request.headers.get("X-Hub-Signature-256", "")):
        raise HTTPException(403, "Bad signature")
    try:
        payload = json.loads(body)
    except ValueError:
        raise HTTPException(400, "Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(400, "Invalid payload")

    events = normalize(payload)
    if events:  # keep only events for accounts that are connected and active
        active: set[tuple[str, str]] = set()
        for platform in {e["platform"] for e in events}:
            ids = {e["account_external_id"] for e in events if e["platform"] == platform}
            rows = db.scalars(select(ConnectedAccount.external_id).where(
                ConnectedAccount.platform == platform, ConnectedAccount.external_id.in_(ids),
                ConnectedAccount.is_active.is_(True))).all()
            active.update((platform, r) for r in rows)
        events = [e for e in events if (e["platform"], e["account_external_id"]) in active]
    if events:
        bg.add_task(n8n.forward, events)
    return {"received": len(events)}  # always 200 quickly so Meta does not retry-storm
