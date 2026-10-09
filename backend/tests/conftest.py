import os

# Settings for the test process — set before the app (and its cached settings) are imported.
os.environ.update(
    {
        "ENV": "test",
        "DATABASE_URL": "sqlite://",
        "AUTO_CREATE_SCHEMA": "false",
        "STORAGE_BACKEND": "memory",
        "SUPABASE_URL": "https://example-test.supabase.co",
        "SUPABASE_JWT_SECRET": "test-only-jwt-secret-0123456789abcdef",
        "DEV_LOGIN_ENABLED": "false",
        "SLA_CHECK_INTERVAL_SECONDS": "0",
        "REPORT_RATE_LIMIT_PER_HOUR": "50",
        "CRON_SECRET": "test-cron-secret",
        "CORS_ORIGINS": "http://localhost:5173",
        "GEMINI_API_KEY": "",
        "REALTIME_ENABLED": "true",
        "SUPABASE_SERVICE_ROLE_KEY": "",
    }
)

import uuid  # noqa: E402
from datetime import UTC, datetime, timedelta  # noqa: E402

import jwt  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.config import get_settings  # noqa: E402

get_settings.cache_clear()

from app.db import Base, set_engine  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import Profile, ProfileZone  # noqa: E402
from app.seed import U, placeholder_png, seed_reference  # noqa: E402
from app.services import rate_limit  # noqa: E402
from app.services.storage import MemoryStorage, set_storage  # noqa: E402

SECRET = os.environ["SUPABASE_JWT_SECRET"]
ISSUER = os.environ["SUPABASE_URL"] + "/auth/v1"

DEPT_WASTE, DEPT_DRAINS = U(0xD1), U(0xD2)
ZONE_NORTH, ZONE_CENTRAL, ZONE_SOUTH = U(0xE1), U(0xE2), U(0xE3)

USERS = {
    "citizen": dict(id=uuid.uuid4(), display_name="Citizen One", email="c1@example.org", role="citizen"),
    "citizen2": dict(id=uuid.uuid4(), display_name="Citizen Two", email="c2@example.org", role="citizen"),
    "waste_north": dict(id=uuid.uuid4(), display_name="Waste North", email="wn@example.org", role="staff", department_id=DEPT_WASTE, zones=[ZONE_NORTH]),
    "drains": dict(id=uuid.uuid4(), display_name="Drains All", email="dr@example.org", role="staff", department_id=DEPT_DRAINS, all_zones=True),
    "drains2": dict(id=uuid.uuid4(), display_name="Drains Two", email="dr2@example.org", role="staff", department_id=DEPT_DRAINS, all_zones=True),
    "supervisor": dict(id=uuid.uuid4(), display_name="Supervisor", email="sup@example.org", role="supervisor", all_zones=True),
    "admin": dict(id=uuid.uuid4(), display_name="Admin", email="admin@example.org", role="administrator", all_zones=True),
}


def token_for(user_id: uuid.UUID, **overrides) -> str:
    now = datetime.now(UTC)
    claims = {"sub": str(user_id), "aud": "authenticated", "iss": ISSUER, "iat": now, "exp": now + timedelta(hours=1), "email": "x@example.org", **overrides}
    return jwt.encode(claims, SECRET, algorithm="HS256")


@pytest.fixture()
def storage() -> MemoryStorage:
    s = MemoryStorage()
    set_storage(s)
    yield s
    set_storage(None)


@pytest.fixture()
def db_session(storage):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    set_engine(engine)
    session = sessionmaker(bind=engine, expire_on_commit=False)()
    seed_reference(session)
    for spec in USERS.values():
        spec = dict(spec)
        zones = spec.pop("zones", [])
        session.add(Profile(**spec))
        session.flush()
        for z in zones:
            session.add(ProfileZone(profile_id=spec["id"], zone_id=z))
    session.commit()
    rate_limit.reset()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture()
def client(db_session) -> TestClient:
    return TestClient(create_app())


class Api:
    """Small helper to call the API as a given test user."""

    def __init__(self, client: TestClient):
        self.c = client

    def headers(self, who: str | None) -> dict[str, str]:
        return {"Authorization": f"Bearer {token_for(USERS[who]['id'])}"} if who else {}

    def get(self, path, who=None, **kw):
        return self.c.get(path, headers=self.headers(who), **kw)

    def post(self, path, who=None, **kw):
        return self.c.post(path, headers=self.headers(who), **kw)

    def patch(self, path, who=None, **kw):
        return self.c.patch(path, headers=self.headers(who), **kw)

    def create_report(self, who="citizen", category="drainage", lat=13.052, lng=80.246, photo: bytes | None = None, **fields):
        data = {"category": category, "description": "Drain is blocked and overflowing onto the road every evening.", "latitude": str(lat), "longitude": str(lng), "address": "12 Test Road", **{k: v for k, v in fields.items() if v is not None}}
        files = {"photo": ("photo.png", photo if photo is not None else placeholder_png((10, 120, 200)), "image/png")}
        return self.post("/api/reports", who, data=data, files=files)


@pytest.fixture()
def api(client) -> Api:
    return Api(client)


PNG = placeholder_png((7, 148, 85))
