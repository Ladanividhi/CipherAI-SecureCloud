"""
PDF Chatbot – FastAPI Application (thin router).
All logic is in the modules/ package.
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import re
import shutil
import time

from config import DATA_DIR, DB_DIR, ALLOWED_ORIGINS, TOP_K
from modules.pdf_extractor import extract_pdf_text
from modules.text_processing import create_chunks
from modules.embeddings import (
    file_hash,
    create_embeddings,
    build_faiss_index,
    save_index,
    load_index,
    search_similar_chunks,
)
from modules.llm import generate_answer

# =========================================================
#  FastAPI App
# =========================================================

app = FastAPI(title="PDF Chatbot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
#  Session state (single-user; for production use a DB)
# =========================================================

session = {
    "chunks": None,     # list[dict] with id, text, source, page_number, chunk_index
    "index": None,      # FAISS IndexFlatIP
    "filename": None,   # str
}

# Ensure directories exist
os.makedirs(DB_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

# =========================================================
#  Helper: pretty-print chunks to terminal
# =========================================================

def print_retrieved_chunks(question: str, chunks: list[dict]):
    """Display the chunks used for answering in the terminal."""
    print("\n" + "=" * 70)
    print(f"  QUESTION: {question}")
    print("=" * 70)
    for i, chunk in enumerate(chunks, 1):
        score = chunk.get("score")
        score_str = f"{score:.4f}" if score is not None else "direct match"
        print(f"\n  --- Chunk {i} (score: {score_str}) ---")
        print(f"  ID          : {chunk['id']}")
        print(f"  Source      : {chunk['source']}")
        print(f"  Page        : {chunk['page_number']}")
        print(f"  Chunk Index : {chunk['chunk_index']}")
        print(f"  Text        : {chunk['text'][:200]}{'…' if len(chunk['text']) > 200 else ''}")
    print("\n" + "=" * 70 + "\n")

# =========================================================
#  Metadata-based chunk retrieval
# =========================================================

def find_chunks_by_page(chunks: list[dict], page_number: int) -> list[dict]:
    """Return all chunks belonging to a specific page number."""
    return [c for c in chunks if c["page_number"] == page_number]


def find_chunks_by_index(chunks: list[dict], chunk_index: int) -> list[dict]:
    """Return the chunk with a specific chunk_index."""
    return [c for c in chunks if c["chunk_index"] == chunk_index]


def detect_metadata_query(question: str, chunks: list[dict]):
    """
    Check if the user is asking about a specific page number or chunk index.
    Returns matching chunks if found, otherwise None (fall back to semantic search).
    """
    q = question.lower()

    # Match patterns like "page 11", "page_number 11", "page number 11", "page no 11"
    page_match = re.search(r'page[_ ]?(?:number|num|no\.?)?[\s:]*?(\d+)', q)
    if page_match:
        page_num = int(page_match.group(1))
        matched = find_chunks_by_page(chunks, page_num)
        if matched:
            return matched

    # Match patterns like "chunk 28", "chunk_index 28", "chunk index 28"
    chunk_match = re.search(r'chunk[_ ]?(?:index|idx|no\.?)?[\s:]*?(\d+)', q)
    if chunk_match:
        chunk_idx = int(chunk_match.group(1))
        matched = find_chunks_by_index(chunks, chunk_idx)
        if matched:
            return matched

    return None

# =========================================================
#  Request models
# =========================================================

class QuestionRequest(BaseModel):
    question: str

# =========================================================
#  API Endpoints
# =========================================================

@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed.")

    # Save uploaded file
    save_path = os.path.join(DATA_DIR, file.filename)
    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    start = time.time()

    # Check cache
    fhash = file_hash(save_path)
    cached_index, cached_chunks = load_index(fhash)

    if cached_index is not None:
        session["chunks"] = cached_chunks
        session["index"] = cached_index
        session["filename"] = file.filename
        elapsed = round(time.time() - start, 2)
        print(f"  Loaded '{file.filename}' from cache ({len(cached_chunks)} chunks)")
        return {
            "message": f"PDF '{file.filename}' loaded from cache.",
            "chunks": len(cached_chunks),
            "time_seconds": elapsed,
        }

    # ── Full processing pipeline ──
    print(f"\nProcessing '{file.filename}' …")

    # 1. Extract text per page
    page_results = extract_pdf_text(save_path)
    if not any(p["text"].strip() for p in page_results):
        raise HTTPException(status_code=400, detail="Could not extract any text from this PDF.")

    # 2. Create chunks with metadata
    chunks = create_chunks(page_results, source_filename=file.filename)
    print(f"  Created {len(chunks)} chunks")

    # 3. Create embeddings
    embeddings = create_embeddings(chunks)

    # 4. Build FAISS index
    index = build_faiss_index(embeddings)

    # 5. Persist to disk
    save_index(index, chunks, fhash)

    # 6. Store in session
    session["chunks"] = chunks
    session["index"] = index
    session["filename"] = file.filename
    elapsed = round(time.time() - start, 2)

    return {
        "message": f"PDF '{file.filename}' processed successfully.",
        "chunks": len(chunks),
        "time_seconds": elapsed,
    }


@app.post("/api/ask")
async def ask_question(req: QuestionRequest):
    if session["index"] is None or session["chunks"] is None:
        raise HTTPException(status_code=400, detail="No PDF uploaded yet. Please upload a PDF first.")

    question = req.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    # Check if user is asking about a specific page/chunk by number
    metadata_chunks = detect_metadata_query(question, session["chunks"])

    if metadata_chunks is not None:
        # Direct metadata lookup — no similarity search needed
        top_chunks = metadata_chunks
        print(f"\n  [METADATA LOOKUP] Found {len(top_chunks)} chunks by page/chunk number")
    else:
        # Semantic similarity search
        top_chunks = search_similar_chunks(
            question, session["index"], session["chunks"], top_k=TOP_K
        )

    # ── Print retrieved chunks to terminal ──
    print_retrieved_chunks(question, top_chunks)

    # Generate answer from LLM
    answer = generate_answer(question, top_chunks)

    return {
        "answer": answer,
        "source_file": session["filename"],
    }


@app.get("/api/status")
async def get_status():
    return {
        "pdf_loaded": session["filename"] is not None,
        "filename": session["filename"],
        "total_chunks": len(session["chunks"]) if session["chunks"] else 0,
    }
