"""File storage for report photos and evidence.

Binary content never goes into Postgres — only the storage path. Backends:
  * supabase — private Supabase Storage bucket, accessed with the service-role key (backend only);
               reads are served through short-lived signed URLs.
  * local    — files under LOCAL_MEDIA_DIR, served by /api/media with HMAC-signed, expiring tokens (dev only).
  * memory   — in-process dict (tests).
"""

import base64
import hashlib
import hmac
import time
from pathlib import Path
from typing import Protocol
from urllib.parse import quote

import httpx

from ..config import Settings, get_settings
from ..errors import AppError


class Storage(Protocol):
    def put(self, path: str, data: bytes, content_type: str) -> None: ...
    def delete(self, path: str) -> None: ...
    def signed_url(self, path: str) -> str: ...


class SupabaseStorage:
    def __init__(self, settings: Settings):
        if not settings.supabase_url or not settings.supabase_service_role_key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the supabase storage backend")
        self.base = settings.supabase_url.rstrip("/") + "/storage/v1"
        self.bucket = settings.storage_bucket
        self.ttl = settings.signed_url_ttl_seconds
        self.headers = settings.supabase_admin_headers

    def put(self, path: str, data: bytes, content_type: str) -> None:
        r = httpx.post(f"{self.base}/object/{self.bucket}/{quote(path)}", content=data, headers={**self.headers, "Content-Type": content_type, "x-upsert": "false"}, timeout=20)
        if r.status_code >= 300:
            raise AppError(502, "Photo storage is unavailable. Please try again.")

    def delete(self, path: str) -> None:
        httpx.request("DELETE", f"{self.base}/object/{self.bucket}", json={"prefixes": [path]}, headers=self.headers, timeout=10)

    def signed_url(self, path: str) -> str:
        r = httpx.post(f"{self.base}/object/sign/{self.bucket}/{quote(path)}", json={"expiresIn": self.ttl}, headers=self.headers, timeout=10)
        if r.status_code >= 300:
            return ""
        signed = r.json().get("signedURL") or r.json().get("signedUrl", "")
        return f"{self.base}{signed}" if signed.startswith("/") else signed


class LocalStorage:
    def __init__(self, settings: Settings):
        self.root = Path(settings.local_media_dir).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.secret = settings.media_signing_secret.encode()
        self.ttl = settings.signed_url_ttl_seconds

    def _file(self, path: str) -> Path:
        p = (self.root / path).resolve()
        if self.root not in p.parents:
            raise AppError(400, "Invalid storage path.")
        return p

    def put(self, path: str, data: bytes, content_type: str) -> None:
        f = self._file(path)
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(data)

    def delete(self, path: str) -> None:
        self._file(path).unlink(missing_ok=True)

    def token(self, path: str, expires: int) -> str:
        msg = f"{path}|{expires}".encode()
        sig = hmac.new(self.secret, msg, hashlib.sha256).hexdigest()[:32]
        return base64.urlsafe_b64encode(f"{path}|{expires}|{sig}".encode()).decode()

    def verify(self, token: str) -> Path:
        try:
            path, expires, sig = base64.urlsafe_b64decode(token.encode()).decode().rsplit("|", 2)
        except Exception:
            raise AppError(404, "Not found.")
        expected = hmac.new(self.secret, f"{path}|{expires}".encode(), hashlib.sha256).hexdigest()[:32]
        if not hmac.compare_digest(sig, expected) or int(expires) < time.time():
            raise AppError(403, "This link has expired.")
        f = self._file(path)
        if not f.exists():
            raise AppError(404, "Not found.")
        return f

    def signed_url(self, path: str) -> str:
        return f"/api/media/{self.token(path, int(time.time()) + self.ttl)}"


class MemoryStorage:
    def __init__(self) -> None:
        self.files: dict[str, tuple[bytes, str]] = {}

    def put(self, path: str, data: bytes, content_type: str) -> None:
        self.files[path] = (data, content_type)

    def delete(self, path: str) -> None:
        self.files.pop(path, None)

    def signed_url(self, path: str) -> str:
        return f"memory://{path}"


_storage: Storage | None = None


def get_storage() -> Storage:
    global _storage
    if _storage is None:
        s = get_settings()
        _storage = SupabaseStorage(s) if s.storage_backend == "supabase" else LocalStorage(s) if s.storage_backend == "local" else MemoryStorage()
    return _storage


def set_storage(storage: Storage | None) -> None:
    global _storage
    _storage = storage
