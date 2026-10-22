import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import seed
from .config import settings
from .database import SessionLocal
from .routers import accounts, admin, auth, facebook, keywords, n8n_api, public, stats, webhooks
from .services import tokens

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("app")


def _maintenance_once() -> None:
    db = SessionLocal()
    try:
        tokens.refresh_expiring(db)
        tokens.cleanup_pending(db)
        tokens.cleanup_events(db)
    finally:
        db.close()


async def _maintenance_loop():
    while True:
        try:
            await asyncio.to_thread(_maintenance_once)
        except Exception:
            log.exception("maintenance run failed")
        await asyncio.sleep(6 * 3600)


@asynccontextmanager
async def lifespan(_: FastAPI):
    db = SessionLocal()
    try:
        seed.run(db)
    finally:
        db.close()
    task = asyncio.create_task(_maintenance_loop())
    yield
    task.cancel()


app = FastAPI(
    title="Instagram Comment-to-DM SaaS",
    lifespan=lifespan,
    # PRODUCTION=1 hides the interactive docs and the OpenAPI schema
    docs_url=None if settings.PRODUCTION else "/docs",
    redoc_url=None if settings.PRODUCTION else "/redoc",
    openapi_url=None if settings.PRODUCTION else "/openapi.json",
)
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()] or [settings.FRONTEND_URL]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

for r in (public.router, auth.router, accounts.router, facebook.router, keywords.router,
          stats.router, webhooks.router, n8n_api.router, admin.router):
    app.include_router(r)


@app.get("/health")
def health():
    return {"status": "ok"}
