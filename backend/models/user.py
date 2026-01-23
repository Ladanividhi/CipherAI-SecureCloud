from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class UserModel(BaseModel):
    uid: str
    email: str 
    name: str | None = None
    picture: str | None = None
    public_key: str
    lastLogin: Any | None = None
    createdAt: Any 
