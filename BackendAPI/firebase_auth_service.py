from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from jwt import InvalidTokenError
from pydantic import BaseModel
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


class FirebaseIdentity(BaseModel):
    uid: str
    email: str
    display_name: str | None = None


@lru_cache(maxsize=1)
def _firebase_auth_client() -> Any | None:
    try:
        import firebase_admin
        from firebase_admin import auth, credentials
    except ModuleNotFoundError:
        return None

    service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    service_account_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip() or None

    if not service_account_json and not service_account_path and not project_id:
        return None

    options = {"projectId": project_id} if project_id else None

    try:
        firebase_admin.get_app()
    except ValueError:
        if service_account_json:
            service_account_info = json.loads(service_account_json)
            credential = credentials.Certificate(service_account_info)
            firebase_admin.initialize_app(credential, options=options)
        elif service_account_path:
            credential = credentials.Certificate(service_account_path)
            firebase_admin.initialize_app(credential, options=options)
        else:
            credential = credentials.ApplicationDefault()
            firebase_admin.initialize_app(credential, options=options)

    return auth


def verify_firebase_id_token(token: str) -> FirebaseIdentity | None:
    auth_client = _firebase_auth_client()
    if auth_client is None:
        return None

    try:
        decoded_token = auth_client.verify_id_token(token)
    except Exception as exc:
        raise InvalidTokenError("Invalid Firebase authentication token") from exc

    uid = decoded_token.get("uid") or decoded_token.get("sub")
    email = decoded_token.get("email")
    display_name = decoded_token.get("name")

    if not isinstance(uid, str) or not uid:
        raise InvalidTokenError("Firebase token is missing a UID")
    if not isinstance(email, str) or not email:
        raise InvalidTokenError("Firebase token is missing an email")
    if display_name is not None and not isinstance(display_name, str):
        display_name = None

    return FirebaseIdentity(uid=uid, email=email, display_name=display_name)


def update_firebase_user_display_name(firebase_uid: str, display_name: str) -> None:
    auth_client = _firebase_auth_client()
    if auth_client is None:
        raise RuntimeError("Firebase Admin is not configured")
    auth_client.update_user(firebase_uid, display_name=display_name)


def delete_firebase_user(firebase_uid: str) -> None:
    auth_client = _firebase_auth_client()
    if auth_client is None:
        raise RuntimeError("Firebase Admin is not configured")
    auth_client.delete_user(firebase_uid)
