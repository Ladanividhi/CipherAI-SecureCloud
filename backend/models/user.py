from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class UserModel(BaseModel):
    uid: str
    email: str | None = None
    name: str | None = None
    picture: str | None = None

    # Added as requested
    public_key: str | None = None

    # Existing Firestore fields used by the app
    lastLogin: Any | None = None
    createdAt: Any | None = None
