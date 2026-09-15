import { z } from "zod";

export const MAX_INPUT_LENGTH = 8000;
export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export const RiskLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export const RedFlagSchema = z.object({
  type: z.string(),
  title: z.string(),
  severity: RiskLevelSchema,
  evidence: z.string(),
  explanation: z.string(),
});

export const FindingSchema = z.object({
  type: z.string(),
  severity: z.string(),
  title: z.string(),
  description: z.string(),
  evidence: z.string(),
});

export const AnalysisResponseSchema = z.object({
  riskScore: z.number().min(0).max(100),
  riskLevel: RiskLevelSchema,
  summary: z.string().min(1),
  redFlags: z.array(RedFlagSchema),
  recommendation: z.string().min(1),
  status: z.string().optional(),
  findings: z.array(FindingSchema).optional(),
  recommendations: z.array(z.string()).optional(),
  limitations: z.array(z.string()).optional(),
  verification: z.record(z.string(), z.any()).optional(),
});

export const UploadedScreenshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  size: z.number(),
  type: z.string(),
  previewUrl: z.string(),
  file: z.instanceof(File).optional(),
});

export const EvidenceSchema = z.object({
  companyName: z.string().optional(),
  website: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  investmentProposal: z.string().optional(),
  salesChat: z.string().optional(),
  links: z.array(z.string()).optional(),
  socialMedia: z.array(z.string()).optional(),
  screenshots: z.array(UploadedScreenshotSchema).optional(),
});

export type RiskLevel = z.infer<typeof RiskLevelSchema>;
export type RedFlag = z.infer<typeof RedFlagSchema>;
export type AnalysisResponse = z.infer<typeof AnalysisResponseSchema>;
export type UploadedScreenshot = z.infer<typeof UploadedScreenshotSchema>;
export type EvidenceInput = z.infer<typeof EvidenceSchema>;

export type AnalyzeRequest = {
  content: string;
  evidence?: EvidenceInput;
};

export const sampleContent = `A crypto investment group is advertising a limit-only deal. They say you can earn 35% in 7 days and claim a "guaranteed return" if you transfer funds into a personal account and invite friends. They ask for quick action and mention the first 10 slots are almost full.`;

export const sampleEvidenceSets = {
  exampleA: {
    companyName: "PT Golden Returns Indonesia",
    website: "https://goldenreturnsinvest.id",
    bankAccountNumber: "BCA 1234567890",
    salesChat: "If you act today, you can earn 35% in 7 days. We need the deposit to a personal account to reserve your slot.",
    links: ["https://goldenreturnsinvest.id/offer"],
    screenshots: [] as UploadedScreenshot[],
  },
  exampleB: {
    companyName: "Vantage Capital Group",
    website: "https://vantagecapital-profits.com",
    investmentProposal: "Earn passive returns by promoting this program and recruiting others. No formal documentation is required. Investment starts from 1 million rupiah.",
    socialMedia: ["https://instagram.com/vantagecapitalgroup", "https://tiktok.com/@vantagecapitalgroup"],
    links: ["https://vantagecapital-profits.com/register"],
    screenshots: [] as UploadedScreenshot[],
  },
  exampleC: {
    screenshots: [] as UploadedScreenshot[],
  },
};

export function getRiskTone(level: RiskLevel) {
  switch (level) {
    case "LOW":
      return "risk-low";
    case "MEDIUM":
      return "risk-medium";
    case "HIGH":
      return "risk-high";
    case "CRITICAL":
      return "risk-critical";
    default:
      return "risk-medium";
  }
}

export function buildEvidenceContent(evidence: Partial<EvidenceInput>): string {
  return [
    evidence.companyName ? `Company name: ${evidence.companyName}` : null,
    evidence.website ? `Website: ${evidence.website}` : null,
    evidence.bankAccountNumber ? `Bank account number provided` : null,
    evidence.investmentProposal ? `Investment proposal: ${evidence.investmentProposal}` : null,
    evidence.salesChat ? `Sales chat: ${evidence.salesChat}` : null,
    evidence.links && evidence.links.length > 0 ? `Links: ${evidence.links.join(", ")}` : null,
    evidence.socialMedia && evidence.socialMedia.length > 0 ? `Social media: ${evidence.socialMedia.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(". ");
}

export function parseTextList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function analyzeContent(
  input: string,
  evidence?: EvidenceInput,
  files?: File[]
): Promise<AnalysisResponse> {
  const content = input.trim();
  const requestBody: AnalyzeRequest = {
    content,
    evidence,
  };

  try {
    let response: Response;

    if (files && files.length > 0) {
      console.debug("[analyzeContent] using multipart/form-data", { fileCount: files.length });
      const formData = new FormData();
      formData.append("content", content);

      if (evidence?.companyName) formData.append("companyName", evidence.companyName);
      if (evidence?.website) formData.append("website", evidence.website);
      if (evidence?.bankAccountNumber) formData.append("bankAccountNumber", evidence.bankAccountNumber);
      if (evidence?.investmentProposal) formData.append("investmentProposal", evidence.investmentProposal);
      if (evidence?.salesChat) formData.append("salesChat", evidence.salesChat);
      if (evidence?.links && evidence.links.length > 0) {
        for (const link of evidence.links) {
          formData.append("links", link);
        }
      }
      if (evidence?.socialMedia && evidence.socialMedia.length > 0) {
        for (const item of evidence.socialMedia) {
          formData.append("socialMedia", item);
        }
      }

      files.forEach((file) => {
        formData.append("screenshots", file, file.name);
      });

      console.debug("[analyzeContent] screenshots appended", {
        screenshotCount: formData.getAll("screenshots").length,
      });

      response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });
    } else {
      console.debug("[analyzeContent] using JSON", { fileCount: files?.length ?? 0 });
      response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
    }

    if (!response.ok) {
      const responseBody = await response.text();
      const error = new Error(`Analysis API returned HTTP ${response.status}.`);
      console.error("[analyzeContent] non-2xx backend response", {
        status: response.status,
        body: responseBody,
      });
      throw error;
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      console.error("[analyzeContent] response parsing failure", error);
      throw error;
    }

    const parsed = AnalysisResponseSchema.safeParse(payload);
    if (!parsed.success) {
      console.error("[analyzeContent] invalid backend response schema", {
        issues: parsed.error.issues,
        payload,
      });
      throw parsed.error;
    }

    return parsed.data;
  } catch (error) {
    if (error instanceof TypeError) {
      console.error("[analyzeContent] network/request failure", error);
    }
    throw error;
  }
}
