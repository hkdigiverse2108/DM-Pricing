from datetime import datetime, timedelta, timezone

import jwt
from cryptography.fernet import Fernet
from passlib.context import CryptContext

from .config import settings

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
_fernet = Fernet(settings.FERNET_KEY.encode())
ALGO = "HS256"


def hash_password(p: str) -> str:
    return _pwd.hash(p)


def verify_password(p: str, h: str) -> bool:
    return _pwd.verify(p, h)


def create_token(sub: str, role: str, kind: str, expires: timedelta) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": sub, "role": role, "type": kind, "iat": now, "exp": now + expires},
                      settings.SECRET_KEY, algorithm=ALGO)


def access_token(user) -> str:
    return create_token(user.id, user.role, "access", timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))


def refresh_token(user) -> str:
    return create_token(user.id, user.role, "refresh", timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS))


def decode_token(token: str, kind: str) -> dict:
    """Raises jwt.PyJWTError on any problem, including wrong token type."""
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGO])
    if payload.get("type") != kind:
        raise jwt.InvalidTokenError("wrong token type")
    return payload


def encrypt(value: str) -> str:
    return _fernet.encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    return _fernet.decrypt(value.encode()).decode() if value else ""
