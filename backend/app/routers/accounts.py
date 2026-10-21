import logging
from datetime import timedelta

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import require_user
from ..models import ConnectedAccount, User, utcnow
from ..schemas import AccountOut
from ..security import create_token, decode_token, decrypt, encrypt
from ..services import facebook as fb
from ..services import instagram as ig
from ..services import plans as plan_svc
from ..services import tokens as token_svc

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["instagram"])


@router.get("/instagram/connect-url")
def connect_url(user: User = Depends(require_user)):
    if not settings.META_APP_ID or not settings.META_REDIRECT_URI:
        raise HTTPException(503, "Instagram app is not configured")
    state = create_token(user.id, "user", "ig_state", timedelta(minutes=10))
    return {"url": ig.build_auth_url(state)}


@router.get("/instagram/callback")
def callback(code: str | None = None, state: str | None = None, error: str | None = None,
             db: Session = Depends(get_db)):
    base = f"{settings.FRONTEND_URL.rstrip('/')}/app/accounts"
    if error or not code or not state:
        return RedirectResponse(f"{base}?error=denied")
    try:
        payload = decode_token(state, "ig_state")
    except jwt.PyJWTError:
        return RedirectResponse(f"{base}?error=state")
    user = db.get(User, payload["sub"])
    if not user or not user.is_active or user.role != "user":
        return RedirectResponse(f"{base}?error=state")

    try:
        short, _ = ig.exchange_code(code.removesuffix("#_"))
        token, expires_in = ig.long_lived(short)
        prof = ig.profile(token)
    except ig.IGError as e:
        log.warning("instagram oauth failed: %s", e)
        return RedirectResponse(f"{base}?error=oauth")

    ig_id = str(prof.get("user_id") or prof.get("id") or "")
    if not ig_id:
        return RedirectResponse(f"{base}?error=oauth")

    acc = db.scalar(select(ConnectedAccount).where(
        ConnectedAccount.platform == "instagram", ConnectedAccount.external_id == ig_id))
    if acc and acc.user_id != user.id:
        return RedirectResponse(f"{base}?error=taken")
    if not acc or not acc.is_active:
        plan = plan_svc.get_plan_for_user(db, user)
        if plan and not plan_svc.within(plan_svc.count_active_accounts(db, user.id), plan.max_instagram_accounts):
            return RedirectResponse(f"{base}?error=limit")
    if not acc:
        acc = ConnectedAccount(user_id=user.id, platform="instagram", external_id=ig_id, username=prof.get("username", ""))
        db.add(acc)

    now = utcnow()
    acc.username = prof.get("username", acc.username)
    acc.access_token_encrypted = encrypt(token)
    acc.token_updated_at = now
    acc.token_expires_at = now + timedelta(seconds=expires_in)
    acc.is_active = True
    db.commit()

    try:
        ig.subscribe(token)
    except ig.IGError as e:
        log.warning("webhook subscribe failed for %s: %s", ig_id, e)
    return RedirectResponse(f"{base}?connected=1")


@router.get("/accounts", response_model=list[AccountOut])
def list_accounts(user: User = Depends(require_user), db: Session = Depends(get_db)):
    return db.scalars(select(ConnectedAccount).where(ConnectedAccount.user_id == user.id)
                      .order_by(ConnectedAccount.created_at)).all()


def _own(db: Session, user: User, account_id: str) -> ConnectedAccount:
    acc = db.get(ConnectedAccount, account_id)
    if not acc or acc.user_id != user.id:
        raise HTTPException(404, "Account not found")
    return acc


@router.delete("/accounts/{account_id}", response_model=AccountOut)
def disconnect(account_id: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    """Soft-disconnect: wipes the token, keeps keywords so reconnecting restores them."""
    acc = _own(db, user, account_id)
    if acc.platform == "facebook" and acc.access_token_encrypted:
        try:  # best effort: stop Meta from sending this Page's webhooks to us
            fb.unsubscribe_page(acc.external_id, decrypt(acc.access_token_encrypted))
        except Exception as e:
            log.warning("page unsubscribe failed for %s: %s", acc.external_id, e)
    acc.is_active = False
    acc.access_token_encrypted = ""
    acc.token_expires_at = None
    db.commit()
    return acc


@router.post("/accounts/{account_id}/refresh-token", response_model=AccountOut)
def refresh_now(account_id: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    acc = _own(db, user, account_id)
    if acc.platform != "instagram":
        raise HTTPException(409, "Facebook Page tokens do not expire, so there is nothing to refresh")
    if not acc.access_token_encrypted:
        raise HTTPException(409, "Account is disconnected; reconnect it")
    try:
        token_svc.refresh_account(db, acc)
    except ig.IGError as e:
        raise HTTPException(502, f"Instagram refused the refresh: {e}")
    return acc
