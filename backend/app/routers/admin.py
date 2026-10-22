from datetime import datetime

import jwt
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_admin
from ..models import (Addon, ConnectedAccount, DMUsage, Keyword, PlanFeature,
                      PricingPlan, SystemSetting, User, UserSubscription)
from ..schemas import (AddonIn, AddonOut, AdminCreate, AdminUserOut, AssignPlan, LoginIn,
                       PlanIn, PlanOut, RefreshIn, SettingsIn, TokenOut, UserOut, UserPatch)
from ..security import (access_token, decode_token, hash_password, refresh_token,
                        verify_password)
from ..services import cache
from ..services import plans as plan_svc
from ..services.ratelimit import rate_limit
from .public import CACHE_KEY

router = APIRouter(prefix="/api/admin-panel", tags=["admin-panel"])


@router.post("/auth/login", response_model=TokenOut, dependencies=[Depends(rate_limit("admin-login", 8, 300))])
def admin_login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or user.role != "admin" or not user.is_active or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid credentials")
    return TokenOut(access_token=access_token(user), refresh_token=refresh_token(user), role="admin")


@router.post("/auth/refresh", response_model=TokenOut, dependencies=[Depends(rate_limit("admin-refresh", 60, 300))])
def admin_refresh(body: RefreshIn, db: Session = Depends(get_db)):
    try:
        payload = decode_token(body.refresh_token, "refresh")
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid refresh token")
    user = db.get(User, payload["sub"])
    if not user or user.role != "admin" or not user.is_active:
        raise HTTPException(401, "Invalid refresh token")
    return TokenOut(access_token=access_token(user), refresh_token=refresh_token(user), role="admin")


# Everything below needs a valid admin token; anything else gets a 404.
protected = APIRouter(dependencies=[Depends(require_admin)])


@protected.get("/me", response_model=UserOut)
def admin_me(admin: User = Depends(require_admin)):
    return admin


@protected.get("/stats")
def stats(db: Session = Depends(get_db)):
    count = lambda m, *w: db.scalar(select(func.count()).select_from(m).where(*w)) or 0  # noqa: E731
    return {
        "users": count(User, User.role == "user"),
        "active_users": count(User, User.role == "user", User.is_active.is_(True)),
        "connected_accounts": count(ConnectedAccount, ConnectedAccount.is_active.is_(True)),
        "keywords": count(Keyword),
        "plans": count(PricingPlan),
        "dm_this_month": db.scalar(select(func.coalesce(func.sum(DMUsage.count), 0)).where(
            DMUsage.period == plan_svc.period_now())) or 0,
    }


# ---- users ----
@protected.get("/users")
def users(q: str | None = None, role: str | None = None, page: int = 1, per_page: int = 25, db: Session = Depends(get_db)):
    per_page = min(max(per_page, 1), 100)
    stmt = select(User)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(User.email.like(like), User.full_name.like(like)))
    if role in ("user", "admin"):
        stmt = stmt.where(User.role == role)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(User.created_at.desc()).offset((max(page, 1) - 1) * per_page).limit(per_page)).all()
    items = []
    for u in rows:
        item = AdminUserOut.model_validate(u)
        if u.role == "user":  # the plan the user is really on (active subscription, else the default plan)
            plan = plan_svc.get_plan_for_user(db, u)
            item.plan_id, item.plan_name = (plan.id, plan.name) if plan else (None, None)
        items.append(item)
    return {"total": total, "items": items}


@protected.patch("/users/{user_id}", response_model=UserOut)
def patch_user(user_id: str, body: UserPatch, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == admin.id and body.is_active is False:
        raise HTTPException(409, "You cannot deactivate yourself")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(user, k, v)
    db.commit()
    return user


@protected.post("/admins", response_model=UserOut, status_code=201)
def create_admin(body: AdminCreate, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Email already registered")
    u = User(email=email, password_hash=hash_password(body.password), full_name=body.full_name, role="admin")
    db.add(u)
    db.commit()
    return u


@protected.put("/users/{user_id}/plan")
def assign_plan(user_id: str, body: AssignPlan, db: Session = Depends(get_db)):
    user, plan = db.get(User, user_id), db.get(PricingPlan, body.plan_id)
    if not user or user.role != "user" or not plan:
        raise HTTPException(404, "User or plan not found")
    for s in db.scalars(select(UserSubscription).where(UserSubscription.user_id == user.id, UserSubscription.status == "active")):
        s.status = "cancelled"
    db.add(UserSubscription(user_id=user.id, plan_id=plan.id, billing_cycle=body.billing_cycle, status="active"))
    db.commit()
    return {"user_id": user.id, "plan": plan.slug}


# ---- plans ----
def _apply_plan(plan: PricingPlan, body: PlanIn):
    data = body.model_dump(exclude={"features"})
    for k, v in data.items():
        setattr(plan, k, v)
    plan.features = [PlanFeature(**f.model_dump()) for f in body.features]


@protected.get("/plans", response_model=list[PlanOut])
def list_plans(db: Session = Depends(get_db)):
    return db.scalars(select(PricingPlan).order_by(PricingPlan.sort_order)).all()


@protected.post("/plans", response_model=PlanOut, status_code=201)
def create_plan(body: PlanIn, db: Session = Depends(get_db)):
    if db.scalar(select(PricingPlan).where(PricingPlan.slug == body.slug)):
        raise HTTPException(409, "Slug already exists")
    plan = PricingPlan()
    _apply_plan(plan, body)
    db.add(plan)
    db.commit()
    cache.delete(CACHE_KEY)
    return plan


@protected.put("/plans/{plan_id}", response_model=PlanOut)
def update_plan(plan_id: str, body: PlanIn, db: Session = Depends(get_db)):
    plan = db.get(PricingPlan, plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    clash = db.scalar(select(PricingPlan).where(PricingPlan.slug == body.slug, PricingPlan.id != plan_id))
    if clash:
        raise HTTPException(409, "Slug already exists")
    _apply_plan(plan, body)
    db.commit()
    cache.delete(CACHE_KEY)
    return plan


@protected.delete("/plans/{plan_id}", status_code=204)
def delete_plan(plan_id: str, db: Session = Depends(get_db)):
    plan = db.get(PricingPlan, plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    if plan.slug == plan_svc.DEFAULT_PLAN_SLUG:
        raise HTTPException(409, "The default plan cannot be deleted; deactivate it or edit it instead")
    if db.scalar(select(func.count()).select_from(UserSubscription).where(UserSubscription.plan_id == plan_id)):
        raise HTTPException(409, "Plan has subscribers; deactivate it instead")
    db.delete(plan)
    db.commit()
    cache.delete(CACHE_KEY)


# ---- add-ons ----
@protected.get("/addons", response_model=list[AddonOut])
def list_addons(db: Session = Depends(get_db)):
    return db.scalars(select(Addon).order_by(Addon.name)).all()


@protected.post("/addons", response_model=AddonOut, status_code=201)
def create_addon(body: AddonIn, db: Session = Depends(get_db)):
    if db.scalar(select(Addon).where(Addon.slug == body.slug)):
        raise HTTPException(409, "Slug already exists")
    a = Addon(**body.model_dump())
    db.add(a)
    db.commit()
    cache.delete(CACHE_KEY)
    return a


@protected.put("/addons/{addon_id}", response_model=AddonOut)
def update_addon(addon_id: str, body: AddonIn, db: Session = Depends(get_db)):
    a = db.get(Addon, addon_id)
    if not a:
        raise HTTPException(404, "Add-on not found")
    for k, v in body.model_dump().items():
        setattr(a, k, v)
    db.commit()
    cache.delete(CACHE_KEY)
    return a


@protected.delete("/addons/{addon_id}", status_code=204)
def delete_addon(addon_id: str, db: Session = Depends(get_db)):
    a = db.get(Addon, addon_id)
    if a:
        db.delete(a)
        db.commit()
        cache.delete(CACHE_KEY)


# ---- system settings ----
@protected.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    return {s.key: s.value for s in db.scalars(select(SystemSetting)).all()}


@protected.put("/settings")
def put_settings(body: SettingsIn, db: Session = Depends(get_db)):
    for k, v in body.values.items():
        row = db.get(SystemSetting, k)
        if row:
            row.value = v
        else:
            db.add(SystemSetting(key=k, value=v))
    db.commit()
    return get_settings(db)


router.include_router(protected)
