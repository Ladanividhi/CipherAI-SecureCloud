from __future__ import annotations

import base64
import json
import mimetypes
from datetime import datetime
from typing import Any, Dict, Tuple

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from firebase_admin import firestore

from core.constants import FILES_COLLECTION, MAX_UPLOAD_FILES
from core.crypto import ensure_rsa_keys
from core.paths import PRIVATE_KEY_PATH, PUBLIC_KEY_PATH
from core.s3 import delete_file_objects, download_bytes, upload_bytes
from core.security import UserContext, get_current_user
from decrypt_file import decrypt_bytes
from encrypt_file import encrypt_bytes
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
    if "last_opemed_at" in payload and "last_opened_at" not in payload:
        payload["last_opened_at"] = payload["last_opemed_at"]
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
    """Upload a single file: encrypt in memory → store encrypted blob + key in S3."""
    ensure_rsa_keys(PUBLIC_KEY_PATH, PRIVATE_KEY_PATH)
    safe_source_name = sanitize_filename(file.filename or "upload.bin")

    _, doc_ref = _file_doc_ref(_user.uid, safe_source_name)
    if doc_ref.get().exists:
        raise HTTPException(status_code=409, detail="A file with this name already exists.")

    # Read entire file into memory
    raw_bytes = await file.read()
    file_size = len(raw_bytes)

    # Encrypt in memory
    public_key_pem = PUBLIC_KEY_PATH.read_bytes()
    encrypted_blob, encrypted_aes_key = encrypt_bytes(raw_bytes, public_key_pem)

    # Upload encrypted blob to S3 (AES key is stored in Firestore only)
    upload_bytes(_user.uid, safe_source_name, encrypted_blob, suffix=".enc")

    encrypted_aes_key_b64 = base64.b64encode(encrypted_aes_key).decode("ascii")

    doc_ref.set(
        {
            "uid": _user.uid,
            "file_name": safe_source_name,
            "size": file_size,
            "uploaded_at": firestore.SERVER_TIMESTAMP,
            "last_opemed_at": None,
            "tag_id": None,
            "expiry_time": None,
            "advance_security": False,
            "aes_key": encrypted_aes_key_b64,
        },
        merge=True,
    )

    return {
        "file_name": safe_source_name,
        "size": file_size,
        "stored_filename": safe_source_name,
        "size_bytes": file_size,
    }


@router.post("/upload/multiple")
async def upload_files_multiple(
    files: list[UploadFile] = File(...),
    metadata: str = Form(...),
    _user: UserContext = Depends(get_current_user),
):
    """Upload multiple files: encrypt each in memory → store in S3."""
    ensure_rsa_keys(PUBLIC_KEY_PATH, PRIVATE_KEY_PATH)

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

    public_key_pem = PUBLIC_KEY_PATH.read_bytes()
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

        tag_id_raw = item_meta.get("tag_id")
        expiry_time_raw = item_meta.get("expiry_time")
        advance_security_raw = item_meta.get("advance_security")

        tag_id: str | None = None
        if isinstance(tag_id_raw, str) and tag_id_raw.strip():
          tag_id = tag_id_raw.strip()

        expiry_time = _parse_expiry(expiry_time_raw)

        advance_security = True
        if isinstance(advance_security_raw, bool):
            advance_security = advance_security_raw

        _, doc_ref = _file_doc_ref(_user.uid, safe_source_name)
        if doc_ref.get().exists:
            raise HTTPException(
                status_code=409,
                detail=f"A file with this name already exists: {safe_source_name}.",
            )

        # Read file bytes into memory
        raw_bytes = await upload.read()
        file_size = len(raw_bytes)

        # Encrypt in memory
        encrypted_blob, encrypted_aes_key = encrypt_bytes(raw_bytes, public_key_pem)

        # Upload encrypted blob to S3 (AES key stored in Firestore only)
        upload_bytes(_user.uid, safe_source_name, encrypted_blob, suffix=".enc")

        encrypted_aes_key_b64 = base64.b64encode(encrypted_aes_key).decode("ascii")

        record = {
            "uid": _user.uid,
            "file_name": safe_source_name,
            "size": file_size,
            "uploaded_at": firestore.SERVER_TIMESTAMP,
            "last_opemed_at": None,
            "tag_id": tag_id,
            "expiry_time": expiry_time,
            "advance_security": advance_security,
            "aes_key": encrypted_aes_key_b64,
        }
        doc_ref.set(record, merge=True)

        results.append(
            {
                "file_name": safe_source_name,
                "size": file_size,
                "stored_filename": safe_source_name,
                "size_bytes": file_size,
            }
        )

    return {"files": results}


@router.post("/encrypt")
def encrypt_endpoint(
    body: Dict[str, Any] = Body(...),
    _user: UserContext = Depends(get_current_user),
):
    """No-op kept for backward compatibility.

    Encryption now happens at upload time. This returns a success stub
    so the frontend's existing upload → encrypt flow doesn't break.
    """
    request_name = body.get("file_name") or body.get("filename")
    if not isinstance(request_name, str) or not request_name.strip():
        raise HTTPException(status_code=400, detail="file_name is required")

    source_name = sanitize_filename(request_name)
    return {
        "encrypted_filename": f"{source_name}.enc",
        "encrypted_key_filename": f"{source_name}.key",
        "message": "Encryption was already performed at upload time.",
    }


@router.post("/decrypt")
def decrypt_endpoint(
    body: Dict[str, Any] = Body(...),
    _user: UserContext = Depends(get_current_user),
):
    """Fetch encrypted file + key from S3, decrypt in memory, return the file bytes.

    Flow: S3(encrypted blob) + S3(encrypted AES key) → decrypt_bytes → Response
    """
    ensure_rsa_keys(PUBLIC_KEY_PATH, PRIVATE_KEY_PATH)

    request_name = body.get("file_name") or body.get("filename")
    if not isinstance(request_name, str) or not request_name.strip():
        raise HTTPException(status_code=400, detail="file_name is required")

    base_name = sanitize_filename(request_name)
    _, doc_ref = _file_doc_ref(_user.uid, base_name)
    doc_snapshot = doc_ref.get()
    if not doc_snapshot.exists:
        raise HTTPException(status_code=404, detail="File metadata not found for user")

    # Retrieve encrypted AES key from Firestore
    doc_payload = doc_snapshot.to_dict() or {}
    stored_key_b64 = doc_payload.get("aes_key")
    if not stored_key_b64:
        raise HTTPException(status_code=404, detail="Encrypted AES key not found")
    try:
        encrypted_aes_key = base64.b64decode(stored_key_b64)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Stored AES key is invalid") from exc

    # Download encrypted blob from S3
    try:
        encrypted_blob = download_bytes(_user.uid, base_name, suffix=".enc")
    except HTTPException:
        raise HTTPException(status_code=404, detail="Encrypted file not found in storage")

    # Decrypt in memory
    private_key_pem = PRIVATE_KEY_PATH.read_bytes()
    try:
        plaintext = decrypt_bytes(encrypted_blob, encrypted_aes_key, private_key_pem)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Decryption failed: {exc}") from exc

    # Update last-opened timestamp
    doc_ref.set({"last_opemed_at": firestore.SERVER_TIMESTAMP}, merge=True)

    # Guess content type for the response
    content_type, _ = mimetypes.guess_type(base_name)
    if not content_type:
        content_type = "application/octet-stream"

    return Response(
        content=plaintext,
        media_type=content_type,
        headers={
            "Content-Disposition": f'inline; filename="{base_name}"',
        },
    )


@router.get("/files/search")
def search_files(q: str = "", _user: UserContext = Depends(get_current_user)):
    """Search all user files by name and return results with folder path."""
    query_str = (q or "").strip().lower()
    if not query_str:
        return {"results": []}

    # Fetch all user files
    docs = (
        firebase_db.collection(FILES_COLLECTION)
        .where("uid", "==", _user.uid)
        .stream()
    )
    all_files = [_serialize_file_doc(doc) for doc in docs]

    # Build tag_id -> tag_name map
    tag_docs = firebase_db.collection(TAGS_COLLECTION).stream()
    tag_map: Dict[str, str] = {}
    for td in tag_docs:
        tp = td.to_dict() or {}
        tag_map[td.id] = tp.get("tag_name") or td.id

    # Filter by search query
    results = []
    for f in all_files:
        fname = f.get("file_name") or f.get("filename") or ""
        if query_str in fname.lower():
            tag_id = f.get("tag_id")
            if tag_id and isinstance(tag_id, str) and tag_id.strip():
                folder_name = tag_map.get(tag_id.strip(), tag_id.strip())
                f["folder_path"] = folder_name
            else:
                f["folder_path"] = "Untagged"
            results.append(f)

    results.sort(key=lambda item: (item.get("file_name") or item.get("filename") or "").lower())
    return {"results": results}


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


@router.get("/files/count")
def files_count(_user: UserContext = Depends(get_current_user)):
    """Return total number of files for the current user."""
    collection = firebase_db.collection(FILES_COLLECTION).where("uid", "==", _user.uid)

    # Prefer Firestore aggregation count if available.
    try:
        aggregation = collection.count()  # type: ignore[attr-defined]
        result = aggregation.get()  # type: ignore[call-arg]
        # google-cloud-firestore returns a list of aggregation results
        if isinstance(result, list) and result:
            value = getattr(result[0], "value", None)
            if isinstance(value, int):
                return {"count": value}
    except Exception:
        pass

    # Fallback: stream and count.
    count = 0
    for _ in collection.stream():
        count += 1
    return {"count": count}


@router.get("/files/recent")
def recent_files(limit: int = 10, _user: UserContext = Depends(get_current_user)):
    """Return most recently opened files for the current user."""
    safe_limit = max(1, min(int(limit or 10), 50))

    try:
        query = (
            firebase_db.collection(FILES_COLLECTION)
            .where("uid", "==", _user.uid)
            .order_by("last_opemed_at", direction=firestore.Query.DESCENDING)
            .limit(safe_limit)
            .stream()
        )
        items = [_serialize_file_doc(doc) for doc in query]
        # Ensure descending order in case server doesn't guarantee it.
        items.sort(key=lambda item: (item.get("last_opemed_at") or ""), reverse=True)
        return {"files": items}
    except Exception:
        # Fallback: stream and sort.
        all_docs = (
            firebase_db.collection(FILES_COLLECTION)
            .where("uid", "==", _user.uid)
            .stream()
        )
        items = [_serialize_file_doc(doc) for doc in all_docs]
        items.sort(key=lambda item: (item.get("last_opemed_at") or ""), reverse=True)
        return {"files": items[:safe_limit]}


@router.get("/files/by-tag/{tag_id}")
def files_by_tag(tag_id: str, _user: UserContext = Depends(get_current_user)):
    safe_tag = (tag_id or "").strip().lower()
    if not safe_tag:
        raise HTTPException(status_code=400, detail="tag_id is required")

    query = (
        firebase_db.collection(FILES_COLLECTION)
        .where("uid", "==", _user.uid)
        .where("tag_id", "==", safe_tag)
        .stream()
    )
    items = [_serialize_file_doc(doc) for doc in query]
    items.sort(key=lambda item: ((item.get("file_name") or item.get("filename") or "").lower()))
    return {"files": items}


@router.get("/files/untagged")
def untagged_files(_user: UserContext = Depends(get_current_user)):
    """Return all files without a tag_id (null / missing)."""
    try:
        query = (
            firebase_db.collection(FILES_COLLECTION)
            .where("uid", "==", _user.uid)
            .where("tag_id", "==", None)
            .stream()
        )
        items = [_serialize_file_doc(doc) for doc in query]
    except Exception:
        # Fallback: stream and filter.
        query = (
            firebase_db.collection(FILES_COLLECTION)
            .where("uid", "==", _user.uid)
            .stream()
        )
        items = []
        for doc in query:
            payload = _serialize_file_doc(doc)
            tag_val = payload.get("tag_id")
            if tag_val is None or (isinstance(tag_val, str) and not tag_val.strip()):
                items.append(payload)

    items.sort(key=lambda item: ((item.get("file_name") or item.get("filename") or "").lower()))
    return {"files": items}


@router.get("/files/tag-folders")
def tag_folders(_user: UserContext = Depends(get_current_user)):
    """Return tag folders (unique tags used by user's files) with counts + untagged count."""
    query = (
        firebase_db.collection(FILES_COLLECTION)
        .where("uid", "==", _user.uid)
        .stream()
    )

    tag_counts: dict[str, int] = {}
    untagged_count = 0
    total_count = 0

    for doc in query:
        total_count += 1
        payload = doc.to_dict() or {}
        tag_val = payload.get("tag_id")
        if isinstance(tag_val, str) and tag_val.strip():
            key = tag_val.strip().lower()
            tag_counts[key] = tag_counts.get(key, 0) + 1
        else:
            untagged_count += 1

    # Map tag_id -> tag_name (fallback to tag_id)
    tag_name_map: dict[str, str] = {}
    try:
        for doc in firebase_db.collection(TAGS_COLLECTION).stream():
            payload = doc.to_dict() or {}
            tag_id = payload.get("tag_id") or doc.id
            tag_name = payload.get("tag_name") or tag_id
            if isinstance(tag_id, str) and tag_id:
                tag_name_map[tag_id] = str(tag_name)
    except Exception:
        pass

    tags: list[Dict[str, Any]] = []
    for tag_id, count in tag_counts.items():
        tags.append(
            {
                "tag_id": tag_id,
                "tag_name": tag_name_map.get(tag_id, tag_id),
                "count": count,
            }
        )

    tags.sort(key=lambda item: ((item.get("tag_name") or item.get("tag_id") or "").lower()))
    return {
        "total_count": total_count,
        "untagged_count": untagged_count,
        "tags": tags,
    }


@router.get("/download/{filename}")
def download_file_endpoint(
    filename: str,
    _user: UserContext = Depends(get_current_user),
):
    """Download a file: fetch encrypted from S3 → decrypt in memory → return bytes."""
    ensure_rsa_keys(PUBLIC_KEY_PATH, PRIVATE_KEY_PATH)

    base_name = sanitize_filename(filename)

    _, doc_ref = _file_doc_ref(_user.uid, base_name)
    doc_snapshot = doc_ref.get()
    if not doc_snapshot.exists:
        raise HTTPException(status_code=404, detail="File metadata not found for user")

    # Get encrypted AES key from Firestore
    doc_payload = doc_snapshot.to_dict() or {}
    stored_key_b64 = doc_payload.get("aes_key")
    if not stored_key_b64:
        raise HTTPException(status_code=404, detail="Encrypted AES key not found")
    encrypted_aes_key = base64.b64decode(stored_key_b64)

    # Get encrypted blob
    encrypted_blob = download_bytes(_user.uid, base_name, suffix=".enc")

    # Decrypt in memory
    private_key_pem = PRIVATE_KEY_PATH.read_bytes()
    try:
        plaintext = decrypt_bytes(encrypted_blob, encrypted_aes_key, private_key_pem)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Decryption failed: {exc}") from exc

    content_type, _ = mimetypes.guess_type(base_name)
    if not content_type:
        content_type = "application/octet-stream"

    return Response(
        content=plaintext,
        media_type=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{base_name}"',
        },
    )


@router.post("/files/bulk/delete")
def bulk_delete_files(
    body: Dict[str, Any] = Body(...),
    _user: UserContext = Depends(get_current_user),
):
    file_names = body.get("file_names", [])
    if not file_names or not isinstance(file_names, list):
        raise HTTPException(status_code=400, detail="file_names list is required")

    deleted_count = 0
    errors = []

    for name in file_names:
        try:
            safe_name = sanitize_filename(name)
            _, doc_ref = _file_doc_ref(_user.uid, safe_name)

            if not doc_ref.get().exists:
                continue

            # Delete Firestore doc
            doc_ref.delete()

            # Delete S3 objects (.enc and .key)
            delete_file_objects(_user.uid, safe_name)

            deleted_count += 1
        except Exception as e:
            errors.append(f"{name}: {str(e)}")

    return {"deleted_count": deleted_count, "errors": errors}


@router.post("/files/bulk/move")
def bulk_move_files(
    body: Dict[str, Any] = Body(...),
    _user: UserContext = Depends(get_current_user),
):
    file_names = body.get("file_names", [])
    target_tag_id = body.get("target_tag_id")  # Can be None/null for untagged

    if not file_names or not isinstance(file_names, list):
        raise HTTPException(status_code=400, detail="file_names list is required")

    # If target_tag_id is "untagged" or empty string, treat as None
    if target_tag_id == "untagged" or (isinstance(target_tag_id, str) and not target_tag_id.strip()):
        target_tag_id = None
    elif isinstance(target_tag_id, str):
        target_tag_id = target_tag_id.strip().lower()

    moved_count = 0
    
    for name in file_names:
        try:
            safe_name = sanitize_filename(name)
            _, doc_ref = _file_doc_ref(_user.uid, safe_name)
            
            if not doc_ref.get().exists:
                continue

            doc_ref.set({"tag_id": target_tag_id}, merge=True)
            moved_count += 1
        except Exception:
            pass

    return {"moved_count": moved_count}


@router.post("/files/bulk/share")
def bulk_share_files(
    body: Dict[str, Any] = Body(...),
    _user: UserContext = Depends(get_current_user),
):
    # For now, this just acknowledges the request. 
    # Real sharing would involve generating signed URLs or ACL updates.
    file_names = body.get("file_names", [])
    if not file_names:
        raise HTTPException(status_code=400, detail="No files selected")

    return {"message": f"Successfully prepared {len(file_names)} files for sharing.", "share_link": "https://securecloud.app/share/mock-link-123"}
