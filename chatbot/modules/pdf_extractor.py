"""
PDF text extraction module.
Handles both regular text-layer extraction (pypdf) and OCR fallback for scanned pages.
"""

from pypdf import PdfReader
from pdf2image import convert_from_path
import pytesseract
from PIL import Image
from concurrent.futures import ThreadPoolExecutor, as_completed

from config import OCR_DPI, MAX_OCR_WORKERS


def _extract_text_pypdf(page) -> str:
    """Try fast text-layer extraction via pypdf."""
    try:
        text = page.extract_text() or ""
        return text.strip()
    except Exception:
        return ""


def _ocr_single_image(image: Image.Image) -> str:
    """Run Tesseract OCR on one PIL image (one PDF page)."""
    try:
        return pytesseract.image_to_string(image) or ""
    except Exception:
        return ""


def extract_pdf_text(pdf_path: str) -> list[dict]:
    """
    Extract text from a PDF file, returning per-page results.

    Returns:
        List of dicts: [{"page_number": 1, "text": "..."}, ...]
    
    Two-pass extraction:
      1. Fast pass  – pypdf text layer (sequential, very fast).
      2. OCR pass   – only for pages where pypdf returned little/no text.
                      Uses ThreadPoolExecutor so Tesseract runs in parallel.
    """
    reader = PdfReader(pdf_path)
    total_pages = len(reader.pages)

    # Prepare per-page result list
    page_results: list[dict] = [
        {"page_number": i + 1, "text": ""} for i in range(total_pages)
    ]
    ocr_needed_indices: list[int] = []

    # ── Pass 1: fast pypdf extraction ──
    for idx, page in enumerate(reader.pages):
        text = _extract_text_pypdf(page)
        if len(text) > 30:  # page has meaningful text
            page_results[idx]["text"] = text
        else:
            ocr_needed_indices.append(idx)

    # ── Pass 2: OCR for pages that need it ──
    if ocr_needed_indices:
        print(f"  OCR needed for {len(ocr_needed_indices)}/{total_pages} pages – converting to images …")

        images_for_ocr: list[tuple[int, Image.Image]] = []
        for idx in ocr_needed_indices:
            imgs = convert_from_path(
                pdf_path,
                dpi=OCR_DPI,
                first_page=idx + 1,
                last_page=idx + 1,
            )
            if imgs:
                images_for_ocr.append((idx, imgs[0]))

        print(f"  Running OCR on {len(images_for_ocr)} pages with {MAX_OCR_WORKERS} workers …")
        with ThreadPoolExecutor(max_workers=MAX_OCR_WORKERS) as pool:
            futures = {
                pool.submit(_ocr_single_image, img): idx
                for idx, img in images_for_ocr
            }
            for future in as_completed(futures):
                idx = futures[future]
                try:
                    page_results[idx]["text"] = future.result()
                except Exception as exc:
                    print(f"  OCR failed for page {idx + 1}: {exc}")

    return page_results
