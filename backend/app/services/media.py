"""Turn a pasted post link into the media id that Meta sends in comment webhooks."""
import re
from urllib.parse import parse_qs, urlparse

import httpx

from ..models import ConnectedAccount
from ..security import decrypt
from . import facebook as fb
from . import instagram as ig

MAX_PAGES = 20  # Instagram: 20 x 50 = the 1000 most recent posts


class MediaError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


AD_HELP = (
    "This looks like an ad link, and ads cannot be matched by link. If the ad uses an existing post, paste "
    "that original post's link instead. For other ads, choose \"All posts\", or leave a test comment on the ad "
    "and paste the numeric media ID from the event in n8n."
)
NOT_FOUND_IG = (
    "We could not find this post on @{name}. Check that the link belongs to the connected account and is one of "
    "its latest 1000 posts. Ad-only posts cannot be looked up from a link: paste the numeric media ID instead."
)

IG_PATH = re.compile(r"/(?:[A-Za-z0-9_.]+/)?(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)")
FB_POST = re.compile(r"/posts/(pfbid\w+|\d+)")
FB_VIDEO = re.compile(r"/(?:videos|reel)/(\d+)")
FB_PHOTO = re.compile(r"/photos?/(?:[^/]+/)?(\d+)")
UA = {"User-Agent": "Mozilla/5.0 (compatible; link-resolver)"}


def _is_host(host: str, *domains: str) -> bool:
    return any(host == d or host.endswith("." + d) for d in domains)


def _normalize(url: str) -> str:
    url = url.strip()
    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url
    return url


def _expand(url: str) -> str:
    """Follow share/short links (instagram.com/share/..., fb.watch, fb.me, instagr.am)."""
    try:
        r = httpx.get(url, follow_redirects=True, timeout=10, headers=UA)
        return str(r.url)
    except httpx.HTTPError:
        return url


def _looks_like_ad(p) -> bool:
    host, path, q = (p.hostname or "").lower(), p.path.lower(), (p.query or "").lower()
    return (
        host.startswith(("adsmanager.", "business.")) or "/ads/" in path or path.startswith("/ads")
        or "ad_id=" in q or "act=" in q or "/ad_library" in path
    )


def _get(url: str, params: dict | None) -> dict:
    try:
        r = httpx.get(url, params=params, timeout=20)
        data = r.json()
    except (httpx.HTTPError, ValueError):
        raise MediaError("api", "Could not reach Meta to look up this post. Try again in a moment.")
    if r.status_code >= 400 or (isinstance(data, dict) and "error" in data):
        err = data.get("error") if isinstance(data, dict) else None
        msg = err.get("message") if isinstance(err, dict) else str(err or data)
        raise MediaError("api", f"Meta could not look up this post: {str(msg)[:180]}")
    return data


def _short(text: str | None, n: int = 120) -> str | None:
    if not text:
        return None
    text = " ".join(text.split())
    return text if len(text) <= n else text[: n - 1] + "…"


def _resolve_instagram(acc: ConnectedAccount, token: str, parsed) -> dict:
    m = IG_PATH.search(parsed.path)
    if not m and (_is_host(parsed.hostname or "", "instagr.am") or "/share/" in parsed.path):
        parsed = urlparse(_expand(parsed.geturl()))
        m = IG_PATH.search(parsed.path)
    if not m:
        raise MediaError("bad_link", "Paste a link to an Instagram post or reel, like instagram.com/p/XXXX or instagram.com/reel/XXXX.")
    shortcode = m.group(1)
    url: str | None = f"{ig.GRAPH}/me/media"
    params: dict | None = {
        "fields": "id,shortcode,permalink,media_type,media_product_type,caption,thumbnail_url,media_url",
        "limit": 50, "access_token": token,
    }
    for _ in range(MAX_PAGES):
        data = _get(url, params)
        for item in data.get("data", []):
            if item.get("shortcode") == shortcode:
                return {"media_id": str(item["id"]), "permalink": item.get("permalink"),
                        "media_type": item.get("media_product_type") or item.get("media_type"),
                        "caption": _short(item.get("caption")),
                        "thumbnail_url": item.get("thumbnail_url") or item.get("media_url")}
        url = (data.get("paging") or {}).get("next")
        params = None
        if not url:
            break
    raise MediaError("not_found", NOT_FOUND_IG.format(name=acc.username))


def _resolve_facebook(acc: ConnectedAccount, token: str, parsed) -> dict:
    page = acc.external_id
    if _is_host(parsed.hostname or "", "fb.watch", "fb.me") or "/share/" in parsed.path:
        parsed = urlparse(_expand(parsed.geturl()))
    path, qs = parsed.path, parse_qs(parsed.query)
    fields = "id,permalink_url,message,full_picture"

    def lookup(candidate: str) -> dict | None:
        try:
            d = _get(f"{fb.GRAPH}/{candidate}", {"fields": fields, "access_token": token})
        except MediaError:
            return None
        return d if d.get("id") else None

    def result(d: dict) -> dict:
        return {"media_id": str(d["id"]), "permalink": d.get("permalink_url"), "media_type": "FACEBOOK_POST",
                "caption": _short(d.get("message")), "thumbnail_url": d.get("full_picture")}

    ref = None
    if m := FB_POST.search(path):
        ref = m.group(1)
    elif v := (qs.get("story_fbid") or qs.get("fbid") or [None])[0]:
        ref = v
    media = None
    if ref and ref.startswith("pfbid"):  # new-style ids cannot be converted: match by permalink instead
        url: str | None = f"{fb.GRAPH}/{page}/published_posts"
        params: dict | None = {"fields": fields, "limit": 100, "access_token": token}
        for _ in range(10):
            data = _get(url, params)
            for item in data.get("data", []):
                if ref in (item.get("permalink_url") or ""):
                    return result(item)
            url, params = (data.get("paging") or {}).get("next"), None
            if not url:
                break
    elif ref:
        media = ref
    elif m := FB_VIDEO.search(path):
        media = m.group(1)
    elif m := FB_PHOTO.search(path):
        media = m.group(1)
    if not media:
        if ref:
            raise MediaError("not_found", "We could not find this post on your Page. Check that the link belongs to the connected Page.")
        raise MediaError("bad_link", "Paste a link to a post, photo, video or reel on your Facebook Page.")
    for candidate in (f"{page}_{media}", media):  # webhooks use <pageId>_<postId> for posts
        d = lookup(candidate)
        if d:
            return result(d)
    raise MediaError("not_found", "We could not find this post on your Page. Check that the link belongs to the connected Page, or paste the numeric post ID.")


def resolve(acc: ConnectedAccount, raw_url: str) -> dict:
    url = _normalize(raw_url)
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if not host or "." not in host:
        raise MediaError("bad_link", "That does not look like a link.")
    if _looks_like_ad(parsed):
        raise MediaError("ad_link", AD_HELP)
    token = decrypt(acc.access_token_encrypted) if acc.is_active else ""
    if not token:
        raise MediaError("disconnected", "This account is disconnected. Reconnect it before looking up posts.")

    is_ig_link = _is_host(host, "instagram.com", "instagr.am")
    is_fb_link = _is_host(host, "facebook.com", "fb.com", "fb.watch", "fb.me")
    if acc.platform == "instagram":
        if is_fb_link:
            raise MediaError("wrong_platform", "This is a Facebook link, but the selected account is Instagram. Pick the matching account.")
        if not is_ig_link:
            raise MediaError("bad_link", "Paste a link to an Instagram post or reel.")
        out = _resolve_instagram(acc, token, parsed)
    else:
        if is_ig_link:
            raise MediaError("wrong_platform", "This is an Instagram link, but the selected account is a Facebook Page. Pick the matching account.")
        if not is_fb_link:
            raise MediaError("bad_link", "Paste a link to a post on your Facebook Page.")
        out = _resolve_facebook(acc, token, parsed)
    out["normalized_url"] = url
    return out
