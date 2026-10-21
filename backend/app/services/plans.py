from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import (ConnectedAccount, DMUsage, Keyword, PricingPlan, User,
                      UserSubscription, utcnow)

DEFAULT_PLAN_SLUG = "starter"


def get_plan_for_user(db: Session, user: User) -> PricingPlan | None:
    sub = db.scalar(select(UserSubscription).where(
        UserSubscription.user_id == user.id, UserSubscription.status == "active"
    ).order_by(UserSubscription.created_at.desc()))
    if sub and (sub.current_period_end is None or sub.current_period_end > utcnow()):
        return sub.plan
    return db.scalar(select(PricingPlan).where(PricingPlan.slug == DEFAULT_PLAN_SLUG))


def within(count: int, limit: int) -> bool:
    """limit < 0 means unlimited."""
    return limit < 0 or count < limit


def count_active_accounts(db: Session, user_id: str) -> int:
    return db.scalar(select(func.count()).select_from(ConnectedAccount).where(
        ConnectedAccount.user_id == user_id, ConnectedAccount.is_active.is_(True))) or 0


def count_keywords(db: Session, user_id: str) -> int:
    return db.scalar(select(func.count()).select_from(Keyword).join(ConnectedAccount).where(
        ConnectedAccount.user_id == user_id)) or 0


def period_now() -> str:
    return utcnow().strftime("%Y-%m")


def dm_used_for_user(db: Session, user_id: str) -> int:
    return db.scalar(select(func.coalesce(func.sum(DMUsage.count), 0)).join(
        ConnectedAccount, ConnectedAccount.id == DMUsage.connected_account_id).where(
        ConnectedAccount.user_id == user_id, DMUsage.period == period_now())) or 0
