from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class FileModel(BaseModel):
    file_name: str
    last_opened_at: Any | None = None
    size: int
    uid: str
    uploaded_at: Any 
    tag_id: str | None = None
    expiry_time: Any | None = None
    advance_security: bool = False
    aes_key: str 
