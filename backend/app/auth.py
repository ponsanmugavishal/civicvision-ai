"""Authentication: verifies Supabase-issued JWTs and loads the caller's server-side profile.

The caller's role and scope always come from the `profiles` table — never from the token or the request body.
Supported token types:
  * Supabase asymmetric signing keys (ES256/RS256) via the project's JWKS endpoint (current default).
  * Supabase legacy HS256 secret (SUPABASE_JWT_SECRET).
  * Dev tokens (HS256, DEV_JWT_SECRET) — only when DEV_LOGIN_ENABLED=true, which is refused in production.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import Depends, Request
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .db import get_db
from .errors import forbidden, unauthenticated
from .models import Profile

DEV_ISSUER = "civicvision-dev"
_jwks_clients: dict[str, jwt.PyJWKClient] = {}


def _jwks(settings: Settings) -> jwt.PyJWKClient:
    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    if url not in _jwks_clients:
        _jwks_clients[url] = jwt.PyJWKClient(url, cache_keys=True, lifespan=600, timeout=5)
    return _jwks_clients[url]


def decode_token(token: str, settings: Settings) -> dict:
    try:
        header = jwt.get_unverified_header(token)
        unverified = jwt.decode(token, options={"verify_signature": False})
    except jwt.PyJWTError:
        raise unauthenticated("Invalid access token.")

    alg = header.get("alg")
    issuer = unverified.get("iss")
    common = {"audience": settings.jwt_audience, "options": {"require": ["exp", "sub", "aud"]}, "leeway": 30}
    try:
        if issuer == DEV_ISSUER:
            if not settings.dev_login_enabled or settings.env == "production":
                raise unauthenticated("Dev tokens are not accepted by this server.")
            return jwt.decode(token, settings.dev_jwt_secret, algorithms=["HS256"], issuer=DEV_ISSUER, **common)

        if not settings.supabase_url:
            raise unauthenticated("Authentication is not configured on this server.")
        expected_iss = f"{settings.supabase_url.rstrip('/')}/auth/v1"
        if alg == "HS256":
            if not settings.supabase_jwt_secret:
                raise unauthenticated("Invalid access token.")
            return jwt.decode(token, settings.supabase_jwt_secret, algorithms=["HS256"], issuer=expected_iss, **common)
        if alg in ("ES256", "RS256"):
            key = _jwks(settings).get_signing_key_from_jwt(token)
            return jwt.decode(token, key.key, algorithms=[alg], issuer=expected_iss, **common)
    except jwt.ExpiredSignatureError:
        raise unauthenticated("Your session has expired. Please sign in again.")
    except jwt.PyJWTError:
        raise unauthenticated("Invalid access token.")
    raise unauthenticated("Unsupported token algorithm.")


def issue_dev_token(user_id: uuid.UUID, email: str | None, settings: Settings, ttl_minutes: int = 120) -> str:
    if not settings.dev_login_enabled or settings.env == "production":
        raise forbidden("Dev login is disabled.")
    now = datetime.now(UTC)
    claims = {"sub": str(user_id), "email": email, "aud": settings.jwt_audience, "iss": DEV_ISSUER, "iat": now, "exp": now + timedelta(minutes=ttl_minutes), "role": "authenticated"}
    return jwt.encode(claims, settings.dev_jwt_secret, algorithm="HS256")


def _bearer(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


def _load_profile(claims: dict, db: Session) -> Profile:
    try:
        user_id = uuid.UUID(claims["sub"])
    except (KeyError, ValueError):
        raise unauthenticated("Invalid access token.")
    profile = db.get(Profile, user_id)
    if profile is None:
        # Normally created by the auth.users trigger. Fallback: self-provision as a citizen only.
        meta = claims.get("user_metadata") or {}
        email = claims.get("email")
        name = (meta.get("display_name") or meta.get("full_name") or (email or "Citizen").split("@")[0])[:120]
        profile = Profile(id=user_id, display_name=name, email=email, role="citizen", all_zones=False)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def optional_user(request: Request, db: Annotated[Session, Depends(get_db)], settings: Annotated[Settings, Depends(get_settings)]) -> Profile | None:
    token = _bearer(request)
    if not token:
        return None
    return _load_profile(decode_token(token, settings), db)


def current_user(request: Request, db: Annotated[Session, Depends(get_db)], settings: Annotated[Settings, Depends(get_settings)]) -> Profile:
    token = _bearer(request)
    if not token:
        raise unauthenticated()
    return _load_profile(decode_token(token, settings), db)


def require_roles(*roles: str):
    def dep(user: Annotated[Profile, Depends(current_user)]) -> Profile:
        if user.role not in roles:
            raise forbidden()
        return user

    return dep


CurrentUser = Annotated[Profile, Depends(current_user)]
OptionalUser = Annotated[Profile | None, Depends(optional_user)]
StaffOrAbove = Annotated[Profile, Depends(require_roles("staff", "supervisor", "administrator"))]
SupervisorOrAdmin = Annotated[Profile, Depends(require_roles("supervisor", "administrator"))]
Citizen = Annotated[Profile, Depends(require_roles("citizen"))]
Admin = Annotated[Profile, Depends(require_roles("administrator"))]
DB = Annotated[Session, Depends(get_db)]
