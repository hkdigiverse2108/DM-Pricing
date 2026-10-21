"""Instagram API with Instagram Login (Business Login for Instagram)."""
from urllib.parse import urlencode

import httpx

from ..config import settings

SCOPES = ",".join([
    "instagram_business_basic",
    "instagram_business_manage_comments",
    "instagram_business_manage_messages",
])
GRAPH = f"https://graph.instagram.com/{settings.META_GRAPH_VERSION}"


class IGError(Exception):
    pass


def build_auth_url(state: str) -> str:
    q = urlencode({
        "client_id": settings.META_APP_ID,
        "redirect_uri": settings.META_REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPES,
        "state": state,
    })
    return f"https://www.instagram.com/oauth/authorize?{q}"


def _json(r: httpx.Response) -> dict:
    try:
        data = r.json()
    except ValueError:
        raise IGError(f"non-json response ({r.status_code})")
    if r.status_code >= 400 or "error" in data or data.get("error_type"):
        raise IGError(str(data.get("error") or data)[:300])
    return data


def exchange_code(code: str) -> tuple[str, str]:
    r = httpx.post("https://api.instagram.com/oauth/access_token", timeout=20, data={
        "client_id": settings.META_APP_ID,
        "client_secret": settings.META_APP_SECRET,
        "grant_type": "authorization_code",
        "redirect_uri": settings.META_REDIRECT_URI,
        "code": code,
    })
    d = _json(r)
    return d["access_token"], str(d.get("user_id", ""))


def long_lived(short_token: str) -> tuple[str, int]:
    r = httpx.get("https://graph.instagram.com/access_token", timeout=20, params={
        "grant_type": "ig_exchange_token",
        "client_secret": settings.META_APP_SECRET,
        "access_token": short_token,
    })
    d = _json(r)
    return d["access_token"], int(d.get("expires_in", 5184000))


def refresh(token: str) -> tuple[str, int]:
    r = httpx.get("https://graph.instagram.com/refresh_access_token", timeout=20, params={
        "grant_type": "ig_refresh_token", "access_token": token})
    d = _json(r)
    return d["access_token"], int(d.get("expires_in", 5184000))


def profile(token: str) -> dict:
    r = httpx.get(f"{GRAPH}/me", timeout=20, params={"fields": "user_id,username", "access_token": token})
    return _json(r)


def subscribe(token: str) -> None:
    r = httpx.post(f"{GRAPH}/me/subscribed_apps", timeout=20, params={
        "subscribed_fields": "comments,messages,messaging_postbacks", "access_token": token})
    _json(r)
