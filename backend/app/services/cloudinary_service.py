from __future__ import annotations

import hashlib
import time
from typing import Any

import httpx

from app.core.config import get_settings


class CloudinaryUploadError(Exception):
    pass


def upload_rental_listing_image(
    *,
    file_bytes: bytes,
    filename: str,
    content_type: str | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    if not settings.has_cloudinary_credentials:
        raise CloudinaryUploadError("Cloudinary credentials are not configured on the backend.")

    timestamp = int(time.time())
    folder = settings.cloudinary_upload_folder.strip("/")
    signature_payload = f"folder={folder}&timestamp={timestamp}{settings.cloudinary_api_secret}"
    signature = hashlib.sha1(signature_payload.encode("utf-8")).hexdigest()
    upload_url = f"https://api.cloudinary.com/v1_1/{settings.cloudinary_cloud_name}/image/upload"

    files = {
        "file": (
            filename or "rental-listing-image",
            file_bytes,
            content_type or "application/octet-stream",
        )
    }
    data = {
        "api_key": settings.cloudinary_api_key or "",
        "timestamp": str(timestamp),
        "folder": folder,
        "signature": signature,
    }

    try:
        response = httpx.post(upload_url, data=data, files=files, timeout=30.0)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        detail = None
        if exc.response is not None:
            try:
                detail = exc.response.json().get("error", {}).get("message")
            except Exception:
                detail = exc.response.text
        raise CloudinaryUploadError(detail or "Failed to upload image to Cloudinary.") from exc

    payload = response.json()
    secure_url = payload.get("secure_url")
    public_id = payload.get("public_id")
    if not secure_url or not public_id:
        raise CloudinaryUploadError("Cloudinary did not return the uploaded image metadata.")

    return {
        "image_url": secure_url,
        "image_public_id": public_id,
    }
