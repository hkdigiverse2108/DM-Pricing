from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_user
from ..models import ConnectedAccount, Keyword, User
from ..schemas import KeywordCreate, KeywordOut, KeywordUpdate, ResolveMediaIn
from ..services import media as media_svc
from ..services import plans as plan_svc

router = APIRouter(prefix="/api/keywords", tags=["keywords"])


def _own_account(db: Session, user: User, account_id: str) -> ConnectedAccount:
    acc = db.get(ConnectedAccount, account_id)
    if not acc or acc.user_id != user.id:
        raise HTTPException(404, "Account not found")
    return acc


def _own_keyword(db: Session, user: User, kid: str) -> Keyword:
    kw = db.get(Keyword, kid)
    if not kw or kw.account.user_id != user.id:
        raise HTTPException(404, "Keyword not found")
    return kw


def _check_follow_gate(require_follow: bool, message: str | None, button: str | None):
    if require_follow and not (message and button):
        raise HTTPException(422, "Follow gate message and button text are required when require_follow is on")


def _resolve(acc: ConnectedAccount, url: str) -> dict:
    try:
        return media_svc.resolve(acc, url)
    except media_svc.MediaError as e:
        raise HTTPException(409 if e.code == "disconnected" else 422, str(e))


@router.post("/resolve-media")
def resolve_media(body: ResolveMediaIn, user: User = Depends(require_user), db: Session = Depends(get_db)):
    """Preview what a pasted post link points to (used by the 'Check link' button)."""
    acc = _own_account(db, user, body.connected_account_id)
    ref = _resolve(acc, body.url)
    return {k: ref.get(k) for k in ("media_id", "permalink", "media_type", "caption", "thumbnail_url")}


@router.get("", response_model=list[KeywordOut])
def list_keywords(account_id: str | None = None, user: User = Depends(require_user), db: Session = Depends(get_db)):
    q = select(Keyword).join(ConnectedAccount).where(ConnectedAccount.user_id == user.id)
    if account_id:
        q = q.where(Keyword.connected_account_id == account_id)
    return db.scalars(q.order_by(Keyword.created_at.desc())).all()


@router.post("", response_model=KeywordOut, status_code=201)
def create_keyword(body: KeywordCreate, user: User = Depends(require_user), db: Session = Depends(get_db)):
    _own_account(db, user, body.connected_account_id)
    plan = plan_svc.get_plan_for_user(db, user)
    if plan and not plan_svc.within(plan_svc.count_keywords(db, user.id), plan.max_keywords):
        raise HTTPException(402, "Keyword limit reached for your plan")
    _check_follow_gate(body.require_follow, body.follow_gate_message, body.follow_gate_button_text)
    data = body.model_dump()
    link = (data.get("media_url") or "").strip()
    if link:  # a pasted post link wins: resolve it to the media id Meta sends in webhooks
        acc = _own_account(db, user, body.connected_account_id)
        ref = _resolve(acc, link)
        data["media_id"], data["media_url"] = ref["media_id"], ref["normalized_url"]
    else:
        data["media_url"] = None
        data["media_id"] = (data.get("media_id") or "").strip() or None
    kw = Keyword(**data)
    db.add(kw)
    db.commit()
    return kw


@router.get("/{kid}", response_model=KeywordOut)
def get_keyword(kid: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    return _own_keyword(db, user, kid)


@router.patch("/{kid}", response_model=KeywordOut)
def update_keyword(kid: str, body: KeywordUpdate, user: User = Depends(require_user), db: Session = Depends(get_db)):
    kw = _own_keyword(db, user, kid)
    fields = body.model_dump(exclude_unset=True)
    if "media_url" in fields or "media_id" in fields:
        link = (fields.get("media_url") or "").strip()
        if link:
            if kw.media_url and kw.media_id and link == kw.media_url:
                pass  # unchanged link: keep the already resolved id (no Meta call, works even if token expired)
            else:
                ref = _resolve(kw.account, link)
                fields["media_id"], link = ref["media_id"], ref["normalized_url"]
            fields["media_url"] = link
        else:
            fields["media_url"] = None
            fields["media_id"] = (fields.get("media_id") or "").strip() or None
        if link and link == kw.media_url:
            fields.pop("media_id", None)
    for k, v in fields.items():
        setattr(kw, k, v)
    _check_follow_gate(kw.require_follow, kw.follow_gate_message, kw.follow_gate_button_text)
    db.commit()
    return kw


@router.delete("/{kid}", status_code=204)
def delete_keyword(kid: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    db.delete(_own_keyword(db, user, kid))
    db.commit()
