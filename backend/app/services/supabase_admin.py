"""Creates Supabase Auth users from the backend (service key), already confirmed — so no confirmation email is
sent and Supabase's built-in email rate limit (≈2/hour on the free plan) never blocks sign-ups.

Any role written into user metadata is ignored: the database trigger always creates a CITIZEN profile, and only
an administrator can change roles afterwards.
"""

import uuid

import httpx

from ..config import get_settings
from ..errors import AppError, conflict, invalid

# Tests inject an httpx.MockTransport here.
_transport: httpx.BaseTransport | None = None


def create_user(email: str, password: str, display_name: str) -> uuid.UUID:
    s = get_settings()
    if not s.supabase_url or not s.supabase_service_role_key:
        raise AppError(503, "Account creation is not configured on this server.")
    try:
        with httpx.Client(timeout=15, transport=_transport) as c:
            r = c.post(
                f"{s.supabase_url.rstrip('/')}/auth/v1/admin/users",
                headers=s.supabase_admin_headers,
                json={"email": email, "password": password, "email_confirm": True, "user_metadata": {"display_name": display_name}},
            )
    except httpx.HTTPError:
        raise AppError(502, "The sign-in service is unreachable. Please try again.")
    if r.status_code in (200, 201):
        return uuid.UUID(r.json()["id"])
    try:
        body = r.json()
    except ValueError:
        body = {}
    code = str(body.get("error_code") or body.get("code") or "")
    msg = str(body.get("msg") or body.get("message") or body.get("error_description") or "")
    if code == "email_exists" or "already been registered" in msg or r.status_code == 409:
        raise conflict("An account with this email already exists. Please sign in instead.")
    if code == "weak_password" or "password" in msg.lower():
        raise invalid(msg or "Choose a stronger password.", {"password": msg or "Too weak"})
    if code in ("email_address_invalid", "validation_failed") or "email" in msg.lower():
        raise invalid("Enter a valid email address.", {"email": "Invalid email"})
    raise AppError(502, "Could not create the account right now. Please try again.")
