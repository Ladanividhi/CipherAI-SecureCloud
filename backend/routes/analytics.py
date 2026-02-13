from __future__ import annotations

import os
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends

from core.constants import FILES_COLLECTION, SHARED_FILES_COLLECTION
from core.security import UserContext, get_current_user
from firebase_admin_init import firebase_db
from models.tag import TAGS_COLLECTION

router = APIRouter(tags=["analytics"])


def _ts_to_date_str(ts: Any) -> str | None:
    """Convert a Firestore timestamp or ISO string to 'YYYY-MM-DD'."""
    if ts is None:
        return None
    if isinstance(ts, datetime):
        return ts.strftime("%Y-%m-%d")
    if isinstance(ts, str):
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00")).strftime("%Y-%m-%d")
        except ValueError:
            return None
    return None


def _get_extension(filename: str) -> str:
    """Extract lowercase extension from filename."""
    if not filename:
        return "unknown"
    parts = filename.rsplit(".", 1)
    if len(parts) < 2 or not parts[1].strip():
        return "unknown"
    return parts[1].strip().lower()


EXT_CATEGORIES: Dict[str, str] = {
    "pdf": "Documents",
    "doc": "Documents",
    "docx": "Documents",
    "txt": "Documents",
    "rtf": "Documents",
    "odt": "Documents",
    "xls": "Spreadsheets",
    "xlsx": "Spreadsheets",
    "csv": "Spreadsheets",
    "ppt": "Presentations",
    "pptx": "Presentations",
    "jpg": "Images",
    "jpeg": "Images",
    "png": "Images",
    "gif": "Images",
    "svg": "Images",
    "webp": "Images",
    "bmp": "Images",
    "ico": "Images",
    "mp4": "Videos",
    "mov": "Videos",
    "avi": "Videos",
    "mkv": "Videos",
    "webm": "Videos",
    "mp3": "Audio",
    "wav": "Audio",
    "flac": "Audio",
    "ogg": "Audio",
    "aac": "Audio",
    "zip": "Archives",
    "rar": "Archives",
    "7z": "Archives",
    "tar": "Archives",
    "gz": "Archives",
    "py": "Code",
    "js": "Code",
    "ts": "Code",
    "jsx": "Code",
    "tsx": "Code",
    "html": "Code",
    "css": "Code",
    "json": "Code",
    "xml": "Code",
    "yaml": "Code",
    "yml": "Code",
    "md": "Code",
}

CATEGORY_COLORS: Dict[str, str] = {
    "Documents": "#6366f1",
    "Images": "#f472b6",
    "Videos": "#fb923c",
    "Audio": "#a78bfa",
    "Archives": "#fbbf24",
    "Spreadsheets": "#34d399",
    "Presentations": "#f87171",
    "Code": "#38bdf8",
    "Other": "#94a3b8",
}


@router.get("/analytics")
def get_analytics(_user: UserContext = Depends(get_current_user)):
    """Aggregate analytics data for the current user."""

    # ── Fetch all user files ──
    file_docs = (
        firebase_db.collection(FILES_COLLECTION)
        .where("uid", "==", _user.uid)
        .stream()
    )
    files: List[Dict[str, Any]] = []
    for doc in file_docs:
        payload = doc.to_dict() or {}
        payload["id"] = doc.id
        files.append(payload)

    # ── Build tag map ──
    tag_docs = firebase_db.collection(TAGS_COLLECTION).stream()
    tag_map: Dict[str, str] = {}
    for td in tag_docs:
        tp = td.to_dict() or {}
        tag_map[td.id] = tp.get("tag_name") or td.id

    # ── Shared files count (files shared BY this user) ──
    shared_by_user = (
        firebase_db.collection(SHARED_FILES_COLLECTION)
        .where("owner_uid", "==", _user.uid)
        .stream()
    )
    shared_count = sum(1 for _ in shared_by_user)

    # ── Shared with me count ──
    shared_email = _user.email or ""
    shared_with_me_count = 0
    if shared_email:
        shared_with_me_docs = (
            firebase_db.collection(SHARED_FILES_COLLECTION)
            .where("shared_with_email", "==", shared_email)
            .stream()
        )
        shared_with_me_count = sum(1 for _ in shared_with_me_docs)

    # ── Basic stats ──
    total_files = len(files)
    total_size = sum(f.get("size", 0) or 0 for f in files)
    advance_security_count = sum(1 for f in files if f.get("advance_security"))

    # ── Upload timeline (last 30 days) ──
    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)
    upload_by_day: Dict[str, int] = defaultdict(int)

    # Pre-fill all 30 days with 0
    for i in range(30):
        day = (thirty_days_ago + timedelta(days=i + 1)).strftime("%Y-%m-%d")
        upload_by_day[day] = 0

    for f in files:
        date_str = _ts_to_date_str(f.get("uploaded_at"))
        if date_str and date_str in upload_by_day:
            upload_by_day[date_str] += 1

    upload_timeline = [
        {"date": d, "count": c}
        for d, c in sorted(upload_by_day.items())
    ]

    # ── File type distribution ──
    type_counter: Counter = Counter()
    for f in files:
        fname = f.get("file_name") or ""
        ext = _get_extension(fname)
        category = EXT_CATEGORIES.get(ext, "Other")
        type_counter[category] += 1

    file_types = [
        {
            "name": name,
            "count": count,
            "color": CATEGORY_COLORS.get(name, "#94a3b8"),
        }
        for name, count in type_counter.most_common()
    ]

    # ── Storage by tag ──
    tag_storage: Dict[str, int] = defaultdict(int)
    tag_file_count: Dict[str, int] = defaultdict(int)
    for f in files:
        tag_id = f.get("tag_id")
        tag_name = "Untagged"
        if tag_id and isinstance(tag_id, str) and tag_id.strip():
            tag_name = tag_map.get(tag_id.strip(), tag_id.strip())
        tag_storage[tag_name] += f.get("size", 0) or 0
        tag_file_count[tag_name] += 1

    storage_by_tag = sorted(
        [
            {
                "tag": tag,
                "size": size,
                "size_mb": round(size / (1024 ** 2), 2),
                "file_count": tag_file_count[tag],
            }
            for tag, size in tag_storage.items()
        ],
        key=lambda x: x["size"],
        reverse=True,
    )[:10]

    # ── Expiring soon (within 7 days) ──
    seven_days_later = now + timedelta(days=7)
    expiring_soon: List[Dict[str, Any]] = []
    for f in files:
        exp = f.get("expiry_time")
        if exp is None:
            continue
        if isinstance(exp, str):
            try:
                exp = datetime.fromisoformat(exp.replace("Z", "+00:00"))
            except ValueError:
                continue
        if isinstance(exp, datetime):
            if now <= exp <= seven_days_later:
                expiring_soon.append({
                    "file_name": f.get("file_name", ""),
                    "expiry_time": exp.isoformat(),
                    "days_left": max(0, (exp - now).days),
                })

    expiring_soon.sort(key=lambda x: x.get("days_left", 0))

    # ── Recent activity (last 10 opened files) ──
    opened_files = [
        f for f in files if f.get("last_opemed_at") is not None
    ]
    opened_files.sort(
        key=lambda x: x.get("last_opemed_at") or "",
        reverse=True,
    )
    recent_activity = []
    for f in opened_files[:10]:
        recent_activity.append({
            "file_name": f.get("file_name", ""),
            "last_opened": _ts_to_date_str(f.get("last_opemed_at")),
            "action": "Opened",
        })

    # ── Security breakdown ──
    security_overview = {
        "total": total_files,
        "advance_security": advance_security_count,
        "standard_encryption": total_files - advance_security_count,
        "with_expiry": sum(1 for f in files if f.get("expiry_time")),
        "shared": shared_count,
    }

    return {
        "summary": {
            "total_files": total_files,
            "total_size": total_size,
            "total_size_mb": round(total_size / (1024 ** 2), 2) if total_size else 0,
            "shared_count": shared_count,
            "shared_with_me_count": shared_with_me_count,
            "advance_security_count": advance_security_count,
            "encryption_rate": round(
                (total_files / total_files * 100) if total_files > 0 else 0, 1
            ),
        },
        "upload_timeline": upload_timeline,
        "file_types": file_types,
        "storage_by_tag": storage_by_tag,
        "expiring_soon": expiring_soon,
        "recent_activity": recent_activity,
        "security_overview": security_overview,
    }
