from __future__ import annotations

from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BASE_DIR.parent
KEYS_DIR = ROOT_DIR / "keys"
PUBLIC_KEY_PATH = KEYS_DIR / "public.pem"
PRIVATE_KEY_PATH = KEYS_DIR / "private.pem"

# Ensure the keys directory exists (RSA keys are still stored locally).
KEYS_DIR.mkdir(parents=True, exist_ok=True)
