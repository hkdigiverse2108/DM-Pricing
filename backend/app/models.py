import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (Boolean, DateTime, ForeignKey, Index, Integer, Numeric,
                        String, Text, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def uid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    """Current UTC time as a naive datetime (the DB stores naive UTC)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class User(Base, TimestampMixin):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(10), default="user")  # user | admin
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    accounts: Mapped[list["ConnectedAccount"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    subscriptions: Mapped[list["UserSubscription"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class ConnectedAccount(Base, TimestampMixin):
    __tablename__ = "connected_accounts"
    __table_args__ = (UniqueConstraint("platform", "external_id", name="uq_account_platform_external"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    platform: Mapped[str] = mapped_column(String(16), default="instagram", server_default="instagram")  # instagram | facebook
    external_id: Mapped[str] = mapped_column(String(64), index=True)  # IG user id or Facebook Page id
    username: Mapped[str] = mapped_column(String(255))
    access_token_encrypted: Mapped[str] = mapped_column(Text, default="")
    token_updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    user: Mapped[User] = relationship(back_populates="accounts")
    keywords: Mapped[list["Keyword"]] = relationship(back_populates="account", cascade="all, delete-orphan")


class Keyword(Base, TimestampMixin):
    __tablename__ = "keywords"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    connected_account_id: Mapped[str] = mapped_column(ForeignKey("connected_accounts.id", ondelete="CASCADE"), index=True)
    keyword: Mapped[str] = mapped_column(String(255))
    message: Mapped[str] = mapped_column(Text)
    comment_reply1: Mapped[str | None] = mapped_column(Text, nullable=True)
    comment_reply2: Mapped[str | None] = mapped_column(Text, nullable=True)
    comment_reply3: Mapped[str | None] = mapped_column(Text, nullable=True)
    follow_gate_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    follow_gate_button_text: Mapped[str | None] = mapped_column(String(80), nullable=True)
    media_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    require_follow: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    account: Mapped[ConnectedAccount] = relationship(back_populates="keywords")


class KeywordEvent(Base):
    """One step of the automation, logged by n8n (match, public_reply, dm_sent, ...)."""
    __tablename__ = "keyword_events"
    __table_args__ = (
        Index("ix_kwevents_account_time", "connected_account_id", "created_at"),
        Index("ix_kwevents_keyword_time", "keyword_id", "created_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    connected_account_id: Mapped[str] = mapped_column(ForeignKey("connected_accounts.id", ondelete="CASCADE"))
    keyword_id: Mapped[str | None] = mapped_column(ForeignKey("keywords.id", ondelete="SET NULL"), nullable=True)
    event_type: Mapped[str] = mapped_column(String(32))
    external_user_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    comment_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    media_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    meta: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class PendingDM(Base):
    __tablename__ = "pending_dms"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    igsid: Mapped[str] = mapped_column(String(64), index=True)
    connected_account_id: Mapped[str] = mapped_column(ForeignKey("connected_accounts.id", ondelete="CASCADE"), index=True)
    message: Mapped[str] = mapped_column(Text)
    keyword: Mapped[str | None] = mapped_column(String(255), nullable=True)
    comment_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    media_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    ttl_minutes: Mapped[int] = mapped_column(Integer, default=60)


class PricingPlan(Base, TimestampMixin):
    __tablename__ = "pricing_plans"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(100))
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    price_monthly: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    price_yearly: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    max_instagram_accounts: Mapped[int] = mapped_column(Integer, default=1)  # -1 = unlimited
    max_keywords: Mapped[int] = mapped_column(Integer, default=5)
    max_dm_per_month: Mapped[int] = mapped_column(Integer, default=500)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    features: Mapped[list["PlanFeature"]] = relationship(back_populates="plan", cascade="all, delete-orphan", order_by="PlanFeature.id")


class PlanFeature(Base):
    __tablename__ = "plan_features"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    plan_id: Mapped[str] = mapped_column(ForeignKey("pricing_plans.id", ondelete="CASCADE"), index=True)
    feature_key: Mapped[str] = mapped_column(String(100))
    feature_name: Mapped[str] = mapped_column(String(255))
    is_included: Mapped[bool] = mapped_column(Boolean, default=True)

    plan: Mapped[PricingPlan] = relationship(back_populates="features")


class Addon(Base):
    __tablename__ = "addons"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(100))
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price_monthly: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class UserSubscription(Base, TimestampMixin):
    """Future-ready: no payment gateway yet; admins can assign plans manually."""
    __tablename__ = "user_subscriptions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    plan_id: Mapped[str] = mapped_column(ForeignKey("pricing_plans.id"))
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | cancelled | expired
    billing_cycle: Mapped[str] = mapped_column(String(10), default="monthly")
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped[User] = relationship(back_populates="subscriptions")
    plan: Mapped[PricingPlan] = relationship()


class DMUsage(Base):
    __tablename__ = "dm_usage"
    __table_args__ = (UniqueConstraint("connected_account_id", "period", name="uq_usage_acc_period"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    connected_account_id: Mapped[str] = mapped_column(ForeignKey("connected_accounts.id", ondelete="CASCADE"), index=True)
    period: Mapped[str] = mapped_column(String(7))  # YYYY-MM
    count: Mapped[int] = mapped_column(Integer, default=0)


class SystemSetting(Base):
    __tablename__ = "system_settings"
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
