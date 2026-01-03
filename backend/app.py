
from __future__ import annotations

import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Tuple

import uvicorn
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import firestore
from pydantic import BaseModel

from decrypt_file import decrypt_file
from encrypt_file import encrypt_file
from firebase_admin_init import firebase_auth, firebase_db

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
FILES_DIR = ROOT_DIR / "files"
UPLOADS_DIR = FILES_DIR / "uploads"
ENCRYPTED_DIR = FILES_DIR / "encrypted"
DECRYPTED_DIR = FILES_DIR / "decrypted"
KEYS_DIR = ROOT_DIR / "keys"
PUBLIC_KEY_PATH = KEYS_DIR / "public.pem"
PRIVATE_KEY_PATH = KEYS_DIR / "private.pem"

for directory in (UPLOADS_DIR, ENCRYPTED_DIR, DECRYPTED_DIR):
    directory.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Secure File Service", version="1.0.0")

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if ALLOWED_ORIGINS == ["*"] else ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


security = HTTPBearer(auto_error=False)


class UserContext(BaseModel):
    uid: str
    email: str | None = None
    name: str | None = None
    picture: str | None = None


class TokenPayload(BaseModel):
    id_token: str


class EncryptPayload(BaseModel):
    filename: str


class DecryptPayload(BaseModel):
    filename: str | None = None
    encrypted_filename: str | None = None
    key_filename: str | None = None
    output_filename: str | None = None


USERS_COLLECTION = "users"
FILES_COLLECTION = "user_files"


def sanitize_filename(filename: str) -> str:
    if not filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    candidate = Path(filename).name
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", candidate)
    if not safe_name:
        raise HTTPException(status_code=400, detail="Filename is not valid")
    return safe_name


def ensure_key_exists(path: Path, key_type: str) -> None:
    if not path.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Missing {key_type} at {path}. Run generate_keys.py first.",
        )


def _file_doc_ref(uid: str, filename: str) -> Tuple[str, Any]:
    safe_name = sanitize_filename(filename)
    doc_id = f"{uid}:{safe_name}"
    return safe_name, firebase_db.collection(FILES_COLLECTION).document(doc_id)


def _serialize_timestamp(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _serialize_file_doc(doc: Any) -> Dict[str, Any]:
    payload = doc.to_dict() or {}
    payload["id"] = doc.id
    for field in ("uploaded_at", "last_decrypted_at"):
        if field in payload:
            payload[field] = _serialize_timestamp(payload[field])
    return payload


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

    doc_ref = firebase_db.collection(USERS_COLLECTION).document(uid)
    snapshot = doc_ref.get()

    profile: Dict[str, Any] = {
        "uid": uid,
        "email": decoded_token.get("email"),
        "name": decoded_token.get("name") or decoded_token.get("display_name"),
        "picture": decoded_token.get("picture") or decoded_token.get("photo_url"),
        "lastLogin": firestore.SERVER_TIMESTAMP,
    }

    if not snapshot.exists:
        profile["createdAt"] = firestore.SERVER_TIMESTAMP

    sanitized = {key: value for key, value in profile.items() if value is not None}
    doc_ref.set(sanitized, merge=True)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> UserContext:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    decoded = _verify_token(credentials.credentials)
    _sync_user_profile(decoded)
    return _build_user_context(decoded)


@app.post("/auth/verify")
def verify_token(payload: TokenPayload) -> UserContext:
    decoded = _verify_token(payload.id_token)
    return _build_user_context(decoded)


@app.get("/auth/me")
def auth_me(current_user: UserContext = Depends(get_current_user)) -> UserContext:
    return current_user


@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    _user: UserContext = Depends(get_current_user),
):
    safe_source_name = sanitize_filename(file.filename or "upload.bin")
    destination = UPLOADS_DIR / safe_source_name

    if destination.exists():
        raise HTTPException(status_code=409, detail="A file with this name already exists.")

    with destination.open("wb") as buffer:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            buffer.write(chunk)

    _, doc_ref = _file_doc_ref(_user.uid, safe_source_name)
    doc_ref.set(
        {
            "uid": _user.uid,
            "filename": safe_source_name,
            "size_bytes": destination.stat().st_size,
            "status": "uploaded",
            "uploaded_at": firestore.SERVER_TIMESTAMP,
        },
        merge=True,
    )

    return {
        "stored_filename": safe_source_name,
        "size_bytes": destination.stat().st_size,
        "directory": "uploads",
    }


@app.post("/encrypt")
def encrypt_endpoint(
    payload: EncryptPayload,
    _user: UserContext = Depends(get_current_user),
):
    ensure_key_exists(PUBLIC_KEY_PATH, "public key")
    source_name, doc_ref = _file_doc_ref(_user.uid, payload.filename)

    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="File metadata not found for user")

    source_path = UPLOADS_DIR / source_name

    if not source_path.exists():
        raise HTTPException(status_code=404, detail="Source file not found in uploads")

    encrypted_name = f"{source_name}.enc"
    encrypted_key_name = f"{source_name}.key"

    encrypted_path = ENCRYPTED_DIR / encrypted_name
    encrypted_key_path = ENCRYPTED_DIR / encrypted_key_name

    encrypt_file(
        input_path=source_path,
        output_path=encrypted_path,
        public_key_path=PUBLIC_KEY_PATH,
        encrypted_key_path=encrypted_key_path,
    )

    doc_ref.set(
        {
            "status": "encrypted",
            "encrypted_filename": encrypted_name,
            "encrypted_key_filename": encrypted_key_name,
        },
        merge=True,
    )

    return {
        "encrypted_filename": encrypted_name,
        "encrypted_key_filename": encrypted_key_name,
        "directory": "encrypted",
    }


@app.post("/decrypt")
def decrypt_endpoint(
    payload: DecryptPayload,
    _user: UserContext = Depends(get_current_user),
):
    ensure_key_exists(PRIVATE_KEY_PATH, "private key")

    if payload.filename:
        base_name = sanitize_filename(payload.filename)
        encrypted_name = f"{base_name}.enc"
    elif payload.encrypted_filename:
        encrypted_name = sanitize_filename(payload.encrypted_filename)
        base_name = sanitize_filename(Path(encrypted_name).stem)
    else:
        raise HTTPException(status_code=400, detail="filename or encrypted_filename is required")

    _, doc_ref = _file_doc_ref(_user.uid, base_name)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="File metadata not found for user")

    encrypted_path = ENCRYPTED_DIR / encrypted_name
    if not encrypted_path.exists():
        raise HTTPException(status_code=404, detail="Encrypted file not found")

    if payload.key_filename:
        key_name = sanitize_filename(payload.key_filename)
    else:
        key_name = f"{Path(encrypted_name).stem}.key"
    encrypted_key_path = ENCRYPTED_DIR / key_name

    if not encrypted_key_path.exists():
        raise HTTPException(status_code=404, detail="Encrypted AES key not found")

    if payload.output_filename:
        output_name = sanitize_filename(payload.output_filename)
    else:
        output_name = base_name

    output_path = DECRYPTED_DIR / output_name

    decrypt_file(
        encrypted_file_path=encrypted_path,
        encrypted_key_path=encrypted_key_path,
        output_path=output_path,
        private_key_path=PRIVATE_KEY_PATH,
    )

    doc_ref.set(
        {
            "status": "decrypted",
            "decrypted_filename": output_name,
            "last_decrypted_at": firestore.SERVER_TIMESTAMP,
        },
        merge=True,
    )

    return {"decrypted_filename": output_name, "directory": "decrypted"}


@app.get("/files")
def list_files(_user: UserContext = Depends(get_current_user)):
    query = (
        firebase_db.collection(FILES_COLLECTION)
        .where("uid", "==", _user.uid)
        .stream()
    )
    items = [_serialize_file_doc(doc) for doc in query]
    items.sort(key=lambda item: (item.get("filename") or "").lower())
    return {"files": items}


@app.get("/download/{category}/{filename}")
def download_file(
    category: str,
    filename: str,
    _user: UserContext = Depends(get_current_user),
):
    directories = {
        "uploads": UPLOADS_DIR,
        "encrypted": ENCRYPTED_DIR,
        "decrypted": DECRYPTED_DIR,
    }

    if category not in directories:
        raise HTTPException(status_code=400, detail="Unknown category")

    safe_name = sanitize_filename(filename)

    base_name = safe_name
    if category == "encrypted" and safe_name.endswith(".enc"):
        base_name = sanitize_filename(Path(safe_name).stem)
    elif category == "decrypted":
        base_name = sanitize_filename(Path(safe_name).name)

    _, doc_ref = _file_doc_ref(_user.uid, base_name)
    doc_snapshot = doc_ref.get()
    if not doc_snapshot.exists:
        raise HTTPException(status_code=404, detail="File metadata not found for user")

    doc = doc_snapshot.to_dict() or {}
    linked_name = {
        "uploads": doc.get("filename"),
        "encrypted": doc.get("encrypted_filename"),
        "decrypted": doc.get("decrypted_filename"),
    }.get(category)

    if linked_name != safe_name:
        raise HTTPException(status_code=403, detail="Access denied for requested file")

    file_path = directories[category] / safe_name

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(path=file_path, filename=file_path.name)


if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
