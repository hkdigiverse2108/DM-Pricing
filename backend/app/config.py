from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    REDIS_URL: str = "redis://redis:6379/0"
    SECRET_KEY: str
    FERNET_KEY: str
    N8N_API_KEY: str
    META_APP_ID: str = ""
    META_APP_SECRET: str = ""
    META_REDIRECT_URI: str = ""
    META_VERIFY_TOKEN: str = ""
    META_GRAPH_VERSION: str = "v26.0"
    # Facebook Login for Pages. Leave the two FB_APP_* values empty to reuse META_APP_ID / META_APP_SECRET.
    META_FB_APP_ID: str = ""
    META_FB_APP_SECRET: str = ""
    META_FB_REDIRECT_URI: str = ""
    # DEV ONLY: if Meta refuses the long-lived token exchange, connect with the 1-hour short token instead
    ALLOW_TEMP_TOKEN: bool = False
    PRODUCTION: bool = False  # 1/true/yes hides /docs, /redoc and /openapi.json
    FRONTEND_URL: str = "http://localhost:5173"
    CORS_ORIGINS: str = ""
    N8N_WEBHOOK_URL: str = ""
    ADMIN_EMAIL: str
    ADMIN_PASSWORD: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    @property
    def fb_app_id(self) -> str:
        return self.META_FB_APP_ID or self.META_APP_ID

    @property
    def fb_app_secret(self) -> str:
        return self.META_FB_APP_SECRET or self.META_APP_SECRET

    @property
    def webhook_secrets(self) -> list[str]:
        """Meta may sign with the Instagram app secret or the main app secret; accept either."""
        return [x for x in dict.fromkeys([self.META_APP_SECRET, self.META_FB_APP_SECRET]) if x]


settings = Settings()