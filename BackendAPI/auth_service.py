from __future__ import annotations

import base64
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

import jwt
from pydantic import BaseModel

from app_config import DEFAULT_DEVELOPMENT_JWT_SECRET

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", DEFAULT_DEVELOPMENT_JWT_SECRET)
JWT_ALGORITHM = "HS256"
JWT_ACCESS_EXPIRATION_MINUTES = int(os.getenv("JWT_ACCESS_EXPIRATION_MINUTES", "60"))
JWT_REFRESH_EXPIRATION_DAYS = int(os.getenv("JWT_REFRESH_EXPIRATION_DAYS", "7"))
SALT_BYTES = 16
SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_DKLEN = 64


class AuthenticatedUser(BaseModel):
    id: str
    email: str
    display_name: str
    is_active: bool


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64decode(data: str) -> bytes:
    padding = "=" * ((4 - len(data) % 4) % 4)
    return base64.urlsafe_b64decode(f"{data}{padding}".encode("ascii"))


def hash_password(password: str) -> str:
    salt = os.urandom(SALT_BYTES)
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_DKLEN,
    )
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${_b64encode(salt)}${_b64encode(derived)}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, n_raw, r_raw, p_raw, salt_raw, digest_raw = password_hash.split("$", maxsplit=5)
        if algorithm != "scrypt":
            return False

        salt = _b64decode(salt_raw)
        expected = _b64decode(digest_raw)
        derived = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=int(n_raw),
            r=int(r_raw),
            p=int(p_raw),
            dklen=len(expected),
        )
        return hmac.compare_digest(derived, expected)
    except (ValueError, TypeError):
        return False


def create_access_token(*, user_id: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "jti": str(uuid4()),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=JWT_ACCESS_EXPIRATION_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    if not isinstance(payload, dict):
        raise jwt.InvalidTokenError("Invalid token payload")
    if payload.get("type") != "access":
        raise jwt.InvalidTokenError("Invalid access token type")
    return payload


def create_refresh_token(*, user_id: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": user_id,
        "email": email,
        "type": "refresh",
        "jti": str(uuid4()),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=JWT_REFRESH_EXPIRATION_DAYS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_refresh_token(token: str) -> dict[str, Any]:
    payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    if not isinstance(payload, dict):
        raise jwt.InvalidTokenError("Invalid token payload")
    if payload.get("type") != "refresh":
        raise jwt.InvalidTokenError("Invalid refresh token type")
    return payload
