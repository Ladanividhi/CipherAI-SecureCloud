"""
Centralized configuration for the PDF Chatbot.
All constants and settings are defined here.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ── Directories ──
DB_DIR = "db"
DATA_DIR = "data"

# ── Embedding Model ──
EMBED_MODEL_NAME = "all-MiniLM-L6-v2"
EMBED_BATCH_SIZE = 64

# ── Chunking ──
CHUNK_SIZE = 500
CHUNK_OVERLAP = 100

# ── OCR ──
OCR_DPI = 200
MAX_OCR_WORKERS = 4

# ── LLM ──
HF_TOKEN = os.getenv("HF_TOKEN")
LLM_MODEL = "openai/gpt-oss-20b"
LLM_TEMPERATURE = 0.2
LLM_MAX_TOKENS = 1024

# ── Search ──
TOP_K = 3

# ── CORS ──
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
]
