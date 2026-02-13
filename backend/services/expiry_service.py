"""Background expiry service.

Handles:
1. Deleting expired files (owned files + shared files)
2. Sending 24-hour warning emails before expiry
3. Runs as a background thread alongside the FastAPI app
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from firebase_admin import firestore as fb_firestore

from core.constants import FILES_COLLECTION, SHARED_FILES_COLLECTION
from core.s3 import delete_file_objects
from firebase_admin_init import firebase_db
from services.email_service import (
    send_expiry_warning_owner,
    send_expiry_warning_shared_user,
)

logger = logging.getLogger(__name__)

# How often the checker runs (in seconds)
CHECK_INTERVAL = int(60 * 15)  # every 15 minutes


def _normalize_to_utc(ts: Any) -> datetime | None:
    """Convert a Firestore timestamp / ISO string to a timezone-aware UTC datetime."""
    if ts is None:
        return None
    if isinstance(ts, datetime):
        if ts.tzinfo is None:
            return ts.replace(tzinfo=timezone.utc)
        return ts.astimezone(timezone.utc)
    if hasattr(ts, "timestamp"):
        # Firestore DatetimeWithNanoseconds
        return ts.replace(tzinfo=timezone.utc) if ts.tzinfo is None else ts.astimezone(timezone.utc)
    if isinstance(ts, str):
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            return dt.astimezone(timezone.utc)
        except ValueError:
            return None
    return None


def _get_owner_email(uid: str) -> str:
    """Retrieve owner email from users collection."""
    try:
        doc = firebase_db.collection("users").document(uid).get()
        if doc.exists:
            data = doc.to_dict() or {}
            return data.get("email", "")
    except Exception:
        pass
    return ""


def _get_shared_user_email(uid: str) -> str:
    """Retrieve shared user email from users collection."""
    return _get_owner_email(uid)


def _delete_owned_file(uid: str, file_name: str, doc_id: str) -> None:
    """Delete an owned file from Firestore + S3, and remove all associated shares."""
    try:
        # Delete from S3
        delete_file_objects(uid, file_name)
        logger.info("Deleted S3 objects for %s/%s", uid, file_name)
    except Exception:
        logger.exception("Failed to delete S3 objects for %s/%s", uid, file_name)

    try:
        # Delete Firestore document
        firebase_db.collection(FILES_COLLECTION).document(doc_id).delete()
        logger.info("Deleted Firestore doc %s", doc_id)
    except Exception:
        logger.exception("Failed to delete Firestore doc %s", doc_id)

    # Delete all share records referencing this file
    try:
        shares = (
            firebase_db.collection(SHARED_FILES_COLLECTION)
            .where("file_id", "==", doc_id)
            .stream()
        )
        for share_doc in shares:
            share_doc.reference.delete()
            logger.info("Deleted share record %s for expired file %s", share_doc.id, doc_id)
    except Exception:
        logger.exception("Failed to clean up shares for %s", doc_id)


def _delete_shared_record(share_id: str) -> None:
    """Delete an expired share record from Firestore."""
    try:
        firebase_db.collection(SHARED_FILES_COLLECTION).document(share_id).delete()
        logger.info("Deleted expired share record %s", share_id)
    except Exception:
        logger.exception("Failed to delete share record %s", share_id)


def _check_owned_files(now: datetime) -> None:
    """Check all owned files for expiry and 24-hour warnings."""
    warning_window_start = now + timedelta(hours=23)
    warning_window_end = now + timedelta(hours=25)

    try:
        all_files = firebase_db.collection(FILES_COLLECTION).stream()
    except Exception:
        logger.exception("Failed to stream files collection")
        return

    for doc in all_files:
        try:
            data = doc.to_dict() or {}
            expiry = _normalize_to_utc(data.get("expiry_time"))
            if expiry is None:
                continue

            uid = data.get("uid", "")
            file_name = data.get("file_name", "")

            # ── EXPIRED → DELETE ──
            if expiry <= now:
                logger.info("File %s (owner: %s) has expired at %s. Deleting...", file_name, uid, expiry)
                _delete_owned_file(uid, file_name, doc.id)
                continue

            # ── 24-HOUR WARNING ──
            if warning_window_start <= expiry <= warning_window_end:
                # Check if warning already sent
                if data.get("expiry_warning_sent"):
                    continue

                owner_email = _get_owner_email(uid)
                if owner_email:
                    hours_left = max(1, int((expiry - now).total_seconds() / 3600))
                    send_expiry_warning_owner(
                        recipient_email=owner_email,
                        file_name=file_name,
                        hours_left=hours_left,
                        expiry_time=expiry.isoformat(),
                    )
                    # Mark warning as sent
                    doc.reference.set({"expiry_warning_sent": True}, merge=True)
                    logger.info("Sent 24h expiry warning to %s for file %s", owner_email, file_name)

        except Exception:
            logger.exception("Error processing file doc %s", doc.id)


def _check_shared_files(now: datetime) -> None:
    """Check all shared files for expiry and 24-hour warnings."""
    warning_window_start = now + timedelta(hours=23)
    warning_window_end = now + timedelta(hours=25)

    try:
        all_shares = firebase_db.collection(SHARED_FILES_COLLECTION).stream()
    except Exception:
        logger.exception("Failed to stream shared_files collection")
        return

    for doc in all_shares:
        try:
            data = doc.to_dict() or {}
            expiry = _normalize_to_utc(data.get("sharedExpiryTime"))
            if expiry is None:
                continue

            share_id = doc.id
            file_id = data.get("file_id", "")
            file_name = file_id.split(":")[-1] if ":" in file_id else file_id
            owner_uid = data.get("owner_id", "")
            shared_user_uid = data.get("shared_user_id", "")

            # ── EXPIRED → DELETE SHARE RECORD ──
            if expiry <= now:
                logger.info("Shared file record %s has expired at %s. Deleting...", share_id, expiry)
                _delete_shared_record(share_id)
                continue

            # ── 24-HOUR WARNING ──
            if warning_window_start <= expiry <= warning_window_end:
                if data.get("expiry_warning_sent"):
                    continue

                shared_user_email = _get_shared_user_email(shared_user_uid)
                owner_email = _get_owner_email(owner_uid)

                if shared_user_email:
                    hours_left = max(1, int((expiry - now).total_seconds() / 3600))
                    send_expiry_warning_shared_user(
                        recipient_email=shared_user_email,
                        file_name=file_name,
                        owner_email=owner_email,
                        hours_left=hours_left,
                        expiry_time=expiry.isoformat(),
                    )

                # Mark warning as sent
                doc.reference.set({"expiry_warning_sent": True}, merge=True)
                logger.info("Sent 24h expiry warning to shared user %s for share %s", shared_user_email, share_id)

        except Exception:
            logger.exception("Error processing share doc %s", doc.id)


def _run_expiry_check() -> None:
    """Single iteration of the expiry checker."""
    now = datetime.now(timezone.utc)
    logger.info("Running expiry check at %s", now.isoformat())
    _check_owned_files(now)
    _check_shared_files(now)
    logger.info("Expiry check complete.")


def _expiry_loop() -> None:
    """Background loop that runs expiry checks periodically."""
    logger.info("Expiry checker thread started (interval: %ds)", CHECK_INTERVAL)
    while True:
        try:
            _run_expiry_check()
        except Exception:
            logger.exception("Unhandled error in expiry checker loop")
        time.sleep(CHECK_INTERVAL)


def start_expiry_checker() -> threading.Thread:
    """Start the background expiry checker thread. Returns the thread object."""
    thread = threading.Thread(target=_expiry_loop, daemon=True, name="expiry-checker")
    thread.start()
    return thread
