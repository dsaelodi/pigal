# OCR Service

This service extracts text from uploaded screenshots for the Pigal scam-risk analysis pipeline.

## Local development

```bash
cd ocr-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

## API

### POST /ocr

Request:

- multipart/form-data
- field name: `file`
- optional: `languageHint`

Response:

```json
{
  "success": true,
  "text": "...",
  "language": "id",
  "confidence": 0.91,
  "blocks": [
    {
      "text": "...",
      "bbox": [0, 0, 100, 20],
      "confidence": 0.9
    }
  ],
  "metadata": {
    "width": 1080,
    "height": 1920,
    "mimeType": "image/jpeg",
    "ocrModel": "paddleocr"
  },
  "warnings": [],
  "error": null
}
```

## Notes

- The service runs in memory and does not persist uploaded files.
- Temporary data is discarded immediately after processing.
- It is intended to be private to the internal network and reached by the Next.js backend only.
