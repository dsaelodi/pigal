import { GoogleGenAI } from "@google/genai";
import { ExtractedEntities } from "./types";

/**
 * Check if real Gemini model integration is enabled via environment variables.
 */
export function isGeminiEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
}

/**
 * Get configured model name from environment or fallback to gemini-2.0-flash / gemini-1.5-pro.
 */
export function getGeminiModelName(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
}

let geminiClientInstance: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  if (!geminiClientInstance) {
    geminiClientInstance = new GoogleGenAI({ apiKey });
  }
  return geminiClientInstance;
}

/**
 * Extract financial entities and suspicious signals from text using real Gemini LLM.
 * Returns null if Gemini is not enabled, quota exceeded, or parsing fails, allowing
 * seamless fallback to local deterministic regex heuristic.
 */
export async function extractEntitiesWithGemini(rawText: string): Promise<Partial<ExtractedEntities> | null> {
  const client = getGeminiClient();
  if (!client || !rawText.trim()) {
    return null;
  }

  const model = getGeminiModelName();

  const prompt = `Anda adalah sistem ekstraksi bukti investigasi penipuan finansial dan pinjol ilegal (OpenClaw & Gemini pipeline).
Analisis teks berikut dan ekstrak entitas secara objektif sesuai bukti. Jangan mengarang informasi.

Teks Masukan:
"""
${rawText}
"""

Kembalikan HANYA format JSON valid tanpa tanda markdown (no backticks) dengan skema berikut:
{
  "company_name": string | null,
  "brand_name": string | null,
  "website": string | null,
  "bank_name": string | null,
  "bank_account": string | null,
  "account_holder": string | null,
  "claimed_return": string | null,
  "return_period": string | null,
  "urgency_detected": boolean,
  "credential_request_detected": boolean,
  "payment_instruction": string | null
}`;

  try {
    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    });

    const responseText = response.text;
    if (!responseText) return null;

    const cleaned = responseText.replace(/```json|```/gi, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      company_name: parsed.company_name || undefined,
      brand_name: parsed.brand_name || undefined,
      website: parsed.website || undefined,
      bank_name: parsed.bank_name || undefined,
      bank_account: parsed.bank_account || undefined,
      account_holder: parsed.account_holder || undefined,
      claimed_return: parsed.claimed_return || undefined,
      return_period: parsed.return_period || undefined,
      urgency_detected: Boolean(parsed.urgency_detected),
      credential_request_detected: Boolean(parsed.credential_request_detected),
      payment_instruction: parsed.payment_instruction || undefined,
    };
  } catch (err) {
    console.warn("Gemini entity extraction failed or unavailable, falling back to local heuristic:", err);
    return null;
  }
}

/**
 * Generate natural language reasoning summary using Gemini based on deterministic findings.
 */
export async function generateGeminiSummary(
  findings: Array<{ title: string; description: string; evidence: string }>,
  score: number,
  level: string
): Promise<string | null> {
  const client = getGeminiClient();
  if (!client) return null;

  const model = getGeminiModelName();
  const findingsSummary = findings.map((f) => `- ${f.title} (${f.evidence}): ${f.description}`).join("\n");

  const prompt = `Anda adalah asisten analisis risiko finansial Pigal. Berikan ringkasan analitis singkat (maksimal 2-3 kalimat) dalam bahasa Indonesia berdasarkan temuan berikut. Jangan menyatakan vonis hukum pasti ("pasti penipuan"), gunakan bahasa tingkat risiko analitis (${level}, skor: ${score}/100).

Temuan:
${findingsSummary || "Tidak ada temuan pelanggaran signifikan."}
`;

  try {
    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: 0.2,
      },
    });

    return response.text?.trim() || null;
  } catch (err) {
    console.warn("Gemini summary generation failed:", err);
    return null;
  }
}
