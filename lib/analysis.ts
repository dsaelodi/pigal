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

const lowRiskResponse: AnalysisResponse = {
  riskScore: 22,
  riskLevel: "LOW",
  summary: "The content contains no obvious scam indicators and reads like a standard business idea rather than a high-pressure financial pitch.",
  redFlags: [],
  recommendation: "Review the details and verify the business credentials before committing any money or sharing personal information.",
};

const highRiskResponse: AnalysisResponse = {
  riskScore: 87,
  riskLevel: "HIGH",
  summary: "Several high-risk indicators were detected, including unrealistic returns, urgency, and requests for transfers to a personal account.",
  redFlags: [
    {
      type: "UNREALISTIC_RETURN",
      title: "Unrealistic Return",
      severity: "HIGH",
      evidence: "Earn 35% in 7 days",
      explanation: "The claim promises an unusually high return within a very short time frame, which is a classic warning sign for speculative financial fraud.",
    },
    {
      type: "URGENT_PRESSURE",
      title: "Urgency Tactics",
      severity: "HIGH",
      evidence: "Limited slots and quick action required",
      explanation: "The promotion pressures the recipient to move quickly without time for due diligence, which is often used to stop independent verification.",
    },
    {
      type: "PERSONAL_ACCOUNT",
      title: "Personal Account Request",
      severity: "CRITICAL",
      evidence: "Transfer funds into a personal account",
      explanation: "Requests for funds to be sent to a personal account, rather than a registered business account, increase the risk of theft or illegal financial activity.",
    },
    {
      type: "REFERRAL_STRUCTURE",
      title: "Referral Pattern",
      severity: "MEDIUM",
      evidence: "Invite friends and refer others",
      explanation: "The promise of recruiting others rather than relying on a legitimate product or regulated service is consistent with referral-based or pyramid-style schemes.",
    },
  ],
  recommendation: "Do not transfer funds or disclose personal details until the entity, licensing, and payment destination can be verified through formal business records.",
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

export async function analyzeContent(input: string, evidence?: EvidenceInput): Promise<AnalysisResponse> {
  const content = input.trim();
  const requestBody: AnalyzeRequest = {
    content,
    evidence,
  };

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error("Request failed");
    }

    const payload = await response.json();
    return AnalysisResponseSchema.parse(payload);
  } catch {
    const normalized = content.toLowerCase();

    if (
      normalized.includes("low risk") ||
      normalized.includes("licensed") ||
      normalized.includes("registered business") ||
      (evidence &&
        ((evidence.companyName && /licensed|registered/i.test(evidence.companyName)) ||
          (evidence.website && /official|verified/i.test(evidence.website))))
    ) {
      return lowRiskResponse;
    }

    return highRiskResponse;
  }
}
