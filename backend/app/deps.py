import hmac

import jwt
from fastapi import Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import User
from .security import decode_token

bearer = HTTPBearer(auto_error=False)


def _load(creds, db: Session, role: str, hide: bool) -> User:
    fail = HTTPException(404, "Not found") if hide else HTTPException(401, "Not authenticated")
    if not creds:
        raise fail
    try:
        payload = decode_token(creds.credentials, "access")
    except jwt.PyJWTError:
        raise fail
    user = db.get(User, payload.get("sub"))
    if not user or not user.is_active or user.role != role or payload.get("role") != role:
        raise fail
    return user


def require_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    return _load(creds, db, "user", hide=False)


def require_admin(creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    # 404 (not 401/403) so the admin surface is not discoverable by normal users
    return _load(creds, db, "admin", hide=True)


def require_n8n(x_api_key: str | None = Header(default=None)) -> None:
    if not x_api_key or not hmac.compare_digest(x_api_key, settings.N8N_API_KEY):
        raise HTTPException(401, "Invalid API key")
