from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- auth ----
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: str


class UserOut(ORM):
    id: str
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    created_at: datetime


class AdminUserOut(UserOut):
    plan_id: str | None = None
    plan_name: str | None = None


# ---- plans ----
class FeatureIO(ORM):
    feature_key: str = Field(max_length=100)
    feature_name: str = Field(max_length=255)
    is_included: bool = True


class PlanIn(BaseModel):
    name: str = Field(max_length=100)
    slug: str = Field(pattern=r"^[a-z0-9-]+$", max_length=100)
    price_monthly: Decimal = Field(ge=0)
    price_yearly: Decimal = Field(ge=0)
    description: str | None = None
    max_instagram_accounts: int = Field(ge=-1)  # -1 = unlimited
    max_keywords: int = Field(ge=-1)
    max_dm_per_month: int = Field(ge=-1)
    is_active: bool = True
    sort_order: int = 0
    features: list[FeatureIO] = []


class PlanOut(ORM):
    id: str
    name: str
    slug: str
    price_monthly: Decimal
    price_yearly: Decimal
    description: str | None
    max_instagram_accounts: int
    max_keywords: int
    max_dm_per_month: int
    is_active: bool
    sort_order: int
    features: list[FeatureIO]


class AddonIn(BaseModel):
    name: str = Field(max_length=100)
    slug: str = Field(pattern=r"^[a-z0-9-]+$", max_length=100)
    description: str | None = None
    price_monthly: Decimal = Field(ge=0)
    is_active: bool = True


class AddonOut(ORM, AddonIn):
    id: str


# ---- accounts / keywords ----
Platform = Literal["instagram", "facebook"]
EventType = Literal["match", "public_reply", "dm_sent", "follow_gate_shown", "follow_gate_passed", "error"]


class AccountOut(ORM):
    id: str
    platform: Platform
    external_id: str
    username: str
    is_active: bool
    token_expires_at: datetime | None
    created_at: datetime


class KeywordBase(BaseModel):
    keyword: str = Field(min_length=1, max_length=255)
    message: str = Field(min_length=1)
    comment_reply1: str | None = None
    comment_reply2: str | None = None
    comment_reply3: str | None = None
    follow_gate_message: str | None = None
    follow_gate_button_text: str | None = Field(default=None, max_length=80)
    media_id: str | None = Field(default=None, max_length=64)
    media_url: str | None = Field(default=None, max_length=1000)
    require_follow: bool = False
    is_active: bool = True
    description: str | None = None


class KeywordCreate(KeywordBase):
    connected_account_id: str


class KeywordUpdate(BaseModel):
    keyword: str | None = Field(default=None, min_length=1, max_length=255)
    message: str | None = Field(default=None, min_length=1)
    comment_reply1: str | None = None
    comment_reply2: str | None = None
    comment_reply3: str | None = None
    follow_gate_message: str | None = None
    follow_gate_button_text: str | None = Field(default=None, max_length=80)
    media_id: str | None = Field(default=None, max_length=64)
    media_url: str | None = Field(default=None, max_length=1000)
    require_follow: bool | None = None
    is_active: bool | None = None
    description: str | None = None


class ResolveMediaIn(BaseModel):
    connected_account_id: str
    url: str = Field(min_length=1, max_length=1000)


class KeywordOut(KeywordBase, ORM):
    id: str
    connected_account_id: str
    created_at: datetime
    updated_at: datetime


# ---- n8n ----
class AccountRef(BaseModel):
    """Identifies a connected account. `ig_account_id` is the legacy name for account_external_id."""
    platform: Platform = "instagram"
    account_external_id: str | None = None
    ig_account_id: str | None = None

    @model_validator(mode="after")
    def _resolve(self):
        self.account_external_id = self.account_external_id or self.ig_account_id
        if not self.account_external_id:
            raise ValueError("account_external_id is required")
        return self


class PendingDMIn(AccountRef):
    igsid: str
    message: str
    keyword: str | None = None
    comment_id: str | None = None
    media_id: str | None = None
    username: str | None = None
    ttl_minutes: int = Field(default=60, ge=1, le=10080)


class PendingDMOut(ORM):
    id: str
    igsid: str
    connected_account_id: str
    message: str
    keyword: str | None
    comment_id: str | None
    media_id: str | None
    username: str | None
    created_at: datetime
    ttl_minutes: int


class DMSentIn(AccountRef):
    keyword_id: str | None = None
    external_user_id: str | None = None
    comment_id: str | None = None
    media_id: str | None = None


class EventIn(AccountRef):
    event_type: EventType
    keyword_id: str | None = None
    external_user_id: str | None = Field(default=None, max_length=64)
    comment_id: str | None = Field(default=None, max_length=64)
    media_id: str | None = Field(default=None, max_length=64)
    meta: dict | str | None = None


class FBConnectIn(BaseModel):
    selection: str = Field(min_length=8, max_length=64)
    page_id: str = Field(min_length=1, max_length=64)


# ---- admin ----
class UserPatch(BaseModel):
    is_active: bool | None = None
    full_name: str | None = None


class AdminCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)


class AssignPlan(BaseModel):
    plan_id: str
    billing_cycle: str = "monthly"


class SettingsIn(BaseModel):
    values: dict[str, str]
