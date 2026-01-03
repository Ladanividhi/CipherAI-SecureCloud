
from __future__ import annotations

import json
import os
import re
import base64
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Tuple

import uvicorn
from fastapi import Body, Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import firestore
from pydantic import BaseModel
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from decrypt_file import decrypt_file
from encrypt_file import encrypt_file
from firebase_admin_init import firebase_auth, firebase_db

from models.files import FileModel
from models.tag import TAGS_COLLECTION
from models.user import UserModel

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


USERS_COLLECTION = "users"
FILES_COLLECTION = "user_files"
MAX_UPLOAD_FILES = 15


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


def ensure_rsa_keys(public_key_path: Path, private_key_path: Path) -> None:
    """Ensure RSA key material exists for local encryption/decryption.

    - If both keys are missing, generates a fresh keypair.
    - If private exists but public is missing, derives public from private.
    - If public exists but private is missing, refuses (cannot decrypt previous files).
    """

    if private_key_path.exists():
        if not public_key_path.exists():
            private_key = serialization.load_pem_private_key(
                private_key_path.read_bytes(),
                password=None,
            )
            public_key = private_key.public_key()
            public_pem = public_key.public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
            )
            public_key_path.parent.mkdir(parents=True, exist_ok=True)
            public_key_path.write_bytes(public_pem)
        return

    if public_key_path.exists() and not private_key_path.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Missing private key at {private_key_path}. Cannot decrypt without it.",
        )

    # Neither exists: generate a new pair.
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()

    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    private_key_path.parent.mkdir(parents=True, exist_ok=True)
    public_key_path.parent.mkdir(parents=True, exist_ok=True)
    private_key_path.write_bytes(private_pem)
    public_key_path.write_bytes(public_pem)


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
    for field in ("uploaded_at", "last_opemed_at", "expiry_time"):
        if field in payload:
            payload[field] = _serialize_timestamp(payload[field])
    return payload


def _parse_expiry(expiry_value: Any) -> Any | None:
    if expiry_value is None:
        return None
    if isinstance(expiry_value, datetime):
        return expiry_value
    if not isinstance(expiry_value, str):
        return None
    value = expiry_value.strip()
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return value


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


@app.post("/auth/verify")
def verify_token(id_token: str = Body(..., embed=True)) -> UserContext:
    decoded = _verify_token(id_token)
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
    record = FileModel(
        uid=_user.uid,
        file_name=safe_source_name,
        size=destination.stat().st_size,
        uploaded_at=firestore.SERVER_TIMESTAMP,
        last_opemed_at=None,
        tad_id=None,
        expiry_time=None,
        advance_seciroty=False,
        aes_key=None,
    )
    doc_ref.set(
        record.dict(),
        merge=True,
    )

    return {
        "file_name": safe_source_name,
        "size": destination.stat().st_size,
        # Backwards-compatible aliases used by the existing frontend.
        "stored_filename": safe_source_name,
        "size_bytes": destination.stat().st_size,
        "directory": "uploads",
    }


@app.get("/tags")
def list_tags(_user: UserContext = Depends(get_current_user)):
    query = firebase_db.collection(TAGS_COLLECTION).stream()
    items: list[Dict[str, Any]] = []
    for doc in query:
        payload = doc.to_dict() or {}
        payload.setdefault("tag_id", doc.id)
        items.append(payload)
    items.sort(key=lambda item: (item.get("tag_name") or item.get("tag_id") or "").lower())
    return {"tags": items}


@app.post("/upload/multiple")
async def upload_files_multiple(
    files: list[UploadFile] = File(...),
    metadata: str = Form(...),
    _user: UserContext = Depends(get_current_user),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    if len(files) > MAX_UPLOAD_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum allowed files per upload is {MAX_UPLOAD_FILES}.",
        )

    try:
        parsed = json.loads(metadata)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid metadata JSON") from exc

    meta_by_index: list[Dict[str, Any]] | None = None
    meta_by_name: Dict[str, Dict[str, Any]] | None = None

    if isinstance(parsed, list):
        meta_by_index = [item for item in parsed if isinstance(item, dict)]
    elif isinstance(parsed, dict):
        meta_by_name = {
            str(key): value
            for key, value in parsed.items()
            if isinstance(value, dict)
        }
    else:
        raise HTTPException(status_code=400, detail="metadata must be a list or object")

    results: list[Dict[str, Any]] = []

    for index, upload in enumerate(files):
        original_name = upload.filename or "upload.bin"
        safe_source_name = sanitize_filename(original_name)

        item_meta: Dict[str, Any] = {}
        if meta_by_index is not None:
            if index < len(meta_by_index):
                item_meta = meta_by_index[index]
        elif meta_by_name is not None:
            item_meta = meta_by_name.get(original_name) or meta_by_name.get(safe_source_name) or {}

        tag_id = item_meta.get("tag_id")
        expiry_time_raw = item_meta.get("expiry_time")

        if not isinstance(tag_id, str) or not tag_id.strip():
            raise HTTPException(status_code=400, detail=f"Missing tag for {original_name}.")
        expiry_time = _parse_expiry(expiry_time_raw)
        if expiry_time is None:
            raise HTTPException(status_code=400, detail=f"Missing expiry time for {original_name}.")

        destination = UPLOADS_DIR / safe_source_name
        if destination.exists():
            raise HTTPException(
                status_code=409,
                detail=f"A file with this name already exists: {safe_source_name}.",
            )

        with destination.open("wb") as buffer:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                buffer.write(chunk)

        _, doc_ref = _file_doc_ref(_user.uid, safe_source_name)
        record = {
            "uid": _user.uid,
            "file_name": safe_source_name,
            "size": destination.stat().st_size,
            "uploaded_at": firestore.SERVER_TIMESTAMP,
            "last_opemed_at": None,
            "tag_id": tag_id.strip(),
            "expiry_time": expiry_time,
            "advance_security": False,
            "aes_key": None,
        }
        doc_ref.set(record, merge=True)

        results.append(
            {
                "file_name": safe_source_name,
                "size": destination.stat().st_size,
                "stored_filename": safe_source_name,
                "size_bytes": destination.stat().st_size,
                "directory": "uploads",
            }
        )

    return {"files": results}


@app.post("/encrypt")
def encrypt_endpoint(
    body: Dict[str, Any] = Body(...),
    _user: UserContext = Depends(get_current_user),
):
    ensure_rsa_keys(PUBLIC_KEY_PATH, PRIVATE_KEY_PATH)
    request_name = body.get("file_name") or body.get("filename")
    if not isinstance(request_name, str) or not request_name.strip():
        raise HTTPException(status_code=400, detail="file_name is required")

    source_name, doc_ref = _file_doc_ref(_user.uid, request_name)

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

    encrypted_aes_key_b64 = base64.b64encode(encrypted_key_path.read_bytes()).decode("ascii")

    doc_ref.set(
        {
            "aes_key": encrypted_aes_key_b64,
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
    body: Dict[str, Any] = Body(...),
    _user: UserContext = Depends(get_current_user),
):
    ensure_rsa_keys(PUBLIC_KEY_PATH, PRIVATE_KEY_PATH)

    request_name = body.get("file_name") or body.get("filename")
    if not isinstance(request_name, str) or not request_name.strip():
        raise HTTPException(status_code=400, detail="file_name is required")

    base_name = sanitize_filename(request_name)
    encrypted_name = f"{base_name}.enc"

    _, doc_ref = _file_doc_ref(_user.uid, base_name)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="File metadata not found for user")

    encrypted_path = ENCRYPTED_DIR / encrypted_name
    if not encrypted_path.exists():
        raise HTTPException(status_code=404, detail="Encrypted file not found")

    encrypted_key_path = ENCRYPTED_DIR / f"{base_name}.key"

    doc_snapshot = doc_ref.get()
    doc_payload = doc_snapshot.to_dict() or {}
    stored_aes_key = doc_payload.get("aes_key")
    if (not encrypted_key_path.exists()) and stored_aes_key:
        try:
            encrypted_key_path.write_bytes(base64.b64decode(stored_aes_key))
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail="Stored AES key is invalid") from exc

    if not encrypted_key_path.exists():
        raise HTTPException(status_code=404, detail="Encrypted AES key not found")

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
            "last_opemed_at": firestore.SERVER_TIMESTAMP,
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
    items.sort(key=lambda item: ((item.get("file_name") or item.get("filename") or "").lower()))
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
    owned_name = doc.get("file_name") or doc.get("filename")
    expected_name = {
        "uploads": owned_name,
        "encrypted": f"{owned_name}.enc" if owned_name else None,
        "decrypted": owned_name,
    }.get(category)

    if expected_name != safe_name:
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
