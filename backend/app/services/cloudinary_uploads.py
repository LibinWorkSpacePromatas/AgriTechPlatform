from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass

import httpx

from app.core.config import get_settings


class CloudinaryUploadError(Exception):
    pass


@dataclass(frozen=True)
class CloudinaryUploadResult:
    secure_url: str
    public_id: str


class CloudinaryUploadService:
    def __init__(self) -> None:
        self._settings = get_settings()

    def upload_image(self, *, file_name: str, content: bytes, content_type: str | None) -> CloudinaryUploadResult:
        cloud_name = self._settings.cloudinary_cloud_name
        api_key = self._settings.cloudinary_api_key
        api_secret = self._settings.cloudinary_api_secret

        if not cloud_name or not api_key or not api_secret:
            raise CloudinaryUploadError("Cloudinary is not configured on the backend.")

        timestamp = int(time.time())
        folder = "agritech/auctions"
        signature = self._sign_upload(folder=folder, timestamp=timestamp, api_secret=api_secret)

        response = httpx.post(
            f"https://api.cloudinary.com/v1_1/{cloud_name}/image/upload",
            data={
                "api_key": api_key,
                "folder": folder,
                "signature": signature,
                "timestamp": str(timestamp),
            },
            files={
                "file": (
                    file_name or "auction-image",
                    content,
                    content_type or "application/octet-stream",
                )
            },
            timeout=30.0,
        )

        if response.status_code >= 400:
            detail = response.json().get("error", {}).get("message") if response.headers.get("content-type", "").startswith("application/json") else response.text
            raise CloudinaryUploadError(detail or "Cloudinary upload failed.")

        payload = response.json()
        secure_url = payload.get("secure_url")
        public_id = payload.get("public_id")
        if not secure_url or not public_id:
            raise CloudinaryUploadError("Cloudinary response did not include a usable asset URL.")

        return CloudinaryUploadResult(secure_url=secure_url, public_id=public_id)

    @staticmethod
    def _sign_upload(*, folder: str, timestamp: int, api_secret: str) -> str:
        params_to_sign = f"folder={folder}&timestamp={timestamp}"
        return hashlib.sha1(f"{params_to_sign}{api_secret}".encode("utf-8")).hexdigest()


cloudinary_upload_service = CloudinaryUploadService()
