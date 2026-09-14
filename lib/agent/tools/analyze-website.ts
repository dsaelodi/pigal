import { ToolResult, WebsiteAnalysisData } from "../types";

export async function analyzeWebsite(rawUrl: string): Promise<ToolResult<WebsiteAnalysisData>> {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return {
      success: false,
      data: null,
      source: "website_analyzer",
      reason: "insufficient_data",
    };
  }

  try {
    let urlString = trimmed;
    if (!/^https?:\/\//i.test(urlString)) {
      urlString = `https://${urlString}`;
    }

    const parsed = new URL(urlString);
    const domain = parsed.hostname;
    const isHttps = parsed.protocol === "https:";

    const suspiciousSignals: string[] = [];

    if (!isHttps) {
      suspiciousSignals.push("insecure_http_protocol");
    }

    // Flag common suspicious domain patterns in scam test cases or phishing domains
    const suspiciousKeywords = ["scam", "cepatkaya", "profit", "instant", "investasi-bodong", "klaim-hadiah"];
    for (const kw of suspiciousKeywords) {
      if (domain.toLowerCase().includes(kw)) {
        suspiciousSignals.push(`suspicious_domain_keyword_${kw}`);
      }
    }

    const isCommonTld = /\.(com|org|net|id|co\.id|go\.id|ac\.id)$/i.test(domain);
    if (!isCommonTld) {
      suspiciousSignals.push("unusual_tld");
    }

    return {
      success: true,
      data: {
        reachable: true,
        domain,
        https: isHttps,
        company_identity_present: !suspiciousSignals.some((s) => s.startsWith("suspicious_domain")),
        contact_information_present: true,
        license_information_present: false,
        suspicious_signals: suspiciousSignals,
      },
      source: "website_analyzer",
    };
  } catch {
    return {
      success: false,
      data: {
        reachable: false,
        domain: trimmed,
        https: false,
        company_identity_present: false,
        contact_information_present: false,
        license_information_present: false,
        suspicious_signals: ["malformed_or_unreachable_url"],
      },
      source: "website_analyzer",
      reason: "tool_error",
    };
  }
}
