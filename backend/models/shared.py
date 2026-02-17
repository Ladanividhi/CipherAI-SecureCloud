from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class SharedFileModel(BaseModel):
    owner_id: str
    shared_user_id: str
    file_id: str
    aes_key_shared: str
    permissions: str = "view"
    sharedExpiryTime: Any | None = None
    createdAt: Any | None = None
