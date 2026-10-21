# Instagram + Facebook Comment-to-DM SaaS (Hybrid: FastAPI + n8n executor)

FastAPI backend + React frontend (public site, `/app`, isolated `/admin-panel`) + n8n as the executor.
Meta webhooks -> FastAPI (signature check, normalize, filter) -> n8n -> n8n calls the FastAPI APIs below.

## Run (Docker)
1. `cp .env.example .env` and fill SECRET_KEY, FERNET_KEY, N8N_API_KEY, META_*, ADMIN_EMAIL, ADMIN_PASSWORD (strong password).
2. `docker compose up -d --build`. Migrations run on start (`alembic upgrade head`); admin + 4 plans are seeded on first boot.
3. Site: http://localhost, admin: http://localhost/admin-panel/login (not linked anywhere on the site).
4. The n8n editor is published on **127.0.0.1:5678 only**. Do not expose it publicly without authentication; use an SSH tunnel or an authenticated reverse proxy. The backend reaches it internally (`N8N_WEBHOOK_URL=http://n8n:5678/webhook/ig-events`).

## Production checklist
- `PRODUCTION=1` in `.env`: `/docs`, `/redoc` and `/openapi.json` return 404. (Use `PRODUCTION=0` locally if you want them.)
- Terminate **TLS** in front of the `frontend` container (Caddy / Traefik / nginx / cloud load balancer). Meta requires HTTPS for OAuth redirects and webhooks.
- The backend port is not published; only nginx (frontend) and n8n reach it. Uvicorn trusts `X-Forwarded-For` from the proxy, so keep it unpublished (needed for correct per-IP rate limiting).
- Optional Redis password: see the commented lines in `docker-compose.yml` and set `REDIS_URL=redis://:<password>@redis:6379/0`.
- Strong, unique `SECRET_KEY`, `FERNET_KEY` (back it up: losing it makes stored tokens unreadable), `N8N_API_KEY`.
- Back up the MySQL volume.

## Auth and isolation
- `/api/auth/login` rejects admins; admins use `/api/admin-panel/auth/login`. Every other `/api/admin-panel/*` route returns **404** without a valid admin token.
- Rate limits (Redis, per IP, fail-open if Redis is down; HTTP 429 + `Retry-After`): user login 10 / 5 min, register 5 / hour, refresh 60 / 5 min, admin login 8 / 5 min, admin refresh 60 / 5 min.
- Passwords: bcrypt. JWT carries `role` and `type`; access, refresh and OAuth-state tokens are not interchangeable.

## Meta setup
**Instagram (Business Login for Instagram)**
- Redirect URI: `META_REDIRECT_URI` = `https://<domain>/api/instagram/callback`.

**Facebook Pages (Facebook Login)**
- Redirect URI: `META_FB_REDIRECT_URI` = `https://<domain>/api/facebook/callback`.
- Uses `META_FB_APP_ID` / `META_FB_APP_SECRET` if set, otherwise falls back to `META_APP_ID` / `META_APP_SECRET`. Set them if your Instagram app id/secret differ from the Meta app's main App ID/Secret.
- Permissions requested: `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `pages_messaging`, `pages_manage_engagement`. Outside the app's development/test roles these need Meta App Review. Meta renames things now and then: check the current docs if the login dialog rejects a scope.
- Flow: login -> long-lived user token -> `/me/accounts` -> if the user manages one Page it is connected immediately; with several, the Accounts page shows a picker (the Page tokens wait encrypted in Redis for 10 minutes and are never sent to the browser). The **Page access token** is stored Fernet-encrypted; the Page is subscribed to `feed`, `messages`, `messaging_postbacks`. Page tokens derived from a long-lived user token do not expire, so there is no refresh for Facebook.
- Disconnect is soft for both platforms: token wiped (and the Page unsubscribed, best effort), keywords kept.
- Plan limit "max connected accounts" counts Instagram accounts and Pages together (DB column is still `max_instagram_accounts`).

**Webhooks** (one callback for both): `https://<domain>/api/webhooks/instagram` (alias `/api/webhooks/meta`), verify token = `META_VERIFY_TOKEN`.
- Instagram product: `comments`, `messages`, `messaging_postbacks`. Page object: `feed`, `messages`, `messaging_postbacks`.
- Every POST must carry a valid `X-Hub-Signature-256` (HMAC-SHA256 of the **raw body**, secret = `META_APP_SECRET` or `META_FB_APP_SECRET`). Bad or missing signature -> 403.
- The handler reads the body bytes once (`await request.body()`), verifies the HMAC on those bytes, then `json.loads(body)`. It never calls `request.json()` after reading the body.

## Event contract: FastAPI -> n8n
`POST N8N_WEBHOOK_URL`, header `X-Webhook-Secret: <N8N_API_KEY>`, body `{"events":[...]}`. Only events for connected, active accounts are forwarded; the account's own replies/echoes are dropped.
```json
{ "type": "comment|message|postback", "platform": "instagram|facebook",
  "account_external_id": "...", "comment_id": "...", "text": "...", "media_id": "...",
  "from_id": "...", "from_username": "...", "parent_id": null, "timestamp": 0 }
```
Message/postback events carry `sender_id`, `recipient_id`, `message`, `postback` instead of the comment fields. Instagram events also include the legacy `ig_account_id` (same value as `account_external_id`) so existing n8n workflows keep working. For Facebook comments, `media_id` is the post id and `from_username` is the commenter's name.

## APIs for n8n (header `X-API-Key: <N8N_API_KEY>`)
Account is identified by `external_id` (+ optional `?platform=instagram|facebook`, default `instagram`, so old workflows keep working).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/n8n/accounts/{external_id}?platform=` | decrypted token, is_active, dm_used / dm_limit / dm_allowed |
| GET | `/api/n8n/accounts/{external_id}/keywords?platform=&media_id=` | active keywords (null media_id = all posts) |
| POST | `/api/n8n/accounts/{external_id}/refresh-token?platform=` | Instagram: refresh now. Facebook: `{"refreshable": false}` |
| POST | `/api/n8n/pending-dms` | body: `platform`, `account_external_id` (or legacy `ig_account_id`), `igsid`, `message`, `keyword`, `comment_id`, `media_id`, `username`, `ttl_minutes` |
| GET | `/api/n8n/pending-dms/{external_id}/{igsid}?platform=&consume=true` | fetch (and delete) a non-expired pending DM; 404 if none/expired |
| DELETE | `/api/n8n/pending-dms/{id}` | delete one |
| POST | `/api/n8n/pending-dms/cleanup` | purge expired (the backend also does this every 6 h) |
| POST | `/api/n8n/dm-sent` | body: `platform`, `account_external_id`, optional `keyword_id`, `external_user_id`, `comment_id`, `media_id`. Increments the monthly DM counter; with `keyword_id` it also logs a `dm_sent` event |
| POST | `/api/n8n/events` | log a step (see below) |

## Keyword performance (PERFORMANCE)
n8n logs each step: `POST /api/n8n/events`
```json
{ "platform": "facebook", "account_external_id": "123", "event_type": "match",
  "keyword_id": "<uuid>", "external_user_id": "<igsid/psid>", "comment_id": "...", "media_id": "...",
  "meta": { "anything": "useful" } }
```
`event_type`: `match`, `public_reply`, `dm_sent`, `follow_gate_shown`, `follow_gate_passed`, `error`. `keyword_id` is optional but, if given, must belong to that account (422 otherwise). Suggested n8n logging: `match` after keyword matching, `public_reply` after the comment reply, `follow_gate_shown` / `follow_gate_passed` around the gate, `dm_sent` via `/dm-sent` (do not log it twice), `error` in the failure branch.
- Table `keyword_events` with indexes (account, time) and (keyword, time); rows older than 90 days are deleted by the backend's maintenance loop.
- User read APIs: `GET /api/stats/overview?days=30` (totals + daily matches/DMs) and `GET /api/stats/keywords?days=30` (per-keyword counts). Shown on the Dashboard (tiles, 30-day bars, top keywords) and on each row of Keywords.

## Database migrations
- `0001` builds the original schema, `0002` adds `platform` + `external_id` on `connected_accounts` (existing Instagram rows are backfilled: `platform='instagram'`, `external_id = old ig_account_id`; the old column is dropped) and creates `keyword_events`.
- 0002 is idempotent because 0001 uses `create_all` (a fresh database already has the new schema when it reaches 0002). Never edit 0001; write real `op.*` migrations from now on (`alembic revision -m "..."`).
- **Back up MySQL before the first `alembic upgrade head` on an existing database.** I could not run this migration against MySQL here.

## Local dev
- Backend: `cd backend && pip install -r requirements.txt && alembic upgrade head && uvicorn app.main:app --reload` (needs MySQL + Redis + `.env`, `PRODUCTION=0`, `FRONTEND_URL=http://localhost:5173`).
- Frontend: `cd frontend && npm install && npm run dev` (Vite proxies `/api`). `npm run typecheck` runs the TypeScript check (the build does not block on type errors).
- Meta OAuth/webhooks need a public HTTPS URL in dev (tunnel).

## Manual test notes
1. **Docs hidden:** `PRODUCTION=1` -> `GET /docs` and `/openapi.json` are 404.
2. **Admin isolation:** user token on `/api/admin-panel/stats` -> 404; admin credentials on `/api/auth/login` -> 401; user credentials on `/api/admin-panel/auth/login` -> 401.
3. **Rate limit:** 11 wrong logins from one IP within 5 minutes -> 429 with `Retry-After`.
4. **Instagram:** connect -> account listed with Instagram badge, `connected_accounts.access_token_encrypted` is a Fernet blob; disconnect -> token empty, keywords kept; reconnect restores.
5. **Facebook:** Accounts -> Connect Facebook Page -> (picker if several Pages) -> Page listed with Facebook badge; `GET /{page_id}/subscribed_apps` on Graph shows the app.
6. **Webhook signature:** POST with a wrong/missing `X-Hub-Signature-256` -> 403; correct HMAC over the raw body -> 200 `{"received": N}` and n8n gets `{"events":[...]}` with `X-Webhook-Secret`. Compute a signature: `printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$META_APP_SECRET"`.
7. **Performance:** `curl -X POST /api/n8n/events -H "X-API-Key: ..." -d '{"platform":"instagram","account_external_id":"<id>","event_type":"match","keyword_id":"<uuid>"}'` -> the Dashboard / Keywords counters increase after a refresh.
8. **Limits:** exceeding plan accounts/keywords is still rejected (402 / `error=limit`); `-1` stays unlimited.
