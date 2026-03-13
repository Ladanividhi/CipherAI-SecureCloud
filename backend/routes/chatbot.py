"""
Chatbot API routes.

Exposes two endpoints:
  POST /chatbot/process-pdf   – decrypts a user's PDF and builds the FAISS index
  POST /chatbot/ask           – asks a question about the currently-loaded PDF

Both endpoints are protected by the same Firebase Auth used by the rest of the app.
The PDF is fetched from S3, decrypted in-memory, and processed without touching disk
(except for the FAISS cache).
"""

from __future__ import annotations

import base64
import re
import time
from typing import Any, Dict

from fastapi import APIRouter, Body, Depends, HTTPException
from firebase_admin import firestore

from core.constants import CHAT_HISTORY_COLLECTION, FILES_COLLECTION
from core.crypto import ensure_rsa_keys
from core.paths import PRIVATE_KEY_PATH, PUBLIC_KEY_PATH
from core.s3 import download_bytes
from core.security import UserContext, get_current_user
from decrypt_file import decrypt_bytes
from firebase_admin_init import firebase_db

from chatbot.pdf_extractor import extract_pdf_text_from_bytes
from chatbot.text_processing import create_chunks
from chatbot.embeddings import (
    content_hash,
    create_embeddings,
    build_faiss_index,
    save_index,
    load_index,
    search_similar_chunks,
)
from chatbot.llm import generate_answer
from chatbot.config import TOP_K

router = APIRouter(prefix="/chatbot", tags=["chatbot"])


# ─────────────────────────────────────────────────────────
#  In-memory session store: uid → { chunks, index, filename }
#  For production scale, swap with Redis or similar.
# ─────────────────────────────────────────────────────────
_sessions: Dict[str, Dict[str, Any]] = {}


def _get_session(uid: str) -> Dict[str, Any]:
    if uid not in _sessions:
        _sessions[uid] = {
            "chunks": None,
            "index": None,
            "filename": None,
            "file_id": None,
        }
    return _sessions[uid]


# ─────────────────────────────────────────────────────────
#  Helper: sanitize filename (mirrors routes/files.py)
# ─────────────────────────────────────────────────────────
def _sanitize_filename(filename: str) -> str:
    return re.sub(r"[^\w.\- ]", "_", filename.strip())


def _chat_history_ref(file_id: str):
    return (
        firebase_db.collection(FILES_COLLECTION)
        .document(file_id)
        .collection(CHAT_HISTORY_COLLECTION)
    )


def _load_chat_history(file_id: str) -> list[dict[str, Any]]:
    history_docs = _chat_history_ref(file_id).order_by("timestamp").stream()

    messages: list[dict[str, Any]] = []
    for doc in history_docs:
        payload = doc.to_dict() or {}
        timestamp = payload.get("timestamp")
        timestamp_value = timestamp.isoformat() if hasattr(timestamp, "isoformat") else timestamp

        human_msg = (payload.get("human_msg") or "").strip()
        ai_msg = (payload.get("ai_msg") or "").strip()

        if human_msg:
            messages.append({
                "role": "user",
                "text": human_msg,
                "timestamp": timestamp_value,
            })
        if ai_msg:
            messages.append({
                "role": "bot",
                "text": ai_msg,
                "timestamp": timestamp_value,
            })

    return messages


def _save_chat_history(file_id: str, user: UserContext, question: str, answer: str) -> None:
    _chat_history_ref(file_id).add(
        {
            "uid": user.uid,
            "fileid": file_id,
            "human_msg": question,
            "ai_msg": answer,
            "timestamp": firestore.SERVER_TIMESTAMP,
        }
    )


# ─────────────────────────────────────────────────────────
#  Helper: metadata-based chunk retrieval
# ─────────────────────────────────────────────────────────
def _detect_metadata_query(question: str, chunks: list[dict]):
    q = question.lower()

    page_match = re.search(r'page[_ ]?(?:number|num|no\.?)?[\s:]*?(\d+)', q)
    if page_match:
        page_num = int(page_match.group(1))
        matched = [c for c in chunks if c["page_number"] == page_num]
        if matched:
            return matched

    chunk_match = re.search(r'chunk[_ ]?(?:index|idx|no\.?)?[\s:]*?(\d+)', q)
    if chunk_match:
        chunk_idx = int(chunk_match.group(1))
        matched = [c for c in chunks if c["chunk_index"] == chunk_idx]
        if matched:
            return matched

    return None


# =========================================================
#  POST /chatbot/process-pdf
# =========================================================

@router.post("/process-pdf")
def process_pdf(
    body: Dict[str, Any] = Body(...),
    user: UserContext = Depends(get_current_user),
):
    """
    Decrypt the user's PDF from S3 and build a FAISS index for chatbot Q&A.

    Body: { "file_name": "report.pdf" }

    Steps:
      1. Verify the file belongs to the user and advance_security is OFF
      2. Fetch encrypted blob + AES key from S3 / Firestore
      3. Decrypt in-memory
      4. Extract text (pypdf + OCR fallback)
      5. Chunk → embed → build FAISS index (cached by content hash)
      6. Store session for this user
    """
    request_name = body.get("file_name") or body.get("filename")
    if not isinstance(request_name, str) or not request_name.strip():
        raise HTTPException(status_code=400, detail="file_name is required")

    base_name = _sanitize_filename(request_name)

    # ── Check file is a PDF ──
    if not base_name.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Chatbot only supports PDF files.")

    # ── Fetch file metadata from Firestore ──
    doc_id = f"{user.uid}:{base_name}"
    doc_ref = firebase_db.collection(FILES_COLLECTION).document(doc_id)
    doc_snapshot = doc_ref.get()
    if not doc_snapshot.exists:
        raise HTTPException(status_code=404, detail="File metadata not found for user")

    doc_data = doc_snapshot.to_dict() or {}

    # ── Check advance_security is OFF ──
    advance_security = doc_data.get("advance_security", True)
    if advance_security is True:
        raise HTTPException(
            status_code=403,
            detail="Chatbot is disabled for files with Advanced Security enabled.",
        )

    # ── If already loaded for this user + same file, skip ──
    session = _get_session(user.uid)
    if session["filename"] == base_name and session["index"] is not None:
        session["file_id"] = doc_id
        history = _load_chat_history(doc_id)
        return {
            "message": f"PDF '{base_name}' already loaded.",
            "chunks": len(session["chunks"]),
            "time_seconds": 0,
            "history": history,
        }

    start = time.time()

    # ── Decrypt the PDF from S3 ──
    ensure_rsa_keys(PUBLIC_KEY_PATH, PRIVATE_KEY_PATH)

    stored_key_b64 = doc_data.get("aes_key")
    if not stored_key_b64:
        raise HTTPException(status_code=404, detail="Encrypted AES key not found")
    try:
        encrypted_aes_key = base64.b64decode(stored_key_b64)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Stored AES key is invalid") from exc

    try:
        encrypted_blob = download_bytes(user.uid, base_name, suffix=".enc")
    except Exception:
        raise HTTPException(status_code=404, detail="Encrypted file not found in storage")

    private_key_pem = PRIVATE_KEY_PATH.read_bytes()
    try:
        pdf_bytes = decrypt_bytes(encrypted_blob, encrypted_aes_key, private_key_pem)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Decryption failed: {exc}") from exc

    # ── Check cache by content hash ──
    fhash = content_hash(pdf_bytes)
    cached_index, cached_chunks = load_index(fhash)

    if cached_index is not None:
        session["chunks"] = cached_chunks
        session["index"] = cached_index
        session["filename"] = base_name
        session["file_id"] = doc_id
        elapsed = round(time.time() - start, 2)
        return {
            "message": f"PDF '{base_name}' loaded from cache.",
            "chunks": len(cached_chunks),
            "time_seconds": elapsed,
            "history": _load_chat_history(doc_id),
        }

    # ── Full processing pipeline ──
    print(f"\n[Chatbot] Processing '{base_name}' for user {user.uid} …")

    # 1. Extract text per page
    page_results = extract_pdf_text_from_bytes(pdf_bytes)
    if not any(p["text"].strip() for p in page_results):
        raise HTTPException(status_code=400, detail="Could not extract any text from this PDF.")

    # 2. Create chunks with metadata
    chunks = create_chunks(page_results, source_filename=base_name)
    print(f"  Created {len(chunks)} chunks")

    # 3. Create embeddings
    embeddings = create_embeddings(chunks)

    # 4. Build FAISS index
    index = build_faiss_index(embeddings)

    # 5. Persist to disk cache
    save_index(index, chunks, fhash)

    # 6. Store in session
    session["chunks"] = chunks
    session["index"] = index
    session["filename"] = base_name
    session["file_id"] = doc_id
    elapsed = round(time.time() - start, 2)

    return {
        "message": f"PDF '{base_name}' processed successfully.",
        "chunks": len(chunks),
        "time_seconds": elapsed,
        "history": _load_chat_history(doc_id),
    }


# =========================================================
#  POST /chatbot/ask
# =========================================================

@router.post("/ask")
def ask_question(
    body: Dict[str, Any] = Body(...),
    user: UserContext = Depends(get_current_user),
):
    """
    Ask a question about the currently-loaded PDF.

    Body: { "question": "What is the main topic?" }
    """
    session = _get_session(user.uid)

    if session["index"] is None or session["chunks"] is None:
        raise HTTPException(
            status_code=400,
            detail="No PDF loaded for chatbot. Please process a PDF first.",
        )

    question = (body.get("question") or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    # Check if user is asking about a specific page/chunk by number
    metadata_chunks = _detect_metadata_query(question, session["chunks"])

    if metadata_chunks is not None:
        top_chunks = metadata_chunks
        print(f"\n  [Chatbot METADATA LOOKUP] Found {len(top_chunks)} chunks")
    else:
        top_chunks = search_similar_chunks(
            question, session["index"], session["chunks"], top_k=TOP_K
        )

    # Generate answer from LLM
    answer = generate_answer(question, top_chunks)
    file_id = session.get("file_id")
    if not file_id:
        raise HTTPException(status_code=400, detail="No file is active for chatbot history.")

    _save_chat_history(file_id, user, question, answer)

    return {
        "answer": answer,
        "source_file": session["filename"],
    }


# =========================================================
#  GET /chatbot/status
# =========================================================

@router.get("/status")
def chatbot_status(user: UserContext = Depends(get_current_user)):
    """Return current chatbot session state for the user."""
    session = _get_session(user.uid)
    return {
        "pdf_loaded": session["filename"] is not None,
        "filename": session["filename"],
        "total_chunks": len(session["chunks"]) if session["chunks"] else 0,
    }
