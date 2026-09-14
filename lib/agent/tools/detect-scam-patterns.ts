import { getScamPatterns } from "../datasets";
import { ScamPatternDetectionData, ToolResult } from "../types";

export async function detectScamPatterns(text: string): Promise<ToolResult<ScamPatternDetectionData>> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      success: true,
      data: { patterns: [] },
      source: "scam_pattern_detector",
    };
  }

  const registeredPatterns = getScamPatterns();
  const lower = trimmed.toLowerCase();
  const detectedPatterns: ScamPatternDetectionData["patterns"] = [];

  for (const p of registeredPatterns) {
    let matched = false;
    let evidenceSnippet = "";

    // 1. Check exact example matches or keywords
    for (const example of p.examples) {
      const exLower = example.toLowerCase();
      if (lower.includes(exLower)) {
        matched = true;
        evidenceSnippet = example;
        break;
      }
    }

    // 2. Pattern-specific regex detection
    if (!matched) {
      if (p.pattern === "unrealistic_return") {
        const regex = /(?:profit|return|untung)\s*(?:sebesar)?\s*(\d+)\s*%/i;
        const match = regex.exec(trimmed);
        if (match && parseInt(match[1], 10) >= 20) {
          matched = true;
          evidenceSnippet = match[0];
        }
      } else if (p.pattern === "urgency_pressure") {
        if (
          /segera\s+transfer|transfer\s+sekarang|sebelum\s+promo|sebelum\s+midnight|slot\s+terbatas|kesempatan\s+terakhir/i.test(
            lower
          )
        ) {
          matched = true;
          const match = /(?:segera\s+transfer|transfer\s+sekarang|sebelum\s+promo|sebelum\s+midnight|slot\s+terbatas|kesempatan\s+terakhir)[^.,\n]*/i.exec(trimmed);
          evidenceSnippet = match ? match[0] : "Tekanan urgensi untuk segera mentransfer dana";
        }
      } else if (p.pattern === "personal_account") {
        if (
          /rekening\s+pribadi|atas\s+nama\s+(?:pribadi|perorangan)|transfer\s+ke\s+rekening\s+pribadi/i.test(
            lower
          )
        ) {
          matched = true;
          const match = /(?:rekening\s+pribadi|atas\s+nama\s+[A-Za-z\s]+|transfer\s+ke\s+rekening\s+pribadi)[^.,\n]*/i.exec(trimmed);
          evidenceSnippet = match ? match[0] : "Permintaan transfer ke rekening pribadi";
        }
      } else if (p.pattern === "credential_request") {
        if (/otp|pin|password|kode\s+rahasia/i.test(lower)) {
          matched = true;
          const match = /(?:kirim|minta|berikan)?\s*(?:kode\s+)?(?:otp|pin|password)[^.,\n]*/i.exec(trimmed);
          evidenceSnippet = match ? match[0] : "Permintaan kode kredensial rahasia (OTP/PIN)";
        }
      } else if (p.pattern === "guaranteed_profit") {
        if (/profit\s+pasti|tanpa\s+risiko|dijamin\s+untung/i.test(lower)) {
          matched = true;
          const match = /(?:profit\s+pasti|100%\s+tanpa\s+risiko|dijamin\s+tidak\s+akan\s+rugi)[^.,\n]*/i.exec(trimmed);
          evidenceSnippet = match ? match[0] : "Klaim garansi profit tanpa risiko";
        }
      }
    }

    if (matched) {
      detectedPatterns.push({
        pattern_id: p.pattern_id,
        type: p.pattern,
        severity: p.severity,
        evidence: evidenceSnippet || p.description,
        description: p.description,
      });
    }
  }

  return {
    success: true,
    data: { patterns: detectedPatterns },
    source: "scam_pattern_detector",
  };
}
