import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import Base, get_engine, session_factory
from .errors import install_handlers
from .routers import admin, ai, analytics, directory, notifications, public, reports, supervisor, system
from .services import realtime, sla

log = logging.getLogger("civicvision")


async def _sla_loop(interval: int) -> None:
    while True:
        try:
            def run() -> int:
                with session_factory()() as db:
                    return sla.sync_escalations(db)

            created = await asyncio.to_thread(run)
            if created:
                log.info("SLA check created %s escalation event(s)", created)
                realtime.publish("escalations")
        except Exception:  # keep the loop alive; the next run retries
            log.exception("SLA check failed")
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    if settings.auto_create_schema:
        Base.metadata.create_all(get_engine())
    task = asyncio.create_task(_sla_loop(settings.sla_check_interval_seconds)) if settings.sla_check_interval_seconds > 0 else None
    yield
    if task:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="CIVICVISION AI API",
        version="0.2.0",
        description="Civic issue reporting and accountability API. All protected routes require a Supabase access token.",
        lifespan=lifespan,
        docs_url="/docs" if settings.env != "production" else None,
        redoc_url=None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,  # bearer tokens, no cookies
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )
    install_handlers(app)

    @app.middleware("http")
    async def broadcast_writes(request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if request.method in ("POST", "PATCH") and response.status_code < 400 and path.startswith("/api/") and not path.startswith(("/api/ai/", "/api/dev/", "/api/notifications")):
            parts = path.split("/")
            realtime.publish(parts[2] if len(parts) > 2 else "api", parts[3] if len(parts) > 3 else None)
        return response

    for r in (system.router, directory.router, public.router, ai.router, reports.router, supervisor.router, analytics.router, notifications.router, admin.router):
        app.include_router(r)
    return app


app = create_app()
