"""Upload validation: checks the real file signature (not just the declared type) and the size limit."""

from fastapi import UploadFile

from ..config import get_settings
from ..errors import invalid

SIGNATURES = (
    (b"\xff\xd8\xff", "image/jpeg", "jpg"),
    (b"\x89PNG\r\n\x1a\n", "image/png", "png"),
)


def sniff(data: bytes) -> tuple[str, str] | None:
    for magic, ctype, ext in SIGNATURES:
        if data.startswith(magic):
            return ctype, ext
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", "webp"
    return None


async def read_image(file: UploadFile | None, field: str = "photo") -> tuple[bytes, str, str]:
    if file is None:
        raise invalid("Attach a photo of the issue.", {field: "Photo required"})
    limit = get_settings().max_upload_bytes
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise invalid(f"Image is larger than {get_settings().max_upload_mb:g} MB.", {field: "File too large"})
    if len(data) < 100:
        raise invalid("This file is too small to be a photo.", {field: "File too small"})
    kind = sniff(data)
    if kind is None:
        raise invalid("Use a JPEG, PNG or WebP image.", {field: "Unsupported file type"})
    return data, kind[0], kind[1]
