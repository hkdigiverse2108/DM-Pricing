from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_user
from ..models import ConnectedAccount, KeywordEvent, User, utcnow

router = APIRouter(prefix="/api/stats", tags=["stats"])
TYPES = ("match", "public_reply", "dm_sent", "follow_gate_shown", "follow_gate_passed", "error")


def _since(days: int):
    return utcnow() - timedelta(days=days)


def _base(user: User, days: int):
    return (KeywordEvent.connected_account_id.in_(select(ConnectedAccount.id).where(ConnectedAccount.user_id == user.id)),
            KeywordEvent.created_at >= _since(days))


@router.get("/overview")
def overview(days: int = Query(30, ge=1, le=90), user: User = Depends(require_user), db: Session = Depends(get_db)):
    where = _base(user, days)
    totals = {t: 0 for t in TYPES}
    for etype, n in db.execute(select(KeywordEvent.event_type, func.count()).where(*where).group_by(KeywordEvent.event_type)):
        if etype in totals:
            totals[etype] = n
    daily: dict[str, dict] = {}
    day = func.date(KeywordEvent.created_at)
    for d, etype, n in db.execute(select(day, KeywordEvent.event_type, func.count()).where(
            *where, KeywordEvent.event_type.in_(("match", "dm_sent"))).group_by(day, KeywordEvent.event_type)):
        row = daily.setdefault(str(d), {"date": str(d), "matches": 0, "dm_sent": 0})
        row["matches" if etype == "match" else "dm_sent"] = n
    return {"days": days, "totals": totals, "daily": sorted(daily.values(), key=lambda r: r["date"])}


@router.get("/keywords")
def per_keyword(days: int = Query(30, ge=1, le=90), user: User = Depends(require_user), db: Session = Depends(get_db)):
    where = _base(user, days)
    out: dict[str, dict] = {}
    q = select(KeywordEvent.keyword_id, KeywordEvent.event_type, func.count(), func.max(KeywordEvent.created_at)).where(
        *where, KeywordEvent.keyword_id.is_not(None)).group_by(KeywordEvent.keyword_id, KeywordEvent.event_type)
    for kid, etype, n, last in db.execute(q):
        row = out.setdefault(kid, {"keyword_id": kid, "last_event_at": None, **{t: 0 for t in TYPES}})
        if etype in row:
            row[etype] = n
        if row["last_event_at"] is None or last > row["last_event_at"]:
            row["last_event_at"] = last
    return {"days": days, "items": list(out.values())}
