"""Health check, dev-only login, local media serving and the SLA job trigger."""

import hmac
from typing import Annotated

from fastapi import APIRouter, Header
from fastapi.responses import FileResponse
from sqlalchemy import select, text

from ..auth import DB, issue_dev_token
from ..config import get_settings
from ..errors import AppError, forbidden, not_found
from ..models import Profile
from ..services import sla
from ..services.storage import LocalStorage, get_storage
from .. import schemas as S
from .directory import profile_out

router = APIRouter(tags=["system"])


@router.get("/health")
def health(db: DB):
    try:
        db.execute(text("SELECT 1"))
        database = "ok"
    except Exception:
        database = "unavailable"
    s = get_settings()
    return {"status": "ok" if database == "ok" else "degraded", "database": database, "storage": s.storage_backend, "env": s.env}


@router.post("/api/dev/login", response_model=S.DevLoginOut, include_in_schema=False)
def dev_login(body: S.DevLoginIn, db: DB):
    """Local development only: sign in as a seeded dev account. Disabled unless DEV_LOGIN_ENABLED=true; refused in production."""
    s = get_settings()
    if not s.dev_login_enabled or s.env == "production":
        raise not_found()
    p = db.scalar(select(Profile).where(Profile.email == body.email.strip().lower()))
    if p is None or not (p.email or "").endswith("@dev.civicvision.local"):
        raise forbidden("Dev login only works for seeded @dev.civicvision.local accounts.")
    return S.DevLoginOut(access_token=issue_dev_token(p.id, p.email, s), profile=profile_out(p))


@router.get("/api/media/{token}", include_in_schema=False)
def media(token: str):
    storage = get_storage()
    if not isinstance(storage, LocalStorage):
        raise not_found()
    return FileResponse(storage.verify(token), headers={"Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff"})


@router.post("/api/internal/sla/run")
def run_sla(db: DB, x_cron_secret: Annotated[str | None, Header()] = None):
    """Trigger the deadline check from an external scheduler (Phase 3). Requires the CRON_SECRET header."""
    secret = get_settings().cron_secret
    if not secret or not x_cron_secret or not hmac.compare_digest(secret, x_cron_secret):
        raise AppError(401, "Invalid cron secret.")
    return {"created": sla.sync_escalations(db)}
