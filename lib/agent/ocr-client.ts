export type OcrBlock = {
  text: string;
  bbox: number[];
  confidence: number;
};

export type OcrMetadata = {
  width: number;
  height: number;
  mimeType: string;
  ocrModel: string;
};

export type OcrResult = {
  success: boolean;
  text: string;
  language: string;
  confidence: number;
  blocks: OcrBlock[];
  metadata: OcrMetadata;
  warnings: string[];
  error: {
    code: string;
    message: string;
    retryable: boolean;
  } | null;
};

export function isOcrConfigured(): boolean {
  return Boolean(process.env.OCR_SERVICE_URL && process.env.OCR_SERVICE_URL.trim());
}

export async function callOcrService(file: File): Promise<OcrResult> {
  const serviceUrl = process.env.OCR_SERVICE_URL?.trim();
  if (!serviceUrl) {
    throw new Error("OCR_SERVICE_URL is not configured.");
  }

  const endpoint = `${serviceUrl.replace(/\/+$/, "")}/ocr`;
  const fileBytes = await file.arrayBuffer();
  const formData = new FormData();
  const uploadName = file.name || "upload.png";
  const uploadBlob = new Blob([fileBytes], { type: file.type || "application/octet-stream" });
  formData.append("file", uploadBlob, uploadName);

  const languageHint = "id,en";
  formData.append("languageHint", languageHint);

  const token = process.env.OCR_INTERNAL_TOKEN?.trim();
  const timeoutMs = Number(process.env.OCR_TIMEOUT_MS || "20000");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs || 20000);

  console.info("[ocr-client] request starting", {
    filename: uploadName,
    mimeType: file.type || "application/octet-stream",
    fileSize: fileBytes.byteLength,
    serviceUrl,
    timeoutMs: timeoutMs || 20000,
  });

  const startedAt = Date.now();

  try {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof DOMException && error.name === "AbortError") {
        console.error("[ocr-client] request timed out", {
          endpoint,
          elapsedMs: Date.now() - startedAt,
          timeoutMs: timeoutMs || 20000,
        });
      } else {
        console.error("[ocr-client] network/fetch error", {
          endpoint,
          elapsedMs: Date.now() - startedAt,
          message,
        });
      }
      throw error;
    }

    console.info("[ocr-client] response received", {
      endpoint,
      status: response.status,
      elapsedMs: Date.now() - startedAt,
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("[ocr-client] non-2xx response", {
        endpoint,
        status: response.status,
        body,
      });
      throw new Error(body || `OCR service returned ${response.status}`);
    }

    let payload: OcrResult;
    try {
      payload = (await response.json()) as OcrResult;
    } catch (error) {
      console.error("[ocr-client] invalid JSON response", {
        endpoint,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    if (!payload || typeof payload !== "object") {
      console.error("[ocr-client] malformed response payload", { endpoint });
      throw new Error("Malformed OCR response.");
    }

    const normalizedText = typeof payload.text === "string" ? payload.text : "";
    if (!payload.success) {
      console.warn("[ocr-client] OCR response success=false", {
        endpoint,
        textEmpty: normalizedText.trim().length === 0,
        textLength: normalizedText.length,
        error: payload.error,
        warnings: payload.warnings,
      });
    } else {
      console.info("[ocr-client] OCR response success=true", {
        endpoint,
        textEmpty: normalizedText.trim().length === 0,
        textLength: normalizedText.length,
      });
    }

    return {
      success: Boolean(payload.success),
      text: normalizedText,
      language: typeof payload.language === "string" ? payload.language : "unknown",
      confidence: typeof payload.confidence === "number" ? payload.confidence : 0,
      blocks: Array.isArray(payload.blocks) ? payload.blocks : [],
      metadata: {
        width: Number(payload.metadata?.width || 0),
        height: Number(payload.metadata?.height || 0),
        mimeType: typeof payload.metadata?.mimeType === "string" ? payload.metadata.mimeType : "unknown",
        ocrModel: typeof payload.metadata?.ocrModel === "string" ? payload.metadata.ocrModel : "unknown",
      },
      warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
      error: payload.error ?? null,
    };
  } finally {
    clearTimeout(timeout);
  }
}
