from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List

import requests
from fastapi import APIRouter, Body, Depends, HTTPException

from core.constants import FILES_COLLECTION, SHARED_FILES_COLLECTION, USERS_COLLECTION
from core.security import UserContext, get_current_user
from firebase_admin_init import firebase_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["smart-search"])

HF_TOKEN = os.getenv("HF_TOKEN", "")
HF_MODEL = "openai/gpt-oss-120b"
HF_API_URL = f"https://router.huggingface.co/novita/v3/openai/chat/completions"

# ──────────────────────────────────────────────
#  Firestore schema description fed to the LLM
# ──────────────────────────────────────────────
SCHEMA_PROMPT = """
You are a Firestore query generator. Given a user's natural language question, output ONLY a valid JSON object (no markdown, no explanation) describing the Firestore query to execute.

## Firestore Collections

### Collection: "user_files"
Document ID format: "{uid}:{file_name}"
Fields:
- file_name (string) – original file name
- last_opened_at (timestamp | null)
- size (integer) – file size in bytes
- uid (string) – owner user ID
- uploaded_at (timestamp) – when the file was uploaded
- tag_id (string | null) – tag category id
- expiry_time (timestamp | null)
- advance_security (boolean)
- aes_key (string | null)

### Collection: "shared_files"
Fields:
- owner_id (string) – uid of the file owner
- shared_user_id (string) – uid of the user the file is shared with
- file_id (string) – format "{owner_uid}:{file_name}"
- aes_key_shared (string)
- permissions (string) – "view" or "edit"
- sharedExpiryTime (timestamp | null)
- createdAt (timestamp)

### Collection: "users"
Document ID: uid
Fields:
- uid (string)
- email (string)
- name (string | null)
- picture (string | null)
- public_key (string)
- lastLogin (timestamp | null)
- createdAt (timestamp)

### Collection: "tags"
Document ID: tag_id
Fields:
- tag_id (string)
- tag_name (string)

### Available Tags (tag_id → tag_name)
{tags_list}

## Rules
- The current user's UID is: "{user_uid}"
- The current user's email is: "{user_email}"
- Today's date is: "{today}"
- When user asks about "my files", query "user_files" with uid == current user's UID.
- When user asks about shared files, query "shared_files" with owner_id == current user's UID (files I shared) or shared_user_id == current user's UID (files shared with me).
- For date filters, use ISO 8601 strings like "2026-02-01T00:00:00Z". Use field operators: ">=", "<=", "==", ">", "<".
- Always scope queries to the current user.
- When the user asks about files under a tag/category, filter "user_files" by tag_id using the EXACT tag_id from the Available Tags list above.
- Match the user's words to the closest available tag. For example: "bank documents" → "back_documents", "personal" → "presonal_documents", "government" or "govt" → "goverment_documents", "academic" → "academics", "tax" → "tax_records", "medical" or "health" → "medical_records", "bills" or "invoices" → "bills", "business" → "business_documents", "finance" or "financial" → "finance", "old files" or "archived" → "archive".
- NEVER invent a tag_id that is not in the Available Tags list. Always use the exact tag_id string from the list.

## Output JSON format
Return ONLY a JSON object (no markdown fences, no text). Example:
{
  "collection": "user_files",
  "filters": [
    {"field": "uid", "op": "==", "value": "<user_uid>"},
    {"field": "uploaded_at", "op": ">=", "value": "2026-02-01T00:00:00Z"},
    {"field": "uploaded_at", "op": "<", "value": "2026-03-01T00:00:00Z"}
  ],
  "order_by": {"field": "uploaded_at", "direction": "desc"},
  "limit": 50,
  "resolve_users": false,
  "description": "Files uploaded in February 2026"
}

If the question asks about users (e.g. "who did I share with"), set "resolve_users": true so the backend resolves UIDs to names/emails.

If the query needs results from shared_files joined with user info, still query shared_files and set resolve_users to true.
"""


def _call_llm(prompt: str) -> str:
    """Call HuggingFace Inference API (OpenAI-compatible chat endpoint)."""
    if not HF_TOKEN:
        raise HTTPException(status_code=500, detail="HF_TOKEN not configured on the server")

    headers = {
        "Authorization": f"Bearer {HF_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": HF_MODEL,
        "messages": [
            {"role": "system", "content": "You are a Firestore query generator. Reply ONLY with a JSON object, no markdown fences, no explanation."},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": 512,
        "temperature": 0.1,
    }

    try:
        resp = requests.post(HF_API_URL, headers=headers, json=payload, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"]["content"].strip()
        # Strip markdown fences if present
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\s*", "", content)
            content = re.sub(r"\s*```$", "", content)
        return content
    except requests.RequestException as exc:
        logger.exception("HuggingFace API call failed")
        raise HTTPException(status_code=502, detail=f"LLM service error: {exc}") from exc


def _parse_query_json(raw: str) -> Dict[str, Any]:
    """Parse the LLM JSON output."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Try to extract JSON from surrounding text
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            return json.loads(match.group())
        raise HTTPException(status_code=500, detail="LLM returned invalid query JSON")


def _parse_iso(value: str) -> datetime:
    """Parse an ISO 8601 string to datetime."""
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _execute_firestore_query(query_obj: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Execute a Firestore query described by the LLM output.

    Strategy to avoid composite-index errors:
    1. Try the full query (all filters + order_by).
    2. If that fails (missing index), retry without order_by.
    3. If that also fails, fall back to only equality (==) filters on
       Firestore, then apply range/inequality filters + sorting in-memory.
    """
    collection_name = query_obj.get("collection")
    if collection_name not in (FILES_COLLECTION, SHARED_FILES_COLLECTION, USERS_COLLECTION, "tags"):
        raise HTTPException(status_code=400, detail=f"Unsupported collection: {collection_name}")

    filters_raw = query_obj.get("filters", [])
    timestamp_fields = {
        "uploaded_at", "last_opened_at", "expiry_time",
        "sharedExpiryTime", "createdAt", "lastLogin",
    }

    def _coerce(f):
        """Return (field, op, value) with timestamps converted."""
        field, op, value = f["field"], f["op"], f["value"]
        if field in timestamp_fields and isinstance(value, str):
            value = _parse_iso(value)
        return field, op, value

    def _build_ref(use_filters, apply_order: bool):
        from google.cloud.firestore_v1.base_query import FieldFilter
        ref = firebase_db.collection(collection_name)
        for field, op, value in use_filters:
            ref = ref.where(filter=FieldFilter(field, op, value))
        if apply_order:
            order = query_obj.get("order_by")
            if order:
                from google.cloud.firestore_v1 import query as fq
                direction = (
                    fq.Query.DESCENDING if order.get("direction", "").lower() == "desc"
                    else fq.Query.ASCENDING
                )
                ref = ref.order_by(order["field"], direction=direction)
        limit = query_obj.get("limit", 50)
        ref = ref.limit(limit)
        return ref

    def _run(ref):
        results = []
        for doc in ref.stream():
            d = doc.to_dict()
            d["_doc_id"] = doc.id
            for k, v in d.items():
                if isinstance(v, datetime):
                    d[k] = v.isoformat()
            results.append(d)
        return results

    _OPS = {">=", "<=", ">", "<", "!=", "not-in", "array-contains-any"}

    def _apply_in_memory_filters(results, range_filters):
        """Apply non-equality filters in Python."""
        import operator
        op_map = {
            ">=": operator.ge, "<=": operator.le,
            ">": operator.gt, "<": operator.lt,
            "!=": operator.ne,
        }
        filtered = []
        for r in results:
            keep = True
            for field, op, value in range_filters:
                rval = r.get(field)
                if rval is None:
                    keep = False
                    break
                # Normalise both sides for comparison
                if isinstance(value, datetime) and isinstance(rval, str):
                    try:
                        rval = datetime.fromisoformat(rval)
                    except Exception:
                        keep = False
                        break
                fn = op_map.get(op)
                if fn and not fn(rval, value):
                    keep = False
                    break
            if keep:
                filtered.append(r)
        return filtered

    def _sort_results(results):
        order = query_obj.get("order_by")
        if order and results:
            field = order["field"]
            desc = order.get("direction", "").lower() == "desc"
            try:
                results.sort(key=lambda r: r.get(field, ""), reverse=desc)
            except TypeError:
                pass
        return results

    all_filters = [_coerce(f) for f in filters_raw]
    eq_filters = [(fld, op, val) for fld, op, val in all_filters if op == "=="]
    range_filters = [(fld, op, val) for fld, op, val in all_filters if op in _OPS]

    # ── Attempt 1: full query (all filters + order_by) ──
    try:
        return _run(_build_ref(all_filters, apply_order=True))
    except Exception as exc1:
        if "index" not in str(exc1).lower() and "FailedPrecondition" not in type(exc1).__name__:
            raise
        logger.warning("Index missing (attempt 1 – full query): %s", exc1)

    # ── Attempt 2: all filters, no order_by ──
    try:
        return _sort_results(_run(_build_ref(all_filters, apply_order=False)))
    except Exception as exc2:
        if "index" not in str(exc2).lower() and "FailedPrecondition" not in type(exc2).__name__:
            raise
        logger.warning("Index missing (attempt 2 – no order_by): %s", exc2)

    # ── Attempt 3: only equality filters on Firestore, rest in-memory ──
    results = _run(_build_ref(eq_filters, apply_order=False))
    if range_filters:
        results = _apply_in_memory_filters(results, range_filters)
    limit = query_obj.get("limit", 50)
    results = _sort_results(results)[:limit]
    return results


def _resolve_user_ids(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Look up user names/emails for UIDs found in results."""
    uid_fields = ["owner_id", "shared_user_id", "uid"]
    uids_to_resolve = set()
    for r in results:
        for field in uid_fields:
            uid = r.get(field)
            if uid:
                uids_to_resolve.add(uid)

    if not uids_to_resolve:
        return results

    user_map: Dict[str, Dict[str, str]] = {}
    for uid in uids_to_resolve:
        doc = firebase_db.collection(USERS_COLLECTION).document(uid).get()
        if doc.exists:
            data = doc.to_dict()
            user_map[uid] = {
                "name": data.get("name") or data.get("email", uid),
                "email": data.get("email", ""),
            }
        else:
            user_map[uid] = {"name": uid, "email": ""}

    for r in results:
        for field in uid_fields:
            uid = r.get(field)
            if uid and uid in user_map:
                r[f"{field}_name"] = user_map[uid]["name"]
                r[f"{field}_email"] = user_map[uid]["email"]

    return results


def _fetch_available_tags() -> str:
    """Fetch all tags from Firestore and format them for the LLM prompt."""
    try:
        docs = firebase_db.collection("tags").stream()
        lines = []
        for doc in docs:
            d = doc.to_dict()
            tag_id = d.get("tag_id", doc.id)
            tag_name = d.get("tag_name", tag_id)
            lines.append(f'- tag_id: "{tag_id}" → tag_name: "{tag_name}"')
        return "\n".join(lines) if lines else "- (no tags found)"
    except Exception as exc:
        logger.warning("Could not fetch tags for LLM prompt: %s", exc)
        return "- (unable to load tags)"


@router.post("/smart-search")
def smart_search(
    query: str = Body(..., embed=True),
    _user: UserContext = Depends(get_current_user),
):
    """Accept a natural-language question, use LLM to build a Firestore query, execute it, and return results."""
    today = datetime.utcnow().strftime("%Y-%m-%d")
    tags_list = _fetch_available_tags()

    prompt = SCHEMA_PROMPT.replace("{user_uid}", _user.uid)\
                          .replace("{user_email}", _user.email)\
                          .replace("{today}", today)\
                          .replace("{tags_list}", tags_list)
    prompt += f"\n\nUser question: {query}"

    # 1. Ask LLM to generate the query
    raw_llm = _call_llm(prompt)
    logger.info("LLM raw output: %s", raw_llm)

    # 2. Parse query JSON
    query_obj = _parse_query_json(raw_llm)

    # 3. Execute against Firestore
    results = _execute_firestore_query(query_obj)

    # 4. Optionally resolve user IDs to names
    if query_obj.get("resolve_users"):
        results = _resolve_user_ids(results)

    return {
        "description": query_obj.get("description", ""),
        "collection": query_obj.get("collection", ""),
        "count": len(results),
        "results": results,
    }
