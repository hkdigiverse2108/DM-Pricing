"""Instagram API with Instagram Login (Business Login for Instagram)."""
import logging
from urllib.parse import urlencode

import httpx

from ..config import settings

SCOPES = ",".join([
    "instagram_business_basic",
    "instagram_business_manage_comments",
    "instagram_business_manage_messages",
])
GRAPH = f"https://graph.instagram.com/{settings.META_GRAPH_VERSION}"
GRAPH_UNVERSIONED = "https://graph.instagram.com"  # fallback if Meta rejects an old API version


log = logging.getLogger(__name__)


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


def _json(r: httpx.Response, step: str) -> dict:
    """Parse a response; raise IGError('<step>: <Meta's message>') on any failure."""
    try:
        data = r.json()
    except ValueError:
        raise IGError(f"{step}: non-JSON response (HTTP {r.status_code})")
    if not isinstance(data, dict):
        raise IGError(f"{step}: unexpected response")
    err = data.get("error")
    if r.status_code >= 400 or err or data.get("error_type"):
        msg = data.get("error_message") or (err.get("message") if isinstance(err, dict) else err) or data
        raise IGError(f"{step}: {str(msg)[:250]} (HTTP {r.status_code})")
    return data


def _unwrap(d: dict) -> dict:
    """Business Login returns {"data": [{...}]}; some responses are a flat object. Accept both."""
    data = d.get("data")
    if isinstance(data, list) and data and isinstance(data[0], dict):
        return data[0]
    return d


def exchange_code(code: str) -> tuple[str, str, str]:
    """Returns (short-lived token, user id, granted permissions)."""
    r = httpx.post("https://api.instagram.com/oauth/access_token", timeout=20, data={
        "client_id": settings.META_APP_ID,
        "client_secret": settings.META_APP_SECRET,
        "grant_type": "authorization_code",
        "redirect_uri": settings.META_REDIRECT_URI,
        "code": code,
    })
    d = _unwrap(_json(r, "code exchange"))
    if not d.get("access_token"):
        raise IGError("code exchange: no access_token in Meta's response")
    perms = d.get("permissions", "")
    return d["access_token"], str(d.get("user_id", "")), ",".join(perms) if isinstance(perms, list) else str(perms)


def long_lived(short_token: str, granted: str = "") -> tuple[str, int]:
    """Short-lived (1h) -> long-lived (60 days). Documented as GET. This call needs the *Instagram* app
    secret; if META_APP_SECRET is wrong but META_FB_APP_SECRET is the right one, that is tried too."""
    secrets_to_try = list(dict.fromkeys(x for x in (settings.META_APP_SECRET, settings.META_FB_APP_SECRET) if x))
    variants = [
        ("GET", "https://graph.instagram.com/access_token"),
        ("GET", f"{GRAPH}/access_token"),
        ("POST", "https://graph.instagram.com/access_token"),
    ]
    errors: list[str] = []
    for i, secret in enumerate(secrets_to_try):
        params = {"grant_type": "ig_exchange_token", "client_secret": secret, "access_token": short_token}
        for method, url in variants:
            try:
                r = httpx.get(url, timeout=20, params=params) if method == "GET" else httpx.post(url, timeout=20, data=params)
                d = _json(r, "long-lived token")
                if d.get("access_token"):
                    if i > 0:
                        log.warning("long-lived exchange worked only with META_FB_APP_SECRET: put the Instagram app "
                                    "secret (Instagram > API setup with Instagram login) into META_APP_SECRET")
                    return d["access_token"], int(d.get("expires_in") or 5_184_000)
                errors.append("long-lived token: no access_token in Meta's response")
            except (IGError, httpx.HTTPError) as e:
                errors.append(f"secret#{i + 1} {method} {url.replace('https://graph.instagram.com', '')}: {e}")
    log.warning("long-lived exchange failed for every variant (granted permissions: %s): %s", granted or "unknown", errors)
    if settings.ALLOW_TEMP_TOKEN:
        log.warning("ALLOW_TEMP_TOKEN is on: connecting with the 1-hour short-lived token (dev only)")
        return short_token, 3600
    raise IGError(f"{errors[0]} [{len(errors)} requests tried with {len(secrets_to_try)} app secret(s); "
                  f"granted permissions: {granted or 'unknown'}]")


def refresh(token: str) -> tuple[str, int]:
    # Also a GET per Meta's docs
    r = httpx.get("https://graph.instagram.com/refresh_access_token", timeout=20, params={
        "grant_type": "ig_refresh_token", "access_token": token})
    d = _json(r, "token refresh")
    if not d.get("access_token"):
        raise IGError("token refresh: no access_token in Meta's response")
    return d["access_token"], int(d.get("expires_in", 5184000))


def profile(token: str) -> dict:
    """Who is this token for? Tries the configured API version first, then no version at all."""
    attempts = [
        (GRAPH, "user_id,username"),
        (GRAPH_UNVERSIONED, "user_id,username"),
        (GRAPH_UNVERSIONED, "id,username"),
    ]
    errors: list[str] = []
    for base, fields in attempts:
        try:
            r = httpx.get(f"{base}/me", timeout=20, params={"fields": fields, "access_token": token})
            return _json(r, "profile lookup")
        except IGError as e:
            errors.append(str(e))
    raise IGError(f"{errors[0]} | retried without API version: {errors[-1]}")


def subscribe(token: str) -> None:
    r = httpx.post(f"{GRAPH}/me/subscribed_apps", timeout=20, params={
        "subscribed_fields": "comments,messages,messaging_postbacks", "access_token": token})
    _json(r, "webhook subscribe")