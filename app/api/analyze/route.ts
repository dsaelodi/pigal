import { NextResponse } from "next/server";
import { z } from "zod";
import { executeAnalysis } from "@/lib/agent";
import { callOcrService } from "@/lib/agent/ocr-client";

const evidenceSchema = z.object({
  companyName: z.string().optional(),
  website: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  investmentProposal: z.string().optional(),
  salesChat: z.string().optional(),
  links: z.array(z.string()).optional(),
  socialMedia: z.array(z.string()).optional(),
  screenshots: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        size: z.number().optional(),
        type: z.string().optional(),
        previewUrl: z.string().optional(),
      })
    )
    .optional(),
});

const requestSchema = z.object({
  content: z.string().optional(),
  companyName: z.string().optional(),
  website: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankAccount: z.string().optional(),
  investmentProposal: z.string().optional(),
  salesChat: z.string().optional(),
  links: z.array(z.string()).optional(),
  socialMedia: z.array(z.string()).optional(),
  evidence: evidenceSchema.optional(),
});

function getOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getOptionalStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : undefined;
}

function buildMergedInput(payload: { content?: string; evidence?: z.infer<typeof evidenceSchema>; rest?: Record<string, unknown> }) {
  const { content, evidence, rest } = payload;

  return {
    content: content || "",
    companyName: evidence?.companyName || getOptionalString(rest?.companyName),
    website: evidence?.website || getOptionalString(rest?.website),
    bankAccountNumber: evidence?.bankAccountNumber || getOptionalString(rest?.bankAccountNumber) || getOptionalString(rest?.bankAccount),
    investmentProposal: evidence?.investmentProposal || getOptionalString(rest?.investmentProposal),
    salesChat: evidence?.salesChat || getOptionalString(rest?.salesChat),
    links: evidence?.links || getOptionalStringList(rest?.links),
    socialMedia: evidence?.socialMedia || getOptionalStringList(rest?.socialMedia),
    screenshots: evidence?.screenshots,
  };
}

function normalizeOcrText(ocrText: string, index: number): string {
  const trimmed = (ocrText || "").trim();
  if (!trimmed) {
    return "";
  }
  return `[SCREENSHOT ${index + 1}]\n${trimmed}\n`;
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const content = String(formData.get("content") || "");
      const companyName = String(formData.get("companyName") || "");
      const website = String(formData.get("website") || "");
      const bankAccountNumber = String(formData.get("bankAccountNumber") || "");
      const investmentProposal = String(formData.get("investmentProposal") || "");
      const salesChat = String(formData.get("salesChat") || "");
      const links = formData.getAll("links").map((item) => String(item));
      const socialMedia = formData.getAll("socialMedia").map((item) => String(item));
      const screenshotFiles = formData.getAll("screenshots").filter((item): item is File => item instanceof File);

      console.info("[/api/analyze] multipart request received", {
        contentType,
        screenshotCount: screenshotFiles.length,
      });

      let ocrCombinedText = "";
      const fallbackScreenshots = screenshotFiles.map((file, index) => ({
        id: `${file.name}-${index}`,
        name: file.name,
        size: file.size,
        type: file.type,
        previewUrl: "",
      }));

      if (screenshotFiles.length > 0) {
        const ocrResults = await Promise.all(
          screenshotFiles.map(async (file, index) => {
            try {
              const result = await callOcrService(file);
              return { index, result };
            } catch (error) {
              console.error("[/api/analyze] OCR request failed", {
                index,
                filename: file.name,
                mimeType: file.type,
                fileSize: file.size,
                message: error instanceof Error ? error.message : String(error),
              });
              return { index, result: null };
            }
          })
        );

        const successful = ocrResults.filter((item) => item.result && item.result.success && item.result.text.trim());

        if (successful.length > 0) {
          ocrCombinedText = successful
            .map((item) => normalizeOcrText(item.result!.text, item.index))
            .join("\n");
        }

        const failedCount = ocrResults.filter((item) => !item.result || !item.result.success).length;
        if (failedCount > 0 && successful.length === 0) {
          console.error("[/api/analyze] OCR failed for every screenshot", {
            screenshotCount: screenshotFiles.length,
            failedCount,
          });
          return NextResponse.json(
            {
              error: "Tidak dapat membaca teks dari screenshot yang dikirim.",
              detail: "OCR failed for every uploaded file.",
            },
            { status: 422 }
          );
        }
      }

      console.info("[/api/analyze] forwarding OCR-backed input", {
        screenshotCount: screenshotFiles.length,
        ocrTextLength: ocrCombinedText.length,
      });

      const mergedInput = {
        content: [content, ocrCombinedText].filter(Boolean).join("\n\n"),
        companyName: companyName || undefined,
        website: website || undefined,
        bankAccountNumber: bankAccountNumber || undefined,
        investmentProposal: investmentProposal || undefined,
        salesChat: salesChat || undefined,
        links: links.length > 0 ? links : undefined,
        socialMedia: socialMedia.length > 0 ? socialMedia : undefined,
        screenshots: fallbackScreenshots.length > 0 ? fallbackScreenshots : undefined,
      };

      const analysis = await executeAnalysis(mergedInput);

      if (analysis.status === "insufficient_evidence") {
        return NextResponse.json(
          {
            error: "Bukti tidak mencukupi untuk dianalisis.",
            analysis,
          },
          { status: 422 }
        );
      }

      return NextResponse.json(analysis);
    }

    const payload = await request.json();
    const parsed = requestSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Format permintaan analisis tidak valid.",
        },
        { status: 400 }
      );
    }

    const { content, evidence, ...rest } = parsed.data;
    const mergedInput = buildMergedInput({ content, evidence, rest });

    const analysis = await executeAnalysis(mergedInput);

    if (analysis.status === "insufficient_evidence") {
      return NextResponse.json(
        {
          error: "Bukti tidak mencukupi untuk dianalisis.",
          analysis,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(analysis);
  } catch (error) {
    console.error("Agent execution error:", error);
    return NextResponse.json(
      {
        error: "Layanan analisis risiko sedang tidak tersedia. Silakan coba beberapa saat lagi.",
      },
      { status: 503 }
    );
  }
}

