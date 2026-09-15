import io
import os
import re
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image
from paddleocr import PaddleOCR

MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
ALLOWED_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}

app = FastAPI(title="Pigal OCR Service")
ocr_engine: Optional[PaddleOCR] = None


def get_ocr_engine() -> PaddleOCR:
    global ocr_engine
    if ocr_engine is None:
        ocr_engine = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
    return ocr_engine


def normalize_language_hint(language_hint: Optional[str]) -> str:
    value = (language_hint or "").strip().lower()
    if not value:
        return "unknown"
    if value.startswith("id") or "indonesia" in value or "bahasa" in value:
        return "id"
    if value.startswith("en") or "english" in value:
        return "en"
    return "multi"


def validate_file_bytes(file_bytes: bytes, received_mime: Optional[str]) -> None:
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")

    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 5 MB limit.")

    if received_mime and received_mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported MIME type.")

    try:
        with Image.open(io.BytesIO(file_bytes)) as img:
            img.verify()
            img_format = (img.format or "").upper()
            if img_format not in {"PNG", "JPEG", "WEBP"}:
                raise ValueError("Unsupported image format.")
    except Exception as exc:  # pragma: no cover - defensive validation
        raise HTTPException(status_code=400, detail="Corrupted or invalid image file.") from exc


def preprocess_image(file_bytes: bytes) -> np.ndarray:
    np_bytes = np.frombuffer(file_bytes, dtype=np.uint8)
    image = cv2.imdecode(np_bytes, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Failed to decode image.")

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.convertScaleAbs(gray, alpha=1.2, beta=10)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)

    height, width = gray.shape[:2]
    min_dim = min(height, width)
    if min_dim < 24:
        scale = 28 / float(min_dim)
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return binary


def calculate_bbox(points: List[List[float]]) -> List[int]:
    if not points:
        return [0, 0, 0, 0]
    xs = [float(point[0]) for point in points]
    ys = [float(point[1]) for point in points]
    x1 = min(xs)
    y1 = min(ys)
    x2 = max(xs)
    y2 = max(ys)
    return [int(round(x1)), int(round(y1)), int(round(max(0, x2 - x1))), int(round(max(0, y2 - y1)))]


def extract_text_from_result(ocr_result: Any) -> Dict[str, Any]:
    blocks: List[Dict[str, Any]] = []
    lines: List[str] = []
    confidences: List[float] = []

    if isinstance(ocr_result, tuple) and len(ocr_result) == 2:
        ocr_result = ocr_result[0]

    if isinstance(ocr_result, list) and len(ocr_result) == 1 and isinstance(ocr_result[0], list):
        ocr_result = ocr_result[0]

    if isinstance(ocr_result, list) and ocr_result and isinstance(ocr_result[0], list) and len(ocr_result[0]) >= 2:
        pass
    elif isinstance(ocr_result, list) and ocr_result and not isinstance(ocr_result[0], (list, tuple)):
        return {
            "text": "",
            "confidence": 0.0,
            "blocks": blocks,
            "warnings": ["No text detected in the uploaded image."],
        }

    if not ocr_result:
        return {
            "text": "",
            "confidence": 0.0,
            "blocks": blocks,
            "warnings": ["No text detected in the uploaded image."],
        }

    for item in ocr_result:
        if not item or len(item) < 2:
            continue
        coords = item[0]
        text_candidate = item[1]
        if not isinstance(text_candidate, (list, tuple)) or len(text_candidate) < 2:
            continue

        text = str(text_candidate[0]).strip()
        if not text:
            continue

        conf_value = text_candidate[1]
        try:
            confidence = float(conf_value)
        except (TypeError, ValueError):
            confidence = 0.0

        blocks.append({
            "text": text,
            "bbox": calculate_bbox(coords),
            "confidence": round(max(0.0, min(1.0, confidence)), 4),
        })
        lines.append(text)
        confidences.append(max(0.0, min(1.0, confidence)))

    text = "\n".join(lines)
    confidence = round(float(sum(confidences) / len(confidences)), 4) if confidences else 0.0
    warnings: List[str] = []
    if not text.strip():
        warnings.append("No usable text was extracted.")
    if confidence < 0.35:
        warnings.append("Low OCR confidence; extracted text may be incomplete.")

    return {
        "text": text,
        "confidence": confidence,
        "blocks": blocks,
        "warnings": warnings,
    }


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"status": "ok", "service": "pigal-ocr"}


@app.post("/ocr")
async def ocr_image(
    file: UploadFile = File(...),
    languageHint: Optional[str] = Form(default=None),
) -> JSONResponse:
    try:
        file_bytes = await file.read()
        validate_file_bytes(file_bytes, file.content_type)

        prepared = preprocess_image(file_bytes)
        engine = get_ocr_engine()
        ocr_raw = engine.ocr(prepared, cls=True)
        extracted = extract_text_from_result(ocr_raw)

        width = 0
        height = 0
        try:
            with Image.open(io.BytesIO(file_bytes)) as image:
                width, height = image.size
        except Exception:
            width, height = 0, 0

        response = {
            "success": bool(extracted["text"].strip()),
            "text": extracted["text"],
            "language": normalize_language_hint(languageHint),
            "confidence": extracted["confidence"],
            "blocks": extracted["blocks"],
            "metadata": {
                "width": width,
                "height": height,
                "mimeType": file.content_type or "application/octet-stream",
                "ocrModel": "paddleocr",
            },
            "warnings": extracted["warnings"],
            "error": None,
        }

        if not response["success"]:
            response["error"] = {
                "code": "NO_TEXT_FOUND",
                "message": "No usable text was detected in the uploaded image.",
                "retryable": False,
            }
            response["warnings"] = response["warnings"] or ["No usable text was extracted."]

        return JSONResponse(status_code=200, content=response)
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - runtime guard
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "text": "",
                "language": "unknown",
                "confidence": 0.0,
                "blocks": [],
                "metadata": {"width": 0, "height": 0, "mimeType": file.content_type or "application/octet-stream", "ocrModel": "paddleocr"},
                "warnings": [],
                "error": {
                    "code": "OCR_SERVICE_ERROR",
                    "message": "OCR service failed to process the image.",
                    "retryable": True,
                },
            },
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=int(os.getenv("OCR_PORT", "8000")), reload=False)
