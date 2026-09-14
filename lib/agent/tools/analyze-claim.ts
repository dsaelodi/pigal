import { ClaimAnalysisData, ToolResult } from "../types";

export async function analyzeClaim(text: string): Promise<ToolResult<ClaimAnalysisData>> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      success: true,
      data: { claims_detected: [] },
      source: "claim_analyzer",
    };
  }

  const claims: ClaimAnalysisData["claims_detected"] = [];
  const lower = trimmed.toLowerCase();

  // 1. High/Unrealistic Return Detection (e.g., 30% dalam 7 hari, 50% per minggu, return 50%)
  const highReturnRegex = /(?:profit|return|untung|keuntungan|bunga)\s*(?:sebesar)?\s*(\d+)\s*%/gi;
  let match: RegExpExecArray | null;
  while ((match = highReturnRegex.exec(trimmed)) !== null) {
    const percentage = parseInt(match[1], 10);
    // Over 15% in short period or over 30% generally is unrealistic in financial standards
    if (percentage >= 20 || (percentage >= 10 && /hari|minggu|day|week|jam/i.test(lower))) {
      claims.push({
        type: "unrealistic_return",
        claim: match[0],
        severity: "high",
        explanation: `Klaim keuntungan ${percentage}% tergolong tidak wajar (unrealistic return) untuk instrumen keuangan legal.`,
      });
    }
  }

  // Detect phrase-based unrealistic return
  if (
    /modal\s+\d+.*jadi\s+\d+/i.test(lower) ||
    /untung\s+(?:berlipat|fantastis|jutaan\s+sehari)/i.test(lower)
  ) {
    claims.push({
      type: "unrealistic_return",
      claim: trimmed.slice(0, 100),
      severity: "high",
      explanation: "Penawaran menjanjikan pelipatgandaan modal dalam waktu singkat tanpa penjelasan risiko yang memadai.",
    });
  }

  // 2. Guaranteed profit / zero risk
  if (
    /profit\s+pasti|dijamin\s+(?:pasti\s+)?untung|100%\s+tanpa\s+risiko|tanpa\s+risiko|anti\s+rugi|pasti\s+cair/i.test(
      lower
    )
  ) {
    claims.push({
      type: "guaranteed_profit",
      claim: "Klaim profit pasti / 100% tanpa risiko",
      severity: "high",
      explanation: "Semua instrumen investasi resmi memiliki risiko pasar. Klaim bebas risiko merupakan karakteristik utama penipuan finansial.",
    });
  }

  // 3. Unusually short return periods with return promises
  if (
    /(?:profit|return|untung).*(?:dalam|hanya|cuma)\s*(\d+)\s*(?:hari|jam|menit)/i.test(lower) ||
    /(?:7|3|1)\s*hari.*profit/i.test(lower)
  ) {
    if (!claims.some((c) => c.type === "unrealistic_return")) {
      claims.push({
        type: "short_period",
        claim: "Periode pengembalian sangat singkat",
        severity: "medium",
        explanation: "Periode perputaran dana yang dijanjikan dalam hitungan hari merupakan indikasi skema ponzi.",
      });
    }
  }

  return {
    success: true,
    data: { claims_detected: claims },
    source: "claim_analyzer",
  };
}
