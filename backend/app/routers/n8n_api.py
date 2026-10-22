import json
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_n8n
from ..models import ConnectedAccount, DMUsage, Keyword, KeywordEvent, PendingDM, utcnow
from ..schemas import DMSentIn, EventIn, KeywordOut, PendingDMIn, PendingDMOut
from ..security import decrypt
from ..services import instagram as ig
from ..services import plans as plan_svc
from ..services import tokens as token_svc

router = APIRouter(prefix="/api/n8n", tags=["n8n"], dependencies=[Depends(require_n8n)])
META_MAX = 4000


def _acc(db: Session, external_id: str, platform: str = "instagram") -> ConnectedAccount:
    acc = db.scalar(select(ConnectedAccount).where(
        ConnectedAccount.platform == platform, ConnectedAccount.external_id == external_id))
    if not acc:
        raise HTTPException(404, "Unknown account")
    return acc


def _own_keyword_id(db: Session, acc: ConnectedAccount, keyword_id: str | None) -> str | None:
    if not keyword_id:
        return None
    kw = db.get(Keyword, keyword_id)
    if not kw or kw.connected_account_id != acc.id:
        raise HTTPException(422, "keyword_id does not belong to this account")
    return kw.id


def _log_event(db: Session, acc: ConnectedAccount, event_type: str, keyword_id: str | None, *,
               external_user_id=None, comment_id=None, media_id=None, meta=None) -> KeywordEvent:
    if meta is not None and not isinstance(meta, str):
        meta = json.dumps(meta, default=str)
    ev = KeywordEvent(connected_account_id=acc.id, keyword_id=keyword_id, event_type=event_type,
                      external_user_id=external_user_id, comment_id=comment_id, media_id=media_id,
                      meta=meta[:META_MAX] if meta else None)
    db.add(ev)
    return ev


@router.get("/accounts/{external_id}")
def account(external_id: str, platform: str = "instagram", db: Session = Depends(get_db)):
    acc = _acc(db, external_id, platform)
    plan = plan_svc.get_plan_for_user(db, acc.user)
    used = plan_svc.dm_used_for_user(db, acc.user_id)
    limit = plan.max_dm_per_month if plan else 0
    active = bool(acc.is_active and acc.user.is_active and acc.access_token_encrypted)
    return {
        "id": acc.id, "platform": acc.platform, "external_id": acc.external_id,
        "ig_account_id": acc.external_id if acc.platform == "instagram" else None,  # legacy field
        "username": acc.username,
        "access_token": decrypt(acc.access_token_encrypted) if active else None,
        "is_active": active, "token_expires_at": acc.token_expires_at,
        "dm_used": used, "dm_limit": limit, "dm_allowed": active and plan_svc.within(used, limit),
    }


@router.get("/accounts/{external_id}/keywords", response_model=list[KeywordOut])
def keywords(external_id: str, platform: str = "instagram", media_id: str | None = None, db: Session = Depends(get_db)):
    acc = _acc(db, external_id, platform)
    q = select(Keyword).where(Keyword.connected_account_id == acc.id, Keyword.is_active.is_(True))
    if media_id:  # keywords with no media_id apply to every post
        q = q.where((Keyword.media_id.is_(None)) | (Keyword.media_id == "") | (Keyword.media_id == media_id))
    return db.scalars(q).all()


@router.post("/accounts/{external_id}/refresh-token")
def refresh(external_id: str, platform: str = "instagram", db: Session = Depends(get_db)):
    acc = _acc(db, external_id, platform)
    if acc.platform != "instagram":
        return {"refreshable": False, "token_expires_at": None}  # Facebook Page tokens do not expire
    try:
        token_svc.refresh_account(db, acc)
    except ig.IGError as e:
        raise HTTPException(502, str(e))
    return {"refreshable": True, "token_expires_at": acc.token_expires_at}


@router.post("/pending-dms", response_model=PendingDMOut, status_code=201)
def create_pending(body: PendingDMIn, db: Session = Depends(get_db)):
    acc = _acc(db, body.account_external_id or "", body.platform)
    # keep only the latest pending DM per (account, user)
    db.execute(delete(PendingDM).where(PendingDM.connected_account_id == acc.id, PendingDM.igsid == body.igsid))
    row = PendingDM(connected_account_id=acc.id, **body.model_dump(
        exclude={"platform", "account_external_id", "ig_account_id"}))
    db.add(row)
    db.commit()
    return row


@router.get("/pending-dms/{external_id}/{igsid}", response_model=PendingDMOut)
def get_pending(external_id: str, igsid: str, platform: str = "instagram", consume: bool = False,
                db: Session = Depends(get_db)):
    acc = _acc(db, external_id, platform)
    row = db.scalar(select(PendingDM).where(PendingDM.connected_account_id == acc.id, PendingDM.igsid == igsid)
                    .order_by(PendingDM.created_at.desc()))
    if not row or row.created_at + timedelta(minutes=row.ttl_minutes) < utcnow():
        raise HTTPException(404, "No pending DM")
    out = PendingDMOut.model_validate(row)
    if consume:
        db.delete(row)
        db.commit()
    return out


@router.delete("/pending-dms/{pending_id}", status_code=204)
def delete_pending(pending_id: str, db: Session = Depends(get_db)):
    row = db.get(PendingDM, pending_id)
    if row:
        db.delete(row)
        db.commit()


@router.post("/pending-dms/cleanup")
def cleanup(db: Session = Depends(get_db)):
    return {"deleted": token_svc.cleanup_pending(db)}


@router.post("/dm-sent")
def dm_sent(body: DMSentIn, db: Session = Depends(get_db)):
    acc = _acc(db, body.account_external_id or "", body.platform)
    kid = _own_keyword_id(db, acc, body.keyword_id)
    period = plan_svc.period_now()
    row = db.scalar(select(DMUsage).where(DMUsage.connected_account_id == acc.id, DMUsage.period == period))
    if not row:
        row = DMUsage(connected_account_id=acc.id, period=period, count=0)
        db.add(row)
    row.count += 1
    if kid:
        _log_event(db, acc, "dm_sent", kid, external_user_id=body.external_user_id,
                   comment_id=body.comment_id, media_id=body.media_id)
    db.commit()
    return {"period": period, "count": row.count}


@router.post("/events", status_code=201)
def log_event(body: EventIn, db: Session = Depends(get_db)):
    """n8n logs each step of the flow here (match, public_reply, dm_sent, follow_gate_*, error)."""
    acc = _acc(db, body.account_external_id or "", body.platform)
    kid = _own_keyword_id(db, acc, body.keyword_id)
    ev = _log_event(db, acc, body.event_type, kid, external_user_id=body.external_user_id,
                    comment_id=body.comment_id, media_id=body.media_id, meta=body.meta)
    db.commit()
    return {"id": ev.id}
