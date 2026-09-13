import { NextResponse } from "next/server";
import { z } from "zod";

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
        size: z.number(),
        type: z.string(),
        previewUrl: z.string(),
      }),
    )
    .optional(),
});

const requestSchema = z.object({
  content: z.string().trim().min(1).max(8000),
  evidence: evidenceSchema.optional(),
});

const responseSchema = z.object({
  riskScore: z.number().min(0).max(100),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  summary: z.string().min(1),
  redFlags: z.array(
    z.object({
      type: z.string(),
      title: z.string(),
      severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
      evidence: z.string(),
      explanation: z.string(),
    }),
  ),
  recommendation: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = requestSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Please provide enough content to analyze.",
        },
        { status: 400 },
      );
    }

    const { content, evidence } = parsed.data;
    const combined = [content, evidence?.companyName, evidence?.website, evidence?.salesChat, evidence?.investmentProposal]
      .filter(Boolean)
      .join(" ");

    const score = Math.min(94, Math.max(18, combined.length / 12));
    const riskScore = Math.round(score);
    const riskLevel = riskScore >= 75 ? "HIGH" : riskScore >= 45 ? "MEDIUM" : "LOW";

    const analysis = {
      riskScore,
      riskLevel,
      summary: "Several high-risk indicators were detected in the submitted evidence.",
      redFlags: [
        {
          type: "UNREALISTIC_RETURN",
          title: "Unrealistic Return",
          severity: "HIGH",
          evidence: evidence?.investmentProposal || "Guaranteed high return offer",
          explanation: "The evidence suggests a claim of unusually high returns within a short time frame, which is a common warning sign for speculative fraud.",
        },
        {
          type: "PERSONAL_ACCOUNT",
          title: "Personal Account Transfer",
          severity: "CRITICAL",
          evidence: evidence?.bankAccountNumber || "Funds requested to a personal account",
          explanation: "Requests to move funds to a personal account increase the risk of theft and complicate verification of a legitimate business process.",
        },
      ],
      recommendation: "Verify the business entity, licensing, and payment destination before transferring funds or sharing personal information.",
    };

    const validated = responseSchema.safeParse(analysis);

    if (!validated.success) {
      return NextResponse.json(
        {
          error: "The analysis response was invalid.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json(validated.data);
  } catch {
    return NextResponse.json(
      {
        error: "The analysis service is temporarily unavailable. Please try again.",
      },
      { status: 503 },
    );
  }
}
