from __future__ import annotations

import base64
import json
import mimetypes
from datetime import datetime
from typing import Any, Dict, Tuple

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from firebase_admin import firestore

from core.constants import FILES_COLLECTION, MAX_UPLOAD_FILES, SHARED_FILES_COLLECTION
from core.crypto import ensure_rsa_keys
from core.paths import PRIVATE_KEY_PATH, PUBLIC_KEY_PATH
from core.s3 import delete_file_objects, download_bytes, upload_bytes
from core.security import UserContext, get_current_user
from decrypt_file import decrypt_bytes
from encrypt_file import encrypt_bytes, rewrap_aes_key
from firebase_admin_init import firebase_db
from models.files import FileModel
from models.tag import TAGS_COLLECTION
from services.email_service import send_share_notification, send_extend_request_to_owner


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


# ─── Sharing Endpoints ─────────────────────────────────────────────────────────

@router.get("/users/search")
def search_users(q: str = "", _user: UserContext = Depends(get_current_user)):
    """Search registered users by email. Only returns users other than the caller."""
    query_str = (q or "").strip().lower()
    if not query_str or len(query_str) < 2:
        return {"users": []}

    all_users = firebase_db.collection("users").stream()
    results = []
    for doc in all_users:
        data = doc.to_dict() or {}
        email = (data.get("email") or "").lower()
        if email and query_str in email and doc.id != _user.uid:
            results.append({
                "uid": doc.id,
                "email": data.get("email", ""),
                "name": data.get("name") or data.get("display_name") or "",
            })
        if len(results) >= 10:
            break
    return {"users": results}


@router.post("/files/share")
def share_file(
    body: Dict[str, Any] = Body(...),
    _user: UserContext = Depends(get_current_user),
):
    """Share a file with another registered user.

    - Decrypts the AES key with the owner's private key
    - Re-encrypts it with the recipient's public key
    - Stores the share record in the shared_files collection
    """
    ensure_rsa_keys(PUBLIC_KEY_PATH, PRIVATE_KEY_PATH)

    file_name = body.get("file_name")
    recipient_email = (body.get("recipient_email") or "").strip().lower()
    permission = body.get("permission", "view")  # "view" or "download"
    expiry_time_raw = body.get("expiry_time")

    if not file_name:
        raise HTTPException(status_code=400, detail="file_name is required")
    if not recipient_email:
        raise HTTPException(status_code=400, detail="recipient_email is required")
    if permission not in ("view", "download"):
        raise HTTPException(status_code=400, detail="permission must be 'view' or 'download'")

    # Look up recipient by email
    users_query = firebase_db.collection("users").where("email", "==", recipient_email).limit(1).stream()
    recipient_doc = None
    for doc in users_query:
        recipient_doc = doc
        break

    if not recipient_doc:
        raise HTTPException(status_code=404, detail="No registered user found with that email")

    recipient_data = recipient_doc.to_dict() or {}
    recipient_uid = recipient_doc.id
    recipient_public_key_pem = recipient_data.get("public_key")

    if recipient_uid == _user.uid:
        raise HTTPException(status_code=400, detail="You cannot share a file with yourself")

    if not recipient_public_key_pem:
        raise HTTPException(
            status_code=400,
            detail="Recipient does not have a public key registered"
        )

    # Load the file metadata (owner's file)
    safe_name = sanitize_filename(file_name)
    _, doc_ref = _file_doc_ref(_user.uid, safe_name)
    doc_snapshot = doc_ref.get()
    if not doc_snapshot.exists:
        raise HTTPException(status_code=404, detail="File not found")

    doc_payload = doc_snapshot.to_dict() or {}
    stored_key_b64 = doc_payload.get("aes_key")
    if not stored_key_b64:
        raise HTTPException(status_code=404, detail="Encrypted AES key not found for file")

    # Check if already shared with this user
    existing_shares = (
        firebase_db.collection(SHARED_FILES_COLLECTION)
        .where("owner_id", "==", _user.uid)
        .where("shared_user_id", "==", recipient_uid)
        .where("file_id", "==", f"{_user.uid}:{safe_name}")
        .stream()
    )
    for existing in existing_shares:
        raise HTTPException(
            status_code=409,
            detail="This file is already shared with that user"
        )

    # Rewrap the AES key: owner_private → recipient_public
    try:
        encrypted_aes_key = base64.b64decode(stored_key_b64)
        owner_private_key_pem = PRIVATE_KEY_PATH.read_bytes()
        recipient_pub_bytes = recipient_public_key_pem.encode("utf-8") if isinstance(
            recipient_public_key_pem, str
        ) else recipient_public_key_pem

        rewrapped_key = rewrap_aes_key(
            encrypted_aes_key,
            owner_private_key_pem,
            recipient_pub_bytes,
        )
        rewrapped_key_b64 = base64.b64encode(rewrapped_key).decode("ascii")
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to re-encrypt AES key for recipient: {exc}"
        ) from exc

    # Parse optional expiry
    expiry_time = _parse_expiry(expiry_time_raw)

    # Store the share record
    share_data = {
        "owner_id": _user.uid,
        "shared_user_id": recipient_uid,
        "file_id": f"{_user.uid}:{safe_name}",
        "aes_key_shared": rewrapped_key_b64,
        "permissions": permission,
        "sharedExpiryTime": expiry_time,
        "createdAt": firestore.SERVER_TIMESTAMP,
    }
    firebase_db.collection(SHARED_FILES_COLLECTION).add(share_data)

    # Send email notification (non-blocking; failures don't affect the share)
    email_sent = send_share_notification(
        recipient_email=recipient_email,
        sharer_name=_user.name,
        sharer_email=_user.email,
        file_name=safe_name,
        permission=permission,
    )

    return {
        "message": f"File '{safe_name}' shared with {recipient_email}",
        "permission": permission,
        "email_sent": email_sent,
    }


@router.get("/files/shared-with-me")
def files_shared_with_me(_user: UserContext = Depends(get_current_user)):
    """Return all files shared with the current user."""
    shares = (
        firebase_db.collection(SHARED_FILES_COLLECTION)
        .where("shared_user_id", "==", _user.uid)
        .stream()
    )
    items = []
    for doc in shares:
        data = doc.to_dict() or {}
        file_id = data.get("file_id", "")

        # Check expiry
        expiry = data.get("sharedExpiryTime")
        if expiry is not None:
            if isinstance(expiry, datetime):
                if expiry < datetime.now(expiry.tzinfo):
                    continue  # skip expired shares
            elif hasattr(expiry, "timestamp"):
                # Firestore DatetimeWithNanoseconds
                from datetime import timezone
                if expiry.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
                    continue

        # Fetch original file metadata
        file_doc = firebase_db.collection(FILES_COLLECTION).document(file_id).get()
        file_data = file_doc.to_dict() if file_doc.exists else {}

        # Fetch owner info
        owner_id = data.get("owner_id", "")
        owner_email = ""
        owner_name = ""
        if owner_id:
            owner_doc = firebase_db.collection("users").document(owner_id).get()
            if owner_doc.exists:
                owner_data = owner_doc.to_dict() or {}
                owner_email = owner_data.get("email", "")
                owner_name = owner_data.get("name", "")

        items.append({
            "share_id": doc.id,
            "file_id": file_id,
            "file_name": file_data.get("file_name", file_id.split(":")[-1] if ":" in file_id else file_id),
            "size": file_data.get("size", 0),
            "owner_id": owner_id,
            "owner_email": owner_email,
            "owner_name": owner_name,
            "permissions": data.get("permissions", "view"),
            "sharedExpiryTime": _serialize_timestamp(data.get("sharedExpiryTime")),
            "createdAt": _serialize_timestamp(data.get("createdAt")),
        })

    return {"files": items}


@router.post("/files/shared/decrypt")
def decrypt_shared_file(
    body: Dict[str, Any] = Body(...),
    _user: UserContext = Depends(get_current_user),
):
    """Decrypt a file that was shared with the current user.

    Uses the re-wrapped AES key (encrypted with user's public key) from the
    shared_files record to decrypt the original file blob from S3.
    """
    ensure_rsa_keys(PUBLIC_KEY_PATH, PRIVATE_KEY_PATH)

    share_id = body.get("share_id")
    if not share_id:
        raise HTTPException(status_code=400, detail="share_id is required")

    # Load the share record
    share_ref = firebase_db.collection(SHARED_FILES_COLLECTION).document(share_id)
    share_snapshot = share_ref.get()
    if not share_snapshot.exists:
        raise HTTPException(status_code=404, detail="Share record not found")

    share_data = share_snapshot.to_dict() or {}

    # Verify this share belongs to the current user
    if share_data.get("shared_user_id") != _user.uid:
        raise HTTPException(status_code=403, detail="You do not have access to this shared file")

    # Check expiry
    expiry = share_data.get("sharedExpiryTime")
    if expiry is not None:
        if isinstance(expiry, datetime):
            if expiry < datetime.now(expiry.tzinfo):
                raise HTTPException(status_code=403, detail="This share has expired")
        elif hasattr(expiry, "timestamp"):
            from datetime import timezone
            if expiry.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
                raise HTTPException(status_code=403, detail="This share has expired")

    # Get original file info to find the S3 path (owner_uid + filename)
    file_id = share_data.get("file_id", "")
    if ":" not in file_id:
        raise HTTPException(status_code=500, detail="Invalid file reference")

    owner_uid, base_name = file_id.split(":", 1)

    # Retrieve the ORIGINAL AES key from the owner's file document.
    # This avoids key-mismatch issues with the re-wrapped key when the
    # server key-pair was regenerated or the recipient's stored public
    # key was stale at share time.
    file_doc = firebase_db.collection(FILES_COLLECTION).document(file_id).get()
    if not file_doc.exists:
        raise HTTPException(status_code=404, detail="Original file metadata not found")

    file_data = file_doc.to_dict() or {}
    original_key_b64 = file_data.get("aes_key")
    if not original_key_b64:
        raise HTTPException(status_code=500, detail="AES key not found for file")

    try:
        encrypted_aes_key = base64.b64decode(original_key_b64)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Stored AES key is invalid") from exc

    # Download encrypted blob from S3 using owner's path
    try:
        encrypted_blob = download_bytes(owner_uid, base_name, suffix=".enc")
    except HTTPException:
        raise HTTPException(status_code=404, detail="Encrypted file not found in storage")

    # Decrypt in memory using the server's private key
    private_key_pem = PRIVATE_KEY_PATH.read_bytes()
    try:
        plaintext = decrypt_bytes(encrypted_blob, encrypted_aes_key, private_key_pem)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Decryption failed: {exc}") from exc

    content_type, _ = mimetypes.guess_type(base_name)
    if not content_type:
        content_type = "application/octet-stream"

    permission = share_data.get("permissions", "view")
    disposition = "attachment" if permission == "download" else "inline"

    return Response(
        content=plaintext,
        media_type=content_type,
        headers={
            "Content-Disposition": f'{disposition}; filename="{base_name}"',
            "X-Share-Permission": permission,
        },
    )


@router.get("/files/shared/download/{share_id}")
def download_shared_file(
    share_id: str,
    _user: UserContext = Depends(get_current_user),
):
    """Download a shared file — only allowed if permission is 'download'."""
    ensure_rsa_keys(PUBLIC_KEY_PATH, PRIVATE_KEY_PATH)

    share_ref = firebase_db.collection(SHARED_FILES_COLLECTION).document(share_id)
    share_snapshot = share_ref.get()
    if not share_snapshot.exists:
        raise HTTPException(status_code=404, detail="Share record not found")

    share_data = share_snapshot.to_dict() or {}

    if share_data.get("shared_user_id") != _user.uid:
        raise HTTPException(status_code=403, detail="You do not have access to this shared file")

    if share_data.get("permissions") != "download":
        raise HTTPException(status_code=403, detail="You only have view permission for this file")

    # Check expiry
    expiry = share_data.get("sharedExpiryTime")
    if expiry is not None:
        if isinstance(expiry, datetime):
            if expiry < datetime.now(expiry.tzinfo):
                raise HTTPException(status_code=403, detail="This share has expired")
        elif hasattr(expiry, "timestamp"):
            from datetime import timezone
            if expiry.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
                raise HTTPException(status_code=403, detail="This share has expired")

    file_id = share_data.get("file_id", "")
    if ":" not in file_id:
        raise HTTPException(status_code=500, detail="Invalid file reference")

    owner_uid, base_name = file_id.split(":", 1)

    # Use the original AES key from the owner's file document
    file_doc = firebase_db.collection(FILES_COLLECTION).document(file_id).get()
    if not file_doc.exists:
        raise HTTPException(status_code=404, detail="Original file metadata not found")

    file_data = file_doc.to_dict() or {}
    original_key_b64 = file_data.get("aes_key")
    if not original_key_b64:
        raise HTTPException(status_code=500, detail="AES key not found for file")

    encrypted_aes_key = base64.b64decode(original_key_b64)

    encrypted_blob = download_bytes(owner_uid, base_name, suffix=".enc")

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


# ─── Expiry Extension Endpoints ─────────────────────────────────────────────


@router.post("/files/extend-expiry")
def extend_file_expiry(
    body: Dict[str, Any] = Body(...),
    _user: UserContext = Depends(get_current_user),
):
    """Extend or update the expiry time of an owned file."""
    file_name = body.get("file_name")
    new_expiry = body.get("new_expiry")

    if not file_name:
        raise HTTPException(status_code=400, detail="file_name is required")
    if not new_expiry:
        raise HTTPException(status_code=400, detail="new_expiry is required")

    safe_name = sanitize_filename(file_name)
    _, doc_ref = _file_doc_ref(_user.uid, safe_name)
    doc_snapshot = doc_ref.get()
    if not doc_snapshot.exists:
        raise HTTPException(status_code=404, detail="File not found")

    parsed_expiry = _parse_expiry(new_expiry)
    if parsed_expiry is None:
        raise HTTPException(status_code=400, detail="Invalid expiry time format")

    # Reset the warning flag so a new warning can be sent if needed
    doc_ref.set({
        "expiry_time": parsed_expiry,
        "expiry_warning_sent": False,
    }, merge=True)

    return {
        "message": f"Expiry time for '{safe_name}' has been updated.",
        "file_name": safe_name,
        "new_expiry": parsed_expiry.isoformat() if isinstance(parsed_expiry, datetime) else str(parsed_expiry),
    }


@router.post("/files/remove-expiry")
def remove_file_expiry(
    body: Dict[str, Any] = Body(...),
    _user: UserContext = Depends(get_current_user),
):
    """Remove the expiry time from an owned file (make it permanent)."""
    file_name = body.get("file_name")
    if not file_name:
        raise HTTPException(status_code=400, detail="file_name is required")

    safe_name = sanitize_filename(file_name)
    _, doc_ref = _file_doc_ref(_user.uid, safe_name)
    doc_snapshot = doc_ref.get()
    if not doc_snapshot.exists:
        raise HTTPException(status_code=404, detail="File not found")

    doc_ref.set({
        "expiry_time": None,
        "expiry_warning_sent": False,
    }, merge=True)

    return {
        "message": f"Expiry removed for '{safe_name}'. File is now permanent.",
        "file_name": safe_name,
    }


@router.post("/files/shared/extend-expiry")
def extend_shared_file_expiry(
    body: Dict[str, Any] = Body(...),
    _user: UserContext = Depends(get_current_user),
):
    """Extend the expiry time of a shared file record.

    Only the owner of the file can extend the shared expiry.
    """
    share_id = body.get("share_id")
    new_expiry = body.get("new_expiry")

    if not share_id:
        raise HTTPException(status_code=400, detail="share_id is required")
    if not new_expiry:
        raise HTTPException(status_code=400, detail="new_expiry is required")

    share_ref = firebase_db.collection(SHARED_FILES_COLLECTION).document(share_id)
    share_snapshot = share_ref.get()
    if not share_snapshot.exists:
        raise HTTPException(status_code=404, detail="Share record not found")

    share_data = share_snapshot.to_dict() or {}

    # Only the owner can extend
    if share_data.get("owner_id") != _user.uid:
        raise HTTPException(status_code=403, detail="Only the file owner can extend the shared expiry")

    parsed_expiry = _parse_expiry(new_expiry)
    if parsed_expiry is None:
        raise HTTPException(status_code=400, detail="Invalid expiry time format")

    share_ref.set({
        "sharedExpiryTime": parsed_expiry,
        "expiry_warning_sent": False,
    }, merge=True)

    file_id = share_data.get("file_id", "")
    file_name = file_id.split(":")[-1] if ":" in file_id else file_id

    return {
        "message": f"Shared expiry for '{file_name}' has been updated.",
        "share_id": share_id,
        "new_expiry": parsed_expiry.isoformat() if isinstance(parsed_expiry, datetime) else str(parsed_expiry),
    }


@router.post("/files/shared/request-extend")
def request_extend_shared_file(
    body: Dict[str, Any] = Body(...),
    _user: UserContext = Depends(get_current_user),
):
    """Shared user requests the owner to extend the expiry.

    Sends an email to the file owner.
    """
    share_id = body.get("share_id")

    if not share_id:
        raise HTTPException(status_code=400, detail="share_id is required")

    share_ref = firebase_db.collection(SHARED_FILES_COLLECTION).document(share_id)
    share_snapshot = share_ref.get()
    if not share_snapshot.exists:
        raise HTTPException(status_code=404, detail="Share record not found")

    share_data = share_snapshot.to_dict() or {}

    # Verify this share belongs to the requester
    if share_data.get("shared_user_id") != _user.uid:
        raise HTTPException(status_code=403, detail="You do not have access to this shared file")

    owner_uid = share_data.get("owner_id", "")
    file_id = share_data.get("file_id", "")
    file_name = file_id.split(":")[-1] if ":" in file_id else file_id

    # Get owner email
    owner_email = ""
    if owner_uid:
        owner_doc = firebase_db.collection("users").document(owner_uid).get()
        if owner_doc.exists:
            owner_data = owner_doc.to_dict() or {}
            owner_email = owner_data.get("email", "")

    if not owner_email:
        raise HTTPException(status_code=404, detail="Could not find the file owner's email")

    requester_email = _user.email or ""

    email_sent = send_extend_request_to_owner(
        owner_email=owner_email,
        requester_email=requester_email,
        file_name=file_name,
    )

    return {
        "message": "Extension request sent to the file owner.",
        "email_sent": email_sent,
        "owner_email": owner_email,
    }


@router.get("/files/shared-by-me")
def files_shared_by_me(_user: UserContext = Depends(get_current_user)):
    """Return all share records created by the current user (files they shared)."""
    shares = (
        firebase_db.collection(SHARED_FILES_COLLECTION)
        .where("owner_id", "==", _user.uid)
        .stream()
    )
    items = []
    for doc in shares:
        data = doc.to_dict() or {}
        file_id = data.get("file_id", "")
        file_name = file_id.split(":")[-1] if ":" in file_id else file_id

        # Get recipient info
        shared_user_id = data.get("shared_user_id", "")
        shared_user_email = ""
        if shared_user_id:
            user_doc = firebase_db.collection("users").document(shared_user_id).get()
            if user_doc.exists:
                shared_user_email = (user_doc.to_dict() or {}).get("email", "")

        items.append({
            "share_id": doc.id,
            "file_id": file_id,
            "file_name": file_name,
            "shared_user_id": shared_user_id,
            "shared_user_email": shared_user_email,
            "permissions": data.get("permissions", "view"),
            "sharedExpiryTime": _serialize_timestamp(data.get("sharedExpiryTime")),
            "createdAt": _serialize_timestamp(data.get("createdAt")),
        })

    return {"shares": items}
