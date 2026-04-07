from __future__ import annotations

import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet

from app.core.config import get_settings


def _derive_fernet_key(raw_key: str) -> bytes:
    digest = hashlib.sha256(raw_key.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


@lru_cache(maxsize=1)
def get_auction_cipher() -> Fernet:
    settings = get_settings()
    return Fernet(_derive_fernet_key(settings.auction_account_encryption_key))


def encrypt_auction_account_number(account_number: str) -> str:
    cipher = get_auction_cipher()
    return cipher.encrypt(account_number.encode("utf-8")).decode("utf-8")


def mask_account_number(account_number: str) -> str:
    compact = "".join(ch for ch in account_number if ch.isdigit())
    if not compact:
        return "****"
    if len(compact) <= 2:
        return "*" * len(compact)
    return f"{'*' * (len(compact) - 2)}{compact[-2:]}"
