from __future__ import annotations

import os


USERS_COLLECTION = "users"
FILES_COLLECTION = "user_files"
MAX_UPLOAD_FILES = 15

DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

ENV_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

ALLOWED_ORIGINS = ENV_ALLOWED_ORIGINS or DEFAULT_ALLOWED_ORIGINS
