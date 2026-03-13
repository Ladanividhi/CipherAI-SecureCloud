"""
Centralized configuration for the PDF Chatbot module.
Reads settings from environment variables (shared with the main app).
"""

import os

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

# ── Directories (relative to backend/) ──
CHATBOT_DB_DIR = os.path.join(os.path.dirname(__file__), "..", "chatbot_db")
CHATBOT_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "chatbot_data")

os.makedirs(CHATBOT_DB_DIR, exist_ok=True)
os.makedirs(CHATBOT_DATA_DIR, exist_ok=True)
