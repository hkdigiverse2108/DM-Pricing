import json
import logging
import secrets
from datetime import timedelta
from urllib.parse import urlencode

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import require_user
from ..models import ConnectedAccount, User, utcnow
from ..schemas import AccountOut, FBConnectIn
from ..security import create_token, decode_token, decrypt, encrypt
from ..services import cache
from ..services import facebook as fb
from ..services import plans as plan_svc

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/facebook", tags=["facebook"])
SELECTION_TTL = 600  # seconds a page-picker session stays valid


def _sel_key(user_id: str, selection: str) -> str:
    return f"fbsel:{user_id}:{selection}"


def connect_page(db: Session, user: User, page_id: str, name: str, token: str) -> tuple[ConnectedAccount | None, str | None]:
    """Store (or refresh) a Page connection. Returns (account, None) or (None, error_code)."""
    acc = db.scalar(select(ConnectedAccount).where(
        ConnectedAccount.platform == "facebook", ConnectedAccount.external_id == page_id))
    if acc and acc.user_id != user.id:
        return None, "taken"
    if not acc or not acc.is_active:
        plan = plan_svc.get_plan_for_user(db, user)
        if plan and not plan_svc.within(plan_svc.count_active_accounts(db, user.id), plan.max_instagram_accounts):
            return None, "limit"
    if not acc:
        acc = ConnectedAccount(user_id=user.id, platform="facebook", external_id=page_id, username=name)
        db.add(acc)
    acc.username = name or acc.username
    acc.access_token_encrypted = encrypt(token)
    acc.token_updated_at = utcnow()
    acc.token_expires_at = None  # Page tokens from a long-lived user token do not expire
    acc.is_active = True
    db.commit()
    try:
        fb.subscribe_page(page_id, token)
    except fb.FBError as e:
        log.warning("page webhook subscribe failed for %s: %s", page_id, e)
    return acc, None


@router.get("/connect-url")
def connect_url(user: User = Depends(require_user)):
    if not settings.fb_app_id or not settings.META_FB_REDIRECT_URI:
        raise HTTPException(503, "Facebook app is not configured")
    state = create_token(user.id, "user", "fb_state", timedelta(minutes=10))
    return {"url": fb.build_auth_url(state)}


@router.get("/callback")
def callback(code: str | None = None, state: str | None = None, error: str | None = None,
             db: Session = Depends(get_db)):
    base = f"{settings.FRONTEND_URL.rstrip('/')}/app/accounts"

    def go(**q: str) -> RedirectResponse:
        if "detail" in q and settings.PRODUCTION:
            q.pop("detail")
        return RedirectResponse(f"{base}?{urlencode({'platform': 'facebook', **q})}")

    if error or not code or not state:
        return go(error="denied")
    try:
        payload = decode_token(state, "fb_state")
    except jwt.PyJWTError:
        return go(error="state")
    user = db.get(User, payload["sub"])
    if not user or not user.is_active or user.role != "user":
        return go(error="state")

    try:
        user_token = fb.long_lived_user_token(fb.exchange_code(code))
        pages = [p for p in fb.list_pages(user_token) if p.get("id") and p.get("access_token")]
    except fb.FBError as e:
        log.warning("facebook oauth failed: %s", e)
        return go(error="oauth", detail=str(e)[:200])
    if not pages:
        return go(error="nopages")

    if len(pages) == 1:  # nothing to choose from
        _, err = connect_page(db, user, str(pages[0]["id"]), pages[0].get("name", ""), pages[0]["access_token"])
        return go(error=err) if err else go(connected="1")

    selection = secrets.token_urlsafe(16)
    blob = encrypt(json.dumps([{"id": str(p["id"]), "name": p.get("name", ""), "token": p["access_token"]} for p in pages]))
    if not cache.set_json(_sel_key(user.id, selection), blob, ttl=SELECTION_TTL):
        return go(error="storage")
    return go(fb_select=selection)


def _load_selection(user: User, selection: str) -> list[dict]:
    blob = cache.get_json(_sel_key(user.id, selection))
    if not blob:
        raise HTTPException(404, "This Page selection expired. Click Connect Facebook Page again.")
    return json.loads(decrypt(blob))


@router.get("/pages")
def pages(selection: str, user: User = Depends(require_user)):
    """Pages offered after OAuth (names/ids only, never tokens)."""
    return [{"id": p["id"], "name": p["name"]} for p in _load_selection(user, selection)]


@router.post("/connect", response_model=AccountOut)
def connect(body: FBConnectIn, user: User = Depends(require_user), db: Session = Depends(get_db)):
    page = next((p for p in _load_selection(user, body.selection) if p["id"] == body.page_id), None)
    if not page:
        raise HTTPException(404, "Page not found in this selection")
    acc, err = connect_page(db, user, page["id"], page["name"], page["token"])
    if err == "taken":
        raise HTTPException(409, "That Page is already connected to another user.")
    if err == "limit":
        raise HTTPException(402, "Your plan's account limit is reached. Upgrade to connect more.")
    cache.delete(_sel_key(user.id, body.selection))
    return acc
