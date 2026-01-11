from __future__ import annotations

import base64
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Tuple

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from firebase_admin import firestore

from core.constants import FILES_COLLECTION, MAX_UPLOAD_FILES
from core.crypto import ensure_rsa_keys
from core.paths import (
    DECRYPTED_DIR,
    ENCRYPTED_DIR,
    PRIVATE_KEY_PATH,
    PUBLIC_KEY_PATH,
    UPLOADS_DIR,
)
from core.security import UserContext, get_current_user
from decrypt_file import decrypt_file
from encrypt_file import encrypt_file
from firebase_admin_init import firebase_db
from models.files import FileModel
from models.tag import TAGS_COLLECTION


router = APIRouter(tags=["files"])


def sanitize_filename(filename: str) -> str:
    import re
    from fastapi import HTTPException
    from pathlib import Path

    if not filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    candidate = Path(filename).name
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", candidate)
    if not safe_name:
        raise HTTPException(status_code=400, detail="Filename is not valid")
    return safe_name


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


@router.get("/tags")
def list_tags(_user: UserContext = Depends(get_current_user)):
    query = firebase_db.collection(TAGS_COLLECTION).stream()
    items: list[Dict[str, Any]] = []
    for doc in query:
        payload = doc.to_dict() or {}
        payload.setdefault("tag_id", doc.id)
        items.append(payload)
    items.sort(key=lambda item: ((item.get("tag_name") or item.get("tag_id") or "").lower()))
    return {"tags": items}


@router.post("/upload")
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
        last_opened_at=None,
        tag_id=None,
        expiry_time=None,
        advance_security=False,
        aes_key=None,
    )
    # Preserve original Firestore field names (including typos used by frontend/backward-compat)
    doc_ref.set(
        {
            "uid": record.uid,
            "file_name": record.file_name,
            "size": record.size,
            "uploaded_at": record.uploaded_at,
            "last_opemed_at": None,
            "tad_id": None,
            "expiry_time": None,
            "advance_seciroty": False,
            "aes_key": None,
        },
        merge=True,
    )

    return {
        "file_name": safe_source_name,
        "size": destination.stat().st_size,
        "stored_filename": safe_source_name,
        "size_bytes": destination.stat().st_size,
        "directory": "uploads",
    }


@router.post("/upload/multiple")
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


@router.post("/encrypt")
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


@router.post("/decrypt")
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


@router.get("/files")
def list_files(_user: UserContext = Depends(get_current_user)):
    query = (
        firebase_db.collection(FILES_COLLECTION)
        .where("uid", "==", _user.uid)
        .stream()
    )
    items = [_serialize_file_doc(doc) for doc in query]
    items.sort(key=lambda item: ((item.get("file_name") or item.get("filename") or "").lower()))
    return {"files": items}


@router.get("/download/{category}/{filename}")
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
