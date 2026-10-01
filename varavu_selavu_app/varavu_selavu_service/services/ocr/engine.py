"""Server-side receipt OCR with RapidOCR (PaddleOCR PP-OCRv4 models on ONNX Runtime).

The models ship inside the rapidocr-onnxruntime wheel, so nothing is
downloaded at runtime. Loading takes a few seconds, so the engine is a lazy,
thread-safe singleton that main.py warms up in the background at startup.
"""
from __future__ import annotations

import io
import logging
import math
import threading
from typing import List, Optional, Tuple

from varavu_selavu_service.services.ocr.layout import OcrFragment, OcrRow, group_rows

logger = logging.getLogger("varavu_selavu.ocr")

# Memory is dominated by the detection model's activations, which scale with
# the input area (measured peaks: 2000px side ~1.1GB, 1280px ~560MB, 960px
# ~460MB including the models). So images are capped at _MAX_WIDTH and tall
# receipts are OCR'd in overlapping vertical tiles of at most _TILE_SIDE —
# full resolution for small print, bounded memory for long grocery receipts.
# 900px across a receipt is still ~20px per character of thermal print.
_MAX_WIDTH = 900
_MAX_HEIGHT = 6000
_TILE_SIDE = 960
_TILE_OVERLAP = 96
_REC_BATCH = 3
_PDF_RENDER_SCALE = 200 / 72
_MIN_PDF_TEXT_CHARS = 20

_engine = None
_engine_lock = threading.Lock()
# One OCR at a time per process: on a 1-vCPU instance parallel runs only add
# memory (each holds its own activations), not throughput.
_run_lock = threading.Lock()


class OcrUnavailable(RuntimeError):
    """Raised when the OCR engine can't be loaded (missing wheel on this platform)."""


def _get_engine():
    global _engine
    if _engine is None:
        with _engine_lock:
            if _engine is None:
                try:
                    from rapidocr_onnxruntime import RapidOCR
                except ImportError as exc:  # pragma: no cover - platform without the wheel
                    raise OcrUnavailable(str(exc)) from exc
                _engine = RapidOCR(
                    max_side_len=_TILE_SIDE,
                    rec_batch_num=_REC_BATCH,
                    intra_op_num_threads=1,
                    inter_op_num_threads=1,
                )
    return _engine


def warm_up() -> None:
    """Load the ONNX models ahead of the first request. Safe to call twice."""
    try:
        _get_engine()
        logger.info("RapidOCR engine loaded")
    except Exception:  # pragma: no cover - logged, request path will retry
        logger.exception("RapidOCR warm-up failed")


def _load_image(data: bytes):
    from PIL import Image, ImageOps

    try:
        import pillow_heif

        pillow_heif.register_heif_opener()
    except ImportError:  # pragma: no cover
        pass
    img = Image.open(io.BytesIO(data))
    # Crop before reducing resolution: background pixels must not consume the
    # receipt's text-resolution budget. EXIF orientation precedes all geometry.
    return ImageOps.exif_transpose(img).convert("RGB")


def _crop_receipt(img):
    """Conservative bright-paper detection; ambiguous scenes retain the full image."""
    import cv2
    import numpy as np
    from PIL import Image

    preview = img.copy()
    preview.thumbnail((1000, 1000), Image.Resampling.LANCZOS)
    gray = cv2.cvtColor(np.asarray(preview), cv2.COLOR_RGB2GRAY)
    _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)
    if not contours:
        return img
    area = cv2.contourArea(contours[0])
    x, y, w, h = cv2.boundingRect(contours[0])
    fraction = area / (preview.width * preview.height)
    if not (0.15 <= fraction <= 0.9) or area / (w * h) < 0.7:
        return img
    if len(contours) > 1 and cv2.contourArea(contours[1]) > area * 0.2:
        return img
    # Require visible background around the document, not a bright patch inside it.
    if x <= 1 or y <= 1 or x + w >= preview.width - 1 or y + h >= preview.height - 1:
        return img
    sx, sy = img.width / preview.width, img.height / preview.height
    pad = max(8, round(min(w * sx, h * sy) * 0.015))
    return img.crop((max(0, int(x * sx) - pad), max(0, int(y * sy) - pad),
                     min(img.width, int((x + w) * sx) + pad),
                     min(img.height, int((y + h) * sy) + pad)))


def _prepare_image(img, variant=0):
    from PIL import Image, ImageOps

    # The last recovery pass preserves the original scene if cropping was wrong.
    if variant != 2:
        img = _crop_receipt(img)
        if img.width > 1.8 * img.height:
            img = img.transpose(Image.Transpose.ROTATE_90)
    if variant:
        img = ImageOps.autocontrast(img.convert("L"), cutoff=1).convert("RGB")
    width = _MAX_WIDTH if variant == 0 else 1100
    scale = min(1.0, width / img.width, _MAX_HEIGHT / img.height)
    if scale < 1:
        img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.Resampling.LANCZOS)
    return img


def _pdf_first_page(data: bytes) -> Tuple[Optional[List[str]], Optional[object]]:
    """Digital PDFs (e-receipts) carry an exact text layer — use it and skip OCR.
    Scanned PDFs have none, so render page 1 for OCR instead."""
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(data)
    try:
        page = pdf[0]
        text = page.get_textpage().get_text_range() or ""
        if len(text.strip()) >= _MIN_PDF_TEXT_CHARS:
            lines = [ln.rstrip() for ln in text.replace("\r", "\n").split("\n") if ln.strip()]
            return lines, None
        bitmap = page.render(scale=_PDF_RENDER_SCALE)
        return None, bitmap.to_pil().convert("RGB")
    finally:
        pdf.close()


def _tiles(height: int) -> List[Tuple[int, int]]:
    """(top, bottom) bands covering the image, overlapping by at least
    _TILE_OVERLAP so every text line lies wholly inside some band. Every band
    is full height: the detector upscales inputs to a ~736px minimum side, so a
    thin leftover strip at the bottom would balloon into a huge, slow input."""
    if height <= _TILE_SIDE:
        return [(0, height)]
    bands = []
    top = 0
    while top + _TILE_SIDE < height:
        bands.append((top, top + _TILE_SIDE))
        top += _TILE_SIDE - _TILE_OVERLAP
    bands.append((height - _TILE_SIDE, height))  # bottom-anchored last band
    return bands


def ocr_image(img) -> Tuple[List[OcrRow], int]:
    """OCR a PIL image; returns rows top-to-bottom and the image width."""
    import numpy as np

    engine = _get_engine()
    arr = np.array(img)[:, :, ::-1]  # RGB -> BGR, which RapidOCR/OpenCV expect
    bands = _tiles(arr.shape[0])
    # A line inside an overlap is seen by both bands; each band owns the text
    # whose centre lies on its side of the overlap's midpoint.
    cuts = [(bands[i][1] + bands[i + 1][0]) / 2 for i in range(len(bands) - 1)]
    fragments: List[OcrFragment] = []
    for i, (top, bottom) in enumerate(bands):
        with _run_lock:
            result, _elapsed = engine(np.ascontiguousarray(arr[top:bottom]))
        keep_from = cuts[i - 1] if i > 0 else float("-inf")
        keep_to = cuts[i] if i < len(cuts) else float("inf")
        for box, text, score in result or []:
            box = [(p[0], p[1] + top) for p in box]
            cy = sum(p[1] for p in box) / len(box)
            if keep_from <= cy < keep_to:
                fragments.append(_fragment(box, text, score))
    return group_rows(fragments, image_width=img.width), img.width


def _fragment(box, text, score) -> OcrFragment:
    xs = [p[0] for p in box]
    ys = [p[1] for p in box]
    # RapidOCR corners are clockwise from top-left: top edge is box[0] -> box[1].
    (x0, y0), (x1, y1) = box[0], box[1]
    return OcrFragment(
        text=str(text),
        x=float(min(xs)),
        y=float(min(ys)),
        w=float(max(xs) - min(xs)),
        h=float(max(ys) - min(ys)),
        conf=float(score),
        angle=math.atan2(y1 - y0, x1 - x0) if x1 != x0 else 0.0,
    )


def read_receipt(data: bytes, mime: Optional[str], variant: int = 0) -> List[OcrRow]:
    """Bytes of an image or PDF -> OCR rows. Raises OcrUnavailable if the engine can't load."""
    if (mime or "").lower() == "application/pdf" or data[:5] == b"%PDF-":
        lines, img = _pdf_first_page(data)
        if lines is not None:
            return [OcrRow(text=ln, y=float(i), conf=1.0) for i, ln in enumerate(lines)]
    else:
        img = _load_image(data)
    rows, _width = ocr_image(_prepare_image(img, variant))
    return rows
