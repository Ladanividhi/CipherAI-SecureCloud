from __future__ import annotations

from pathlib import Path

import firebase_admin
from firebase_admin import auth, credentials, firestore

BASE_DIR = Path(__file__).resolve().parent
SERVICE_ACCOUNT_PATH = BASE_DIR / "firebase_key.json"

if not firebase_admin._apps:
    cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
    firebase_admin.initialize_app(cred)

firebase_auth = auth
firebase_db = firestore.client()
