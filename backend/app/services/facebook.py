"""Facebook Login for Pages (OAuth, page list, webhook subscription)."""
from urllib.parse import urlencode

import httpx

from ..config import settings

GRAPH = f"https://graph.facebook.com/{settings.META_GRAPH_VERSION}"
SCOPES = ",".join([
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_metadata",   # needed to subscribe the Page to feed webhooks
    "pages_messaging",         # send/receive Messenger messages
    "pages_manage_engagement", # reply to comments
])
# feed -> comments on Page posts; messages / messaging_postbacks -> Messenger
SUBSCRIBED_FIELDS = "feed,messages,messaging_postbacks"


class FBError(Exception):
    pass


def build_auth_url(state: str) -> str:
    q = urlencode({
        "client_id": settings.fb_app_id,
        "redirect_uri": settings.META_FB_REDIRECT_URI,
        "state": state,
        "scope": SCOPES,
        "response_type": "code",
    })
    return f"https://www.facebook.com/{settings.META_GRAPH_VERSION}/dialog/oauth?{q}"


def _json(r: httpx.Response) -> dict:
    try:
        data = r.json()
    except ValueError:
        raise FBError(f"non-json response ({r.status_code})")
    if r.status_code >= 400 or (isinstance(data, dict) and "error" in data):
        err = data.get("error") if isinstance(data, dict) else data
        msg = err.get("message") if isinstance(err, dict) else err
        raise FBError(str(msg)[:300])
    return data


def exchange_code(code: str) -> str:
    r = httpx.get(f"{GRAPH}/oauth/access_token", timeout=20, params={
        "client_id": settings.fb_app_id, "client_secret": settings.fb_app_secret,
        "redirect_uri": settings.META_FB_REDIRECT_URI, "code": code})
    return _json(r)["access_token"]


def long_lived_user_token(short_token: str) -> str:
    r = httpx.get(f"{GRAPH}/oauth/access_token", timeout=20, params={
        "grant_type": "fb_exchange_token", "client_id": settings.fb_app_id,
        "client_secret": settings.fb_app_secret, "fb_exchange_token": short_token})
    return _json(r)["access_token"]


def list_pages(user_token: str) -> list[dict]:
    """Pages the user manages. Page tokens derived from a long-lived user token do not expire."""
    pages: list[dict] = []
    url: str | None = f"{GRAPH}/me/accounts"
    params: dict | None = {"fields": "id,name,access_token", "limit": 100, "access_token": user_token}
    for _ in range(5):  # hard cap on pagination
        data = _json(httpx.get(url, params=params, timeout=20))
        pages.extend(data.get("data", []))
        url = (data.get("paging") or {}).get("next")
        params = None  # the "next" URL already carries every parameter
        if not url:
            break
    return pages


def subscribe_page(page_id: str, page_token: str) -> None:
    _json(httpx.post(f"{GRAPH}/{page_id}/subscribed_apps", timeout=20,
                     params={"subscribed_fields": SUBSCRIBED_FIELDS, "access_token": page_token}))


def unsubscribe_page(page_id: str, page_token: str) -> None:
    _json(httpx.delete(f"{GRAPH}/{page_id}/subscribed_apps", timeout=20, params={"access_token": page_token}))
