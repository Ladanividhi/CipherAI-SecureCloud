"""
PDF text extraction module.
Handles both regular text-layer extraction (pypdf) and OCR fallback for scanned pages.
"""

from pypdf import PdfReader
from pdf2image import convert_from_path
import pytesseract
from PIL import Image
from concurrent.futures import ThreadPoolExecutor, as_completed
import io

from .config import OCR_DPI, MAX_OCR_WORKERS


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


def extract_pdf_text_from_bytes(pdf_bytes: bytes) -> list[dict]:
    """
    Extract text from PDF bytes (in-memory), returning per-page results.

    Returns:
        List of dicts: [{"page_number": 1, "text": "..."}, ...]
    """
    reader = PdfReader(io.BytesIO(pdf_bytes))
    total_pages = len(reader.pages)

    page_results: list[dict] = [
        {"page_number": i + 1, "text": ""} for i in range(total_pages)
    ]
    ocr_needed_indices: list[int] = []

    # ── Pass 1: fast pypdf extraction ──
    for idx, page in enumerate(reader.pages):
        text = _extract_text_pypdf(page)
        if len(text) > 30:
            page_results[idx]["text"] = text
        else:
            ocr_needed_indices.append(idx)

    # ── Pass 2: OCR for pages that need it ──
    if ocr_needed_indices:
        # For OCR we need to write bytes to a temp file since pdf2image needs a path
        import tempfile, os
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
                tmp.write(pdf_bytes)
                tmp_path = tmp.name

            print(f"  OCR needed for {len(ocr_needed_indices)}/{total_pages} pages")
            images_for_ocr: list[tuple[int, Image.Image]] = []
            for idx in ocr_needed_indices:
                imgs = convert_from_path(
                    tmp_path,
                    dpi=OCR_DPI,
                    first_page=idx + 1,
                    last_page=idx + 1,
                )
                if imgs:
                    images_for_ocr.append((idx, imgs[0]))

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
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)

    return page_results
