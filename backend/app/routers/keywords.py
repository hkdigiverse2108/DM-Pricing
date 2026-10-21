from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_user
from ..models import ConnectedAccount, Keyword, User
from ..schemas import KeywordCreate, KeywordOut, KeywordUpdate
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
    kw = Keyword(**body.model_dump())
    db.add(kw)
    db.commit()
    return kw


@router.get("/{kid}", response_model=KeywordOut)
def get_keyword(kid: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    return _own_keyword(db, user, kid)


@router.patch("/{kid}", response_model=KeywordOut)
def update_keyword(kid: str, body: KeywordUpdate, user: User = Depends(require_user), db: Session = Depends(get_db)):
    kw = _own_keyword(db, user, kid)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(kw, k, v)
    _check_follow_gate(kw.require_follow, kw.follow_gate_message, kw.follow_gate_button_text)
    db.commit()
    return kw


@router.delete("/{kid}", status_code=204)
def delete_keyword(kid: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    db.delete(_own_keyword(db, user, kid))
    db.commit()
