from __future__ import annotations

import sys
from typing import Iterable

from pydantic import BaseModel

try:
    from firebase_admin_init import firebase_db
except ModuleNotFoundError:
    # Allow running as a script: `python backend/models/tag.py`
    # by ensuring the `backend/` folder is on sys.path.
    from pathlib import Path

    BACKEND_DIR = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(BACKEND_DIR))
    from firebase_admin_init import firebase_db


TAGS_COLLECTION = "tags"


class TagModel(BaseModel):
    tag_id: str
    tag_name: str


DEFAULT_TAG_NAMES: list[str] = [
    "Academics",
    "goverment_documents",
    "finance",
    "medical_records",
    "business_documents",
    "bills",
    "tax_records",
    "back_documents",
    "presonal_documents",
    "archive",
]


def _tag_id_from_name(tag_name: str) -> str:
    return tag_name.strip().lower()


def seed_tags(tag_names: Iterable[str] = DEFAULT_TAG_NAMES) -> int:
    """Create/merge the default tags into Firestore.

    Firestore doesn't require creating a table upfront; writing documents creates the
    collection automatically.

    Returns the number of tags written.
    """

    collection = firebase_db.collection(TAGS_COLLECTION)
    count = 0

    for name in tag_names:
        cleaned_name = (name or "").strip()
        if not cleaned_name:
            continue

        tag = TagModel(tag_id=_tag_id_from_name(cleaned_name), tag_name=cleaned_name)
        collection.document(tag.tag_id).set(tag.dict(), merge=True)
        count += 1

    return count


if __name__ == "__main__":
    written = seed_tags()
    print(f"Seeded {written} tags into Firestore collection '{TAGS_COLLECTION}'.")
