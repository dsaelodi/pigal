import { NextResponse } from "next/server";
import { z } from "zod";
import { executeAnalysis } from "@/lib/agent";

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

export async function POST(request: Request) {
  try {
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

    // Merge evidence fields whether passed inside evidence object or at root
    const mergedInput = {
      content: content || "",
      companyName: evidence?.companyName || rest.companyName,
      website: evidence?.website || rest.website,
      bankAccountNumber: evidence?.bankAccountNumber || rest.bankAccountNumber || rest.bankAccount,
      investmentProposal: evidence?.investmentProposal || rest.investmentProposal,
      salesChat: evidence?.salesChat || rest.salesChat,
      links: evidence?.links || rest.links,
      socialMedia: evidence?.socialMedia || rest.socialMedia,
      screenshots: evidence?.screenshots,
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

