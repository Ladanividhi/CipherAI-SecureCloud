"""
Text processing module.
Handles cleaning raw text and splitting it into chunks with rich metadata.
"""

import re
import uuid

from config import CHUNK_SIZE, CHUNK_OVERLAP


def clean_text(text: str) -> str:
    """Collapse whitespace and remove null characters."""
    text = re.sub(r'\s+', ' ', text)
    text = text.replace('\x00', ' ')
    return text.strip()


def create_chunks(page_results: list[dict], source_filename: str) -> list[dict]:
    """
    Take per-page extracted text and produce enriched chunks.

    Args:
        page_results: List of {"page_number": int, "text": str} from pdf_extractor.
        source_filename: Original PDF filename (e.g. "4-Normalization.pdf").

    Returns:
        List of chunk dicts:
        {
            "id": "bf29ff0b26c6",
            "text": "...",
            "source": "4-Normalization.pdf",
            "page_number": 5,
            "chunk_index": 12
        }
    """
    chunks: list[dict] = []
    chunk_index = 0

    for page in page_results:
        page_number = page["page_number"]
        raw_text = page["text"]

        if not raw_text or not raw_text.strip():
            continue

        cleaned = clean_text(raw_text)

        # Split this page's text into fixed-size overlapping chunks
        start = 0
        text_length = len(cleaned)

        while start < text_length:
            end = start + CHUNK_SIZE
            chunk_text = cleaned[start:end].strip()

            if chunk_text:
                chunk_id = uuid.uuid4().hex[:12]  # short unique ID
                chunks.append({
                    "id": chunk_id,
                    "text": chunk_text,
                    "source": source_filename,
                    "page_number": page_number,
                    "chunk_index": chunk_index,
                })
                chunk_index += 1

            start = end - CHUNK_OVERLAP

    return chunks
