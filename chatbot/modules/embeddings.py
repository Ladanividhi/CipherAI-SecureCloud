"""
Embeddings and FAISS vector store module.
Handles embedding creation, FAISS index build/save/load, and similarity search.
"""

import os
import json
import hashlib

import numpy as np
import faiss
from sentence_transformers import SentenceTransformer

from config import DB_DIR, EMBED_MODEL_NAME, EMBED_BATCH_SIZE


# ── Load embedding model once at module import ──
print("Loading embedding model at startup...")
embed_model = SentenceTransformer(EMBED_MODEL_NAME)
print("Embedding model ready!")


# =========================================================
#  File hashing (for caching)
# =========================================================

def file_hash(path: str) -> str:
    """Fast MD5 hash of a file for cache-key purposes."""
    h = hashlib.md5()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


# =========================================================
#  DB paths
# =========================================================

def _db_paths(fhash: str):
    """Return (faiss_index_path, chunks_json_path) for a given hash."""
    return (
        os.path.join(DB_DIR, f"{fhash}.faiss"),
        os.path.join(DB_DIR, f"{fhash}_chunks.json"),
    )


# =========================================================
#  Embedding creation
# =========================================================

def create_embeddings(chunks: list[dict]) -> np.ndarray:
    """
    Encode chunk texts into normalized 384-dim vectors.
    
    Args:
        chunks: List of chunk dicts (must have "text" key).
    
    Returns:
        numpy array of shape (n_chunks, 384), float32, L2-normalized.
    """
    texts = [c["text"] for c in chunks]
    embeddings = embed_model.encode(
        texts,
        batch_size=EMBED_BATCH_SIZE,
        show_progress_bar=True,
        normalize_embeddings=True,
    )
    return np.array(embeddings).astype("float32")


# =========================================================
#  FAISS index build / save / load
# =========================================================

def build_faiss_index(embeddings: np.ndarray) -> faiss.IndexFlatIP:
    """Build an Inner-Product index (cosine sim on pre-normalized vectors)."""
    dimension = embeddings.shape[1]
    index = faiss.IndexFlatIP(dimension)
    index.add(embeddings)
    return index


def save_index(index: faiss.IndexFlatIP, chunks: list[dict], fhash: str):
    """Persist FAISS index + chunk metadata list to disk."""
    idx_path, chunks_path = _db_paths(fhash)
    faiss.write_index(index, idx_path)
    with open(chunks_path, "w", encoding="utf-8") as f:
        json.dump(chunks, f, ensure_ascii=False, indent=2)
    print(f"  Index saved → {idx_path}")


def load_index(fhash: str):
    """
    Load a previously persisted index + chunks.
    
    Returns:
        (index, chunks) or (None, None) if not cached.
    """
    idx_path, chunks_path = _db_paths(fhash)
    if os.path.exists(idx_path) and os.path.exists(chunks_path):
        index = faiss.read_index(idx_path)
        with open(chunks_path, "r", encoding="utf-8") as f:
            chunks = json.load(f)
        print(f"  Loaded cached index from {idx_path}")
        return index, chunks
    return None, None


# =========================================================
#  Similarity search
# =========================================================

def search_similar_chunks(query: str, index, chunks: list[dict], top_k: int = 3) -> list[dict]:
    """
    Find the top-k most similar chunks to the query using cosine similarity.

    Args:
        query: User's question string.
        index: FAISS IndexFlatIP.
        chunks: List of chunk dicts with metadata.
        top_k: Number of results to return.

    Returns:
        List of chunk dicts (with added "score" key), sorted by similarity.
    """
    query_vector = embed_model.encode([query], normalize_embeddings=True)
    query_vector = np.array(query_vector).astype("float32")
    scores, indices = index.search(query_vector, top_k)

    results = []
    for i, idx in enumerate(indices[0]):
        if idx < len(chunks):
            chunk = chunks[idx].copy()
            chunk["score"] = float(scores[0][i])
            results.append(chunk)
    return results
