from __future__ import annotations

import base64
from datetime import datetime
from typing import Any, Dict

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import firestore
from pydantic import BaseModel

from firebase_admin_init import firebase_auth, firebase_db
from models.user import UserModel

from .paths import PUBLIC_KEY_PATH, PRIVATE_KEY_PATH
from .crypto import ensure_rsa_keys


security = HTTPBearer(auto_error=False)


class UserContext(BaseModel):
    uid: str
    email: str | None = None
    name: str | None = None
    picture: str | None = None


def _verify_token(id_token: str) -> Dict[str, Any]:
    try:
        return firebase_auth.verify_id_token(id_token)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc


def _build_user_context(decoded_token: Dict[str, Any]) -> UserContext:
    return UserContext(
        uid=decoded_token.get("uid") or decoded_token.get("sub"),
        email=decoded_token.get("email"),
        name=decoded_token.get("name") or decoded_token.get("display_name"),
        picture=decoded_token.get("picture") or decoded_token.get("photo_url"),
    )


def _sync_user_profile(decoded_token: Dict[str, Any]) -> None:
    uid = decoded_token.get("uid") or decoded_token.get("sub")
    if not uid:
        raise HTTPException(status_code=400, detail="Token missing uid")

    doc_ref = firebase_db.collection("users").document(uid)
    snapshot = doc_ref.get()

    ensure_rsa_keys(PUBLIC_KEY_PATH, PRIVATE_KEY_PATH)
    public_key: str | None = None
    if PUBLIC_KEY_PATH.exists():
        public_key = PUBLIC_KEY_PATH.read_text(encoding="utf-8")

    profile = UserModel(
        uid=uid,
        email=decoded_token.get("email"),
        name=decoded_token.get("name") or decoded_token.get("display_name"),
        picture=decoded_token.get("picture") or decoded_token.get("photo_url"),
        public_key=public_key,
        lastLogin=firestore.SERVER_TIMESTAMP,
        createdAt=None,
    ).dict(exclude_none=True)

    if not snapshot.exists:
        profile["createdAt"] = firestore.SERVER_TIMESTAMP

    doc_ref.set(profile, merge=True)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> UserContext:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    decoded = _verify_token(credentials.credentials)
    _sync_user_profile(decoded)
    return _build_user_context(decoded)
