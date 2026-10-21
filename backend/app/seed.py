import logging
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .models import Addon, PlanFeature, PricingPlan, SystemSetting, User
from .security import hash_password

log = logging.getLogger(__name__)

# Placeholder prices/limits: edit them in the Admin Panel. -1 = unlimited.
PLANS = [
    ("Starter", "starter", 0, 0, "Try automation on one account", 1, 3, 300, [
        ("comment_to_dm", "Comment-to-DM automation", True), ("follow_gate", "Follow gate", False),
        ("multi_replies", "Rotating public replies", True), ("priority_support", "Priority support", False)]),
    ("Growth", "growth", 19, 190, "For creators growing steadily", 2, 15, 5000, [
        ("comment_to_dm", "Comment-to-DM automation", True), ("follow_gate", "Follow gate", True),
        ("multi_replies", "Rotating public replies", True), ("priority_support", "Priority support", False)]),
    ("Pro", "pro", 49, 490, "For businesses and busy brands", 5, 50, 25000, [
        ("comment_to_dm", "Comment-to-DM automation", True), ("follow_gate", "Follow gate", True),
        ("multi_replies", "Rotating public replies", True), ("priority_support", "Priority support", True)]),
    ("Agency", "agency", 99, 990, "Manage many client accounts", 20, -1, -1, [
        ("comment_to_dm", "Comment-to-DM automation", True), ("follow_gate", "Follow gate", True),
        ("multi_replies", "Rotating public replies", True), ("priority_support", "Priority support", True)]),
]
SETTINGS = {
    "site_name": "Comment-to-DM", "tagline": "Turn Instagram comments into conversations",
    "hero_title": "Turn every comment into a DM", "hero_subtitle": "Reply publicly, DM privately, grow faster.",
    "support_email": "", "currency_symbol": "$",
}


def run(db: Session) -> None:
    admin_email = settings.ADMIN_EMAIL.lower()
    if not db.scalar(select(User).where(User.email == admin_email)):
        db.add(User(email=admin_email, password_hash=hash_password(settings.ADMIN_PASSWORD),
                    full_name="Administrator", role="admin"))
        log.info("seeded admin %s", admin_email)

    if not db.scalar(select(PricingPlan.id).limit(1)):
        for i, (name, slug, pm, py, desc, accs, kws, dms, feats) in enumerate(PLANS):
            db.add(PricingPlan(
                name=name, slug=slug, price_monthly=Decimal(pm), price_yearly=Decimal(py), description=desc,
                max_instagram_accounts=accs, max_keywords=kws, max_dm_per_month=dms, sort_order=i,
                features=[PlanFeature(feature_key=k, feature_name=n, is_included=inc) for k, n, inc in feats]))
    if not db.scalar(select(Addon.id).limit(1)):
        db.add(Addon(name="Extra Instagram account", slug="extra-account", description="Add one more account",
                     price_monthly=Decimal(5)))
    for k, v in SETTINGS.items():
        if not db.get(SystemSetting, k):
            db.add(SystemSetting(key=k, value=v))
    db.commit()
