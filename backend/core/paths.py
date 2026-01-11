from __future__ import annotations

from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BASE_DIR.parent
FILES_DIR = ROOT_DIR / "files"
UPLOADS_DIR = FILES_DIR / "uploads"
ENCRYPTED_DIR = FILES_DIR / "encrypted"
DECRYPTED_DIR = FILES_DIR / "decrypted"
KEYS_DIR = ROOT_DIR / "keys"
PUBLIC_KEY_PATH = KEYS_DIR / "public.pem"
PRIVATE_KEY_PATH = KEYS_DIR / "private.pem"

# Ensure expected directories exist (mirrors original behavior)
for directory in (UPLOADS_DIR, ENCRYPTED_DIR, DECRYPTED_DIR):
    directory.mkdir(parents=True, exist_ok=True)
