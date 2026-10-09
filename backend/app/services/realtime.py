"""Realtime fan-out: after a successful write, broadcast a tiny "changed" event on Supabase Realtime so every open
dashboard refetches immediately. Payloads carry only public ids — never personal data or report contents.
Fire-and-forget on a background thread; failures are logged and never affect the request."""

import logging
import threading
import time

import httpx

from ..config import get_settings

log = logging.getLogger("civicvision.realtime")


def enabled() -> bool:
    s = get_settings()
    return s.realtime_enabled and bool(s.supabase_url and s.supabase_service_role_key)


def _send(payload: dict) -> None:
    s = get_settings()
    try:
        httpx.post(
            f"{s.supabase_url.rstrip('/')}/realtime/v1/api/broadcast",
            headers=s.supabase_admin_headers,
            json={"messages": [{"topic": s.realtime_channel, "event": "changed", "payload": payload}]},
            timeout=4,
        )
    except httpx.HTTPError as e:
        log.warning("Realtime broadcast failed: %s", e)


def publish(kind: str, ref: str | None = None) -> None:
    if not enabled():
        return
    threading.Thread(target=_send, args=({"kind": kind, "ref": ref, "at": int(time.time())},), daemon=True).start()
