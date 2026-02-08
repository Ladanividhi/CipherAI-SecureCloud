"""AWS S3 storage helpers.

Every interaction with S3 flows through this module so that the rest of
the backend never touches local disk for file content.
"""

from __future__ import annotations

import os
from io import BytesIO
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()

_AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
_AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
_AWS_REGION = os.getenv("AWS_REGION", "ap-south-1")
S3_BUCKET = os.getenv("AWS_S3_BUCKET_NAME", "")

if not S3_BUCKET:
    raise RuntimeError("AWS_S3_BUCKET_NAME is not set in .env")

_s3_client = boto3.client(
    "s3",
    aws_access_key_id=_AWS_ACCESS_KEY_ID,
    aws_secret_access_key=_AWS_SECRET_ACCESS_KEY,
    region_name=_AWS_REGION,
)


def _s3_key(uid: str, filename: str, suffix: str = "") -> str:
    """Build a namespaced S3 object key: ``users/<uid>/files/<filename>[.suffix]``."""
    name = f"{filename}{suffix}" if suffix else filename
    return f"users/{uid}/files/{name}"


def upload_bytes(uid: str, filename: str, data: bytes, suffix: str = "") -> str:
    """Upload raw bytes to S3 and return the object key.

    Parameters
    ----------
    uid:       Owner's user-id (used as a namespace prefix).
    filename:  Logical file name (e.g. ``report.pdf``).
    data:      Raw bytes to store.
    suffix:    Optional suffix appended to the filename (e.g. ``.enc``, ``.key``).

    Returns
    -------
    The S3 object key that was written.
    """
    key = _s3_key(uid, filename, suffix)
    try:
        _s3_client.upload_fileobj(BytesIO(data), S3_BUCKET, key)
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"S3 upload failed for {key}: {exc}",
        ) from exc
    return key


def download_bytes(uid: str, filename: str, suffix: str = "") -> bytes:
    """Download an object from S3 and return its contents as bytes.

    Parameters
    ----------
    uid:       Owner's user-id.
    filename:  Logical file name.
    suffix:    Optional suffix (e.g. ``.enc``).

    Returns
    -------
    The raw bytes of the S3 object.
    """
    key = _s3_key(uid, filename, suffix)
    buf = BytesIO()
    try:
        _s3_client.download_fileobj(S3_BUCKET, key, buf)
    except _s3_client.exceptions.NoSuchKey:
        raise HTTPException(status_code=404, detail=f"File not found in storage: {key}")
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"S3 download failed for {key}: {exc}",
        ) from exc
    return buf.getvalue()


def delete_object(uid: str, filename: str, suffix: str = "") -> None:
    """Delete a single object from S3 (no error if it doesn't exist)."""
    key = _s3_key(uid, filename, suffix)
    try:
        _s3_client.delete_object(Bucket=S3_BUCKET, Key=key)
    except (BotoCoreError, ClientError):
        pass  # best-effort cleanup


def delete_file_objects(uid: str, filename: str) -> None:
    """Delete the S3 object associated with a logical file (.enc only)."""
    delete_object(uid, filename, suffix=".enc")


def object_exists(uid: str, filename: str, suffix: str = "") -> bool:
    """Return True if the object exists in S3."""
    key = _s3_key(uid, filename, suffix)
    try:
        _s3_client.head_object(Bucket=S3_BUCKET, Key=key)
        return True
    except (BotoCoreError, ClientError):
        return False
