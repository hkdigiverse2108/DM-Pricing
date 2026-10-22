from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Addon, PricingPlan, SystemSetting
from ..schemas import AddonOut, PlanOut
from ..services import cache

router = APIRouter(prefix="/api/public", tags=["public"])
PUBLIC_SETTINGS = ("site_name", "tagline", "hero_title", "hero_subtitle", "support_email", "currency_symbol")
CACHE_KEY = "public:pricing"


def _default(o):
    return str(o) if isinstance(o, Decimal) else o


@router.get("/pricing")
def pricing(db: Session = Depends(get_db)):
    cached = cache.get_json(CACHE_KEY)
    if cached:
        return cached
    plans = db.scalars(select(PricingPlan).where(PricingPlan.is_active.is_(True))
                       .order_by(PricingPlan.sort_order, PricingPlan.price_monthly)).all()
    addons = db.scalars(select(Addon).where(Addon.is_active.is_(True))).all()
    data = {
        "plans": [PlanOut.model_validate(p).model_dump(mode="json") for p in plans],
        "addons": [AddonOut.model_validate(a).model_dump(mode="json") for a in addons],
    }
    cache.set_json(CACHE_KEY, data, ttl=60)
    return data


@router.get("/site")
def site(db: Session = Depends(get_db)):
    rows = db.scalars(select(SystemSetting).where(SystemSetting.key.in_(PUBLIC_SETTINGS))).all()
    return {r.key: r.value for r in rows}
