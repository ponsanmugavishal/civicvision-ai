"""Application settings, loaded from environment variables (and `.env` in local development).

Secrets (database URL, Supabase service-role key, JWT secret) are read here only and never returned by any endpoint.
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    env: Literal["development", "test", "production"] = "development"

    # --- Database -------------------------------------------------------------------------
    # Supabase: use the pooler connection string (Project Settings → Database), e.g.
    # postgresql+psycopg://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
    database_url: str = "sqlite:///./civicvision-dev.db"
    # Create tables from ORM models on startup. Only for local SQLite development —
    # on Supabase the SQL migrations in /supabase/migrations are the source of truth.
    auto_create_schema: bool = False

    # --- Supabase Auth --------------------------------------------------------------------
    supabase_url: str = ""
    # Legacy HS256 JWT secret. Leave empty when the project uses asymmetric signing keys (JWKS).
    supabase_jwt_secret: str = ""
    jwt_audience: str = "authenticated"

    # --- Storage --------------------------------------------------------------------------
    storage_backend: Literal["supabase", "local", "memory"] = "local"
    supabase_service_role_key: str = ""  # backend only — required for the "supabase" storage backend
    storage_bucket: str = "report-media"
    local_media_dir: str = "./media"
    signed_url_ttl_seconds: int = 900
    max_upload_mb: float = 5.0

    # --- HTTP / abuse control -------------------------------------------------------------
    cors_origins: str = "http://localhost:5173"
    report_rate_limit_per_hour: int = 10
    upload_rate_limit_per_hour: int = 60

    # --- AI assistance (optional) -----------------------------------------------------------
    # Pretrained Gemini model via the Gemini API (free tier works). Empty key = "AI assistance unavailable".
    gemini_api_key: str = ""  # SECRET — backend only
    gemini_model: str = "gemini-3.5-flash-lite"
    gemini_timeout_seconds: float = 20.0
    ai_rate_limit_per_hour: int = 20

    # --- Duplicate detection ----------------------------------------------------------------
    duplicate_radius_m: float = 150.0
    duplicate_window_days: int = 30

    # --- Realtime ---------------------------------------------------------------------------
    # Broadcast "something changed" (ids only) on Supabase Realtime after every write, so open dashboards refresh.
    realtime_enabled: bool = True
    realtime_channel: str = "civic-updates"

    # --- SLA deadline monitoring ---------------------------------------------------------
    # In-process periodic check (0 disables). Safe to run alongside external triggers: the check is idempotent.
    sla_check_interval_seconds: int = 300
    # Shared secret for POST /api/internal/sla/run (external scheduler). Empty disables the endpoint.
    cron_secret: str = ""

    # --- Local development only -------------------------------------------------------------
    # Enables POST /api/dev/login, which issues tokens for seeded dev accounts.
    # Refused at startup when env=production.
    dev_login_enabled: bool = False
    dev_jwt_secret: str = Field(default="", description="HS256 secret for dev-issued tokens")
    # Secret used to sign local media URLs (local storage backend).
    media_signing_secret: str = "change-me-local-media-secret"

    @field_validator("database_url")
    @classmethod
    def _psycopg_driver(cls, v: str) -> str:
        # Accept the URI exactly as Supabase shows it (postgresql:// or postgres://) and use the psycopg 3 driver.
        v = v.strip()
        for prefix in ("postgresql://", "postgres://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @property
    def supabase_admin_headers(self) -> dict[str, str]:
        """New `sb_secret_…` keys go in the apikey header only; legacy service_role JWTs also as a bearer token."""
        key = self.supabase_service_role_key.strip()
        return {"apikey": key} if key.startswith("sb_secret_") else {"apikey": key, "Authorization": f"Bearer {key}"}

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return int(self.max_upload_mb * 1024 * 1024)

    @model_validator(mode="after")
    def _guard_production(self) -> "Settings":
        if self.env == "production":
            if self.dev_login_enabled:
                raise ValueError("DEV_LOGIN_ENABLED must be false in production")
            if self.auto_create_schema:
                raise ValueError("AUTO_CREATE_SCHEMA must be false in production; apply the SQL migrations instead")
            if self.storage_backend != "supabase":
                raise ValueError("STORAGE_BACKEND must be 'supabase' in production")
            if not self.supabase_url:
                raise ValueError("SUPABASE_URL is required in production")
            if not self.database_url.startswith("postgresql"):
                raise ValueError("DATABASE_URL must be the Supabase Postgres connection string in production")
            if not self.supabase_service_role_key:
                raise ValueError("SUPABASE_SERVICE_ROLE_KEY is required in production (photo storage)")
            if "*" in self.cors_origin_list:
                raise ValueError("CORS_ORIGINS must list explicit origins in production")
        if self.dev_login_enabled and len(self.dev_jwt_secret) < 32:
            raise ValueError("DEV_JWT_SECRET must be at least 32 characters when DEV_LOGIN_ENABLED=true")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
