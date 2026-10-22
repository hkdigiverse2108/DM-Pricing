import jwt
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_user
from ..models import User
from ..schemas import LoginIn, RefreshIn, RegisterIn, TokenOut, UserOut
from ..security import (access_token, decode_token, hash_password,
                        refresh_token, verify_password)
from ..services import plans as plan_svc
from ..services.ratelimit import rate_limit

router = APIRouter(prefix="/api/auth", tags=["auth"])
BAD = HTTPException(401, "Invalid credentials")


def _tokens(user: User) -> TokenOut:
    return TokenOut(access_token=access_token(user), refresh_token=refresh_token(user), role=user.role)


@router.post("/register", response_model=TokenOut, status_code=201,
             dependencies=[Depends(rate_limit("register", 5, 3600))])
def register(body: RegisterIn, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Email already registered")
    user = User(email=email, password_hash=hash_password(body.password), full_name=body.full_name, role="user")
    db.add(user)
    db.commit()
    return _tokens(user)


@router.post("/login", response_model=TokenOut, dependencies=[Depends(rate_limit("login", 10, 300))])
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    # Admins can NOT sign in here: they use the isolated /api/admin-panel/auth/login
    if not user or user.role != "user" or not user.is_active or not verify_password(body.password, user.password_hash):
        raise BAD
    return _tokens(user)


@router.post("/refresh", response_model=TokenOut, dependencies=[Depends(rate_limit("refresh", 60, 300))])
def refresh(body: RefreshIn, db: Session = Depends(get_db)):
    try:
        payload = decode_token(body.refresh_token, "refresh")
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid refresh token")
    user = db.get(User, payload["sub"])
    if not user or user.role != "user" or not user.is_active:
        raise HTTPException(401, "Invalid refresh token")
    return _tokens(user)


@router.get("/me")
def me(user: User = Depends(require_user), db: Session = Depends(get_db)):
    plan = plan_svc.get_plan_for_user(db, user)
    return {
        "user": UserOut.model_validate(user),
        "plan": {
            "name": plan.name, "slug": plan.slug,
            "max_instagram_accounts": plan.max_instagram_accounts,
            "max_keywords": plan.max_keywords,
            "max_dm_per_month": plan.max_dm_per_month,
        } if plan else None,
        "usage": {
            "instagram_accounts": plan_svc.count_active_accounts(db, user.id),
            "keywords": plan_svc.count_keywords(db, user.id),
            "dm_this_month": plan_svc.dm_used_for_user(db, user.id),
        },
    }
