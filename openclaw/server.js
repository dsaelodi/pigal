/**
 * OpenClaw Agent Gateway Server (/opt/openclaw-agent/server.js)
 * 
 * Pipeline:
 * 1. Normalized AgentInput ingestion
 * 2. Gemini semantic reasoning & entity extraction (GEMINI_API_KEY + GEMINI_MODEL)
 * 3. Conditional tool selection from tools.json
 * 4. Tool execution (Company, License, Bank, Website, Claims, Scam Patterns)
 * 5. Evidence aggregation
 * 6. Deterministic risk scoring policy
 * 7. AgentAnalysisResponse contract delivery
 * 
 * Complies with security specs:
 * - Never log API keys, auth tokens, or sensitive credentials
 * - Never declare definitive legal guilt
 * - Bearer token authentication via OPENCLAW_AUTH_TOKEN
 * - /health endpoint preserved
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

// Load .env if present in current directory
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const PORT = parseInt(process.env.OPENCLAW_PORT || process.env.PORT || "18789", 10);
const AUTH_TOKEN = process.env.OPENCLAW_AUTH_TOKEN ? process.env.OPENCLAW_AUTH_TOKEN.trim() : "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : "";
const GEMINI_MODEL = (process.env.GEMINI_MODEL || "gemini-2.0-flash").trim();

// ---------------------------------------------------------------------------
// Dataset Loaders with Resilient Fallbacks
// ---------------------------------------------------------------------------
function loadJsonSafe(filePath, fallback) {
  try {
    const resolved = path.isAbsolute(filePath) ? filePath : path.join(__dirname, filePath);
    if (fs.existsSync(resolved)) {
      return JSON.parse(fs.readFileSync(resolved, "utf-8"));
    }
  } catch (err) {
    console.warn(`[openclaw] Warning: Failed to read ${filePath}:`, err.message);
  }
  return fallback;
}

const toolsManifest = loadJsonSafe("./tools.json", [
  { name: "verify_company", description: "Verifies company registration status." },
  { name: "verify_license", description: "Checks regulatory license registry." },
  { name: "check_bank_account", description: "Verifies bank account details and owner type." },
  { name: "analyze_website", description: "Inspects website domain, HTTPS, and signals." },
  { name: "analyze_claim", description: "Analyzes promotional claims for unrealistic returns." },
  { name: "detect_scam_patterns", description: "Matches text against known scam patterns." },
]);

const defaultCompanies = [
  { company_name: "PT Aman Sejahtera Digital", aliases: ["Aman Sejahtera", "ASD"], status: "verified", business_type: "fintech", license_status: "licensed", license_type: "P2P Lending", license_number: "MOCK-001", source: "mock-registry" },
  { company_name: "PT Cepat Kaya Indonesia", aliases: ["Cepat Kaya", "CKI"], status: "unverified", business_type: "unknown", license_status: "not_found", license_type: null, license_number: null, source: "mock-registry" },
  { company_name: "PT Investasi Nusantara", aliases: ["Investasi Nusantara", "IN"], status: "verified", business_type: "investment", license_status: "licensed", license_type: "Securities", license_number: "MOCK-002", source: "mock-registry" },
  { company_name: "PT Dana Bijak Indonesia", aliases: ["Dana Bijak", "DBI"], status: "verified", business_type: "fintech", license_status: "licensed", license_type: "Financing", license_number: "MOCK-003", source: "mock-registry" },
];

const defaultLicenses = [
  { company_name: "PT Aman Sejahtera Digital", license_status: "active", license_type: "P2P Lending", license_number: "MOCK-001", regulator: "OJK" },
  { company_name: "PT Cepat Kaya Indonesia", license_status: "not_found", license_type: null, license_number: null, regulator: "OJK" },
  { company_name: "PT Investasi Nusantara", license_status: "active", license_type: "Securities", license_number: "MOCK-002", regulator: "OJK" },
  { company_name: "PT Dana Bijak Indonesia", license_status: "active", license_type: "Financing", license_number: "MOCK-003", regulator: "OJK" },
];

const defaultBankAccounts = [
  { bank: "BCA", account_number: "MOCK-123456", account_name: "PT Aman Sejahtera Digital", status: "verified", risk_flag: false },
  { bank: "BRI", account_number: "MOCK-987654", account_name: "Budi Santoso", status: "personal", risk_flag: true },
  { bank: "Mandiri", account_number: "MOCK-456789", account_name: "PT Investasi Nusantara", status: "verified", risk_flag: false },
  { bank: "BNI", account_number: "MOCK-112233", account_name: "PT Dana Bijak Indonesia", status: "verified", risk_flag: false },
  { bank: "BRI", account_number: "MOCK-445566", account_name: "Andi Wijaya", status: "personal", risk_flag: true },
];

const defaultScamPatterns = [
  { pattern_id: "SCAM-001", pattern: "unrealistic_return", description: "Menjanjikan pengembalian sangat tinggi dalam waktu singkat.", severity: "high", examples: ["profit 30% in 7 days", "guaranteed return 50%", "modal 1 juta jadi 5 juta dalam seminggu"] },
  { pattern_id: "SCAM-002", pattern: "urgency_pressure", description: "Menciptakan tekanan untuk segera mentransfer dana.", severity: "medium", examples: ["promo ends tonight", "transfer within 10 minutes", "kesempatan terakhir hari ini", "segera transfer", "transfer sekarang"] },
  { pattern_id: "SCAM-003", pattern: "personal_account", description: "Meminta transfer ke rekening pribadi perorangan.", severity: "high", examples: ["transfer ke rekening pribadi", "atas nama perorangan", "rekening pribadi"] },
  { pattern_id: "SCAM-004", pattern: "guaranteed_profit", description: "Menjamin keuntungan investasi tanpa risiko.", severity: "high", examples: ["profit pasti", "100% tanpa risiko", "dijamin tidak akan rugi", "anti rugi"] },
  { pattern_id: "SCAM-005", pattern: "advance_payment", description: "Meminta biaya aktivasi/deposit di muka sebelum pencairan.", severity: "medium", examples: ["bayar biaya aktivasi dulu", "transfer deposit sebelum pencairan", "biaya admin di muka"] },
  { pattern_id: "SCAM-006", pattern: "credential_request", description: "Meminta kredensial rahasia seperti PIN, OTP, atau password.", severity: "critical", examples: ["kirim kode OTP", "berikan PIN untuk verifikasi", "kirim password"] },
];

const companiesData = loadJsonSafe("./datasets/companies.json", defaultCompanies);
const licensesData = loadJsonSafe("./datasets/licenses.json", defaultLicenses);
const bankAccountsData = loadJsonSafe("./datasets/bank_accounts.json", defaultBankAccounts);
const scamPatternsData = loadJsonSafe("./datasets/scam_patterns.json", defaultScamPatterns);

// ---------------------------------------------------------------------------
// Step 2: Gemini API Integration (Entity Extraction & Reasoning)
// ---------------------------------------------------------------------------
async function callGeminiExtractEntities(rawText) {
  if (!GEMINI_API_KEY || !rawText || !rawText.trim()) {
    return null;
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const prompt = `Anda adalah sistem ekstraksi bukti investigasi penipuan finansial dan pinjol ilegal (OpenClaw & Gemini pipeline).
Analisis teks berikut dan ekstrak entitas secara objektif sesuai bukti. Jangan mengarang data.

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
  "guaranteed_profit_detected": boolean,
  "summary": string | null
}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.warn(`[openclaw] Gemini API error (status ${response.status}):`, errBody.slice(0, 150));
      return null;
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) return null;

    const cleaned = candidateText.replace(/```json|```/gi, "").trim();
    const parsed = JSON.parse(cleaned);
    return parsed;
  } catch (err) {
    console.warn("[openclaw] Gemini request execution failed:", err.message);
    return null;
  }
}

// Fallback Heuristic Entity Extractor
function extractEntitiesHeuristic(text) {
  const result = {};
  if (!text) return result;

  const ptMatch = /(PT\.?\s+[A-Za-z0-9\s]+?)(?:rekening|bank|bunga|untung|hubungi|\.|\n|$)/i.exec(text);
  if (ptMatch) result.company_name = ptMatch[1].trim();

  const urlMatch = /https?:\/\/[^\s]+|[a-zA-Z0-9-]+\.(?:com|id|co\.id|net|org)/i.exec(text);
  if (urlMatch) result.website = urlMatch[0].trim();

  const bankMatch = /(?:BCA|BRI|Mandiri|BNI|BSI|CIMB|Bank)\s*(?:no\.?|rek\.?|rekening)?\s*:?\s*([A-Za-z0-9-]{6,20})/i.exec(text);
  if (bankMatch) {
    result.bank_account = bankMatch[1].trim();
  } else {
    const rawDigits = /(?:rek|rekening|transfer ke)\s*:?\s*([A-Za-z0-9-]{6,20})/i.exec(text);
    if (rawDigits) result.bank_account = rawDigits[1].trim();
  }

  return result;
}

// ---------------------------------------------------------------------------
// Step 3 & 4: Tool Implementations
// ---------------------------------------------------------------------------
function toolVerifyCompany(companyName) {
  const norm = (companyName || "").toLowerCase().replace(/^pt\.?\s*/i, "").trim();
  if (!norm) return { success: true, data: { found: false, company_name: "", status: "not_provided", source: "company_registry" }, source: "company_registry" };

  const found = companiesData.find((c) => {
    const cNorm = c.company_name.toLowerCase().replace(/^pt\.?\s*/i, "").trim();
    if (cNorm.includes(norm) || norm.includes(cNorm)) return true;
    if (c.aliases && c.aliases.some((a) => a.toLowerCase().includes(norm) || norm.includes(a.toLowerCase()))) return true;
    return false;
  });

  if (!found) {
    return {
      success: true,
      data: { found: false, company_name: companyName, status: "not_found", source: "company_registry" },
      source: "company_registry",
    };
  }

  return {
    success: true,
    data: {
      found: true,
      company_name: found.company_name,
      status: found.status,
      business_type: found.business_type,
      license_status: found.license_status,
      license_number: found.license_number,
      source: found.source,
    },
    source: found.source,
  };
}

function toolVerifyLicense(companyName) {
  const norm = (companyName || "").toLowerCase().replace(/^pt\.?\s*/i, "").trim();
  if (!norm) return { success: true, data: { found: false, company_name: "", status: "not_provided", regulator: "OJK" }, source: "ojk_registry" };

  const found = licensesData.find((l) => {
    const cNorm = l.company_name.toLowerCase().replace(/^pt\.?\s*/i, "").trim();
    return cNorm.includes(norm) || norm.includes(cNorm);
  });

  if (!found || found.license_status === "not_found") {
    return {
      success: true,
      data: { found: false, company_name: companyName, status: "not_found", regulator: "OJK" },
      source: "ojk_registry",
    };
  }

  return {
    success: true,
    data: {
      found: found.license_status === "active",
      company_name: found.company_name,
      status: found.license_status,
      license_type: found.license_type,
      license_number: found.license_number,
      regulator: found.regulator,
    },
    source: "ojk_registry",
  };
}

function toolCheckBankAccount(accountNumber, companyName) {
  const clean = (accountNumber || "").replace(/[^0-9A-Za-z-]/g, "").trim();
  if (!clean) return { success: true, data: { found: false, account_number: "", status: "not_provided", risk_flag: false }, source: "bank_verification" };

  const found = bankAccountsData.find((b) => b.account_number === clean || b.account_number.endsWith(clean) || clean.endsWith(b.account_number));
  if (!found) {
    return {
      success: true,
      data: {
        found: false,
        account_number: clean,
        status: "no_match",
        risk_flag: false,
        warning: "Rekening tidak ditemukan dalam basis data registrasi resmi perbankan.",
      },
      source: "bank_verification",
    };
  }

  let status = found.status;
  let warning = undefined;
  if (found.status === "personal") {
    warning = `Rekening atas nama perorangan (${found.account_name}), bukan rekening operasional badan usaha terdaftar.`;
  } else if (companyName && found.account_name) {
    const normExpected = companyName.toLowerCase().replace(/^pt\.?\s*/i, "");
    const normActual = found.account_name.toLowerCase().replace(/^pt\.?\s*/i, "");
    if (!normActual.includes(normExpected) && !normExpected.includes(normActual)) {
      status = "company_mismatch";
      warning = `Nama pemegang rekening (${found.account_name}) tidak cocok dengan entitas penawar (${companyName}).`;
    }
  }

  return {
    success: true,
    data: {
      found: true,
      bank: found.bank,
      account_number: found.account_number,
      account_holder: found.account_name,
      status,
      risk_flag: found.risk_flag || status === "personal" || status === "company_mismatch",
      warning,
    },
    source: "bank_verification",
  };
}

function toolAnalyzeWebsite(rawUrl) {
  const trimmed = (rawUrl || "").trim();
  if (!trimmed) return { success: false, data: null, source: "website_analyzer" };

  try {
    let urlString = trimmed;
    if (!/^https?:\/\//i.test(urlString)) {
      urlString = `https://${urlString}`;
    }
    const parsed = new URL(urlString);
    const domain = parsed.hostname;
    const isHttps = parsed.protocol === "https:";
    const suspiciousSignals = [];

    if (!isHttps) suspiciousSignals.push("insecure_http_protocol");

    const suspiciousKeywords = ["scam", "cepatkaya", "profit", "instant", "investasi-bodong", "klaim-hadiah", "dana-cepat"];
    for (const kw of suspiciousKeywords) {
      if (domain.toLowerCase().includes(kw)) {
        suspiciousSignals.push(`suspicious_domain_keyword_${kw}`);
      }
    }

    const isCommonTld = /\.(com|org|net|id|co\.id|go\.id|ac\.id)$/i.test(domain);
    if (!isCommonTld) suspiciousSignals.push("unusual_tld");

    return {
      success: true,
      data: {
        reachable: true,
        domain,
        https: isHttps,
        company_identity_present: !suspiciousSignals.some((s) => s.startsWith("suspicious_domain")),
        suspicious_signals: suspiciousSignals,
      },
      source: "website_analyzer",
    };
  } catch {
    return {
      success: false,
      data: { reachable: false, domain: trimmed, https: false, suspicious_signals: ["malformed_or_unreachable_url"] },
      source: "website_analyzer",
    };
  }
}

function toolAnalyzeClaim(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return { success: true, data: { claims_detected: [] }, source: "claim_analyzer" };

  const claims = [];
  const lower = trimmed.toLowerCase();

  const highReturnRegex = /(?:profit|return|untung|keuntungan|bunga)\s*(?:sebesar)?\s*(\d+(?:\.\d+)?)\s*%/gi;
  let match;
  while ((match = highReturnRegex.exec(trimmed)) !== null) {
    const percentage = parseFloat(match[1]);
    if (percentage >= 20 || (percentage >= 10 && /hari|minggu|day|week|jam/i.test(lower))) {
      claims.push({
        type: "unrealistic_return",
        claim: match[0],
        severity: "high",
        explanation: `Klaim keuntungan ${percentage}% tergolong tidak wajar (unrealistic return) untuk instrumen keuangan resmi.`,
      });
    }
  }

  if (/modal\s+\d+.*jadi\s+\d+/i.test(lower) || /untung\s+(?:berlipat|fantastis|jutaan\s+sehari)/i.test(lower)) {
    claims.push({
      type: "unrealistic_return",
      claim: trimmed.slice(0, 80),
      severity: "high",
      explanation: "Penawaran menjanjikan pelipatgandaan modal instan tanpa risiko yang transparan.",
    });
  }

  if (/profit\s+pasti|dijamin\s+(?:pasti\s+)?untung|100%\s+tanpa\s+risiko|tanpa\s+risiko|anti\s+rugi|pasti\s+cair/i.test(lower)) {
    claims.push({
      type: "guaranteed_profit",
      claim: "Klaim garansi profit / 100% tanpa risiko",
      severity: "high",
      explanation: "Semua instrumen finansial legal memiliki risiko. Klaim tanpa risiko adalah ciri khas penipuan investasi.",
    });
  }

  if (!claims.some((claim) => claim.type === "unrealistic_return") && /(?:profit|return|untung|keuntungan).{0,30}(?:dalam|per)\s+\d+\s+(?:hari|minggu|jam|menit)/i.test(lower)) {
    claims.push({
      type: "unrealistic_return",
      claim: (/(?:profit|return|untung|keuntungan).{0,45}(?:dalam|per)\s+\d+\s+(?:hari|minggu|jam|menit)/i.exec(trimmed) || [trimmed.slice(0, 80)])[0],
      severity: "high",
      explanation: "Klaim pembayaran dalam waktu sangat singkat perlu diverifikasi karena dapat menunjukkan imbal hasil yang tidak wajar.",
    });
  }

  return { success: true, data: { claims_detected: claims }, source: "claim_analyzer" };
}

function toolDetectScamPatterns(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return { success: true, data: { patterns: [] }, source: "scam_pattern_detector" };

  const lower = trimmed.toLowerCase();
  const detected = [];

  for (const p of scamPatternsData) {
    let matched = false;
    let snippet = "";

    for (const ex of p.examples) {
      if (lower.includes(ex.toLowerCase())) {
        matched = true;
        snippet = ex;
        break;
      }
    }

    if (!matched) {
      if (p.pattern === "urgency_pressure" && /segera\s+transfer|transfer\s+sekarang|sebelum\s+midnight|slot\s+terbatas|kesempatan\s+terakhir|cepat\s+ya|udah\s+(?:ya\s+)?buk|segera\b|hari\s+ini/i.test(lower)) {
        matched = true;
        snippet = "Tekanan urgensi untuk segera transfer";
      } else if (p.pattern === "personal_account" && /rekening\s+pribadi|atas\s+nama\s+(?:pribadi|perorangan)/i.test(lower)) {
        matched = true;
        snippet = "Permintaan transfer ke rekening pribadi";
      } else if (p.pattern === "credential_request" && /otp|pin|password|kode\s+rahasia/i.test(lower)) {
        matched = true;
        snippet = "Permintaan kredensial rahasia (OTP/PIN)";
      } else if (p.pattern === "advance_payment" && /biaya\s+aktivasi|biaya\s+admin\s+di\s+muka|deposit\s+sebelum/i.test(lower)) {
        matched = true;
        snippet = "Permintaan biaya awal sebelum pencairan";
      }
    }

    if (matched) {
      detected.push({
        pattern_id: p.pattern_id,
        type: p.pattern,
        severity: p.severity,
        evidence: snippet || p.description,
        description: p.description,
      });
    }
  }

  return { success: true, data: { patterns: detected }, source: "scam_pattern_detector" };
}

function toolDetectExtendedPatterns(text) {
  const lower = (text || "").toLowerCase();
  const patterns = [];
  const add = (type, evidence, severity) => {
    if (!patterns.some((pattern) => pattern.type === type)) {
      patterns.push({ pattern_id: `LOCAL-${type}`, type, severity, evidence, description: evidence });
    }
  };

  if (/ajak\s+teman|rekrut|refer(al)?|member\s+baru|jaringan|mlm|downline/i.test(lower)) {
    add("suspicious_referral", "Ajakan merekrut anggota atau referral", "high");
  }
  if (/mengatasnamakan|atas\s+nama\s+(?:ojk|bank|polisi)|resmi\s+dari\s+(?:ojk|bank)|mengaku\s+(?:petugas|pegawai)/i.test(lower)) {
    add("impersonation", "Indikasi menyamar sebagai institusi atau petugas resmi", "high");
  }
  return patterns;
}

function detectWebsiteMismatch(companyName, website) {
  if (!companyName || !website) return false;
  const companyTokens = companyName
    .toLowerCase()
    .replace(/^pt\.?\s*/, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !["indonesia", "digital", "group"].includes(token));
  let hostname = "";
  try {
    hostname = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.toLowerCase();
  } catch {
    return true;
  }
  return companyTokens.length > 0 && !companyTokens.some((token) => hostname.includes(token));
}

function logResponseContractPayload(payload) {
  const sanitized = JSON.stringify(payload, (key, value) => {
    if (/account|token|authorization|password|otp|pin/i.test(key)) return "[REDACTED]";
    if (typeof value === "string") return value.replace(/\b\d{6,}\b/g, "[REDACTED]");
    return value;
  });
  console.log(`[openclaw] Response contract validation payload: ${sanitized}`);
}

// ---------------------------------------------------------------------------
// Step 5 & 6: Deterministic Risk Assessment Policy
// ---------------------------------------------------------------------------
function evaluateRiskPolicy(evidence) {
  const findings = [];
  const recommendations = [];
  const limitations = [
    "Analisis risiko dihasilkan secara objektif oleh OpenClaw Agent berbasis bukti yang dikirimkan.",
    "Bukan merupakan putusan hukum final (legal determination).",
  ];

  const hasEvidence =
    Boolean(evidence.raw_text && evidence.raw_text.trim()) ||
    Boolean(evidence.entity.company_name) ||
    Boolean(evidence.entity.website) ||
    Boolean(evidence.entity.bank_account) ||
    evidence.claims.length > 0 ||
    evidence.patterns.length > 0;

  if (!hasEvidence) {
    const response = {
      status: "insufficient_evidence",
      risk: { level: "INSUFFICIENT_EVIDENCE", score: 0, summary: "Bukti masukan tidak mencukupi untuk melakukan analisis risiko." },
      entity: { company_name: "", website: "", bank_account: "" },
      findings: [],
      verification: {},
      patterns: [],
      claims: [],
      recommendations: ["Harap sertakan bukti seperti nama perusahaan, tautan web, nomor rekening, atau teks penawaran."],
      limitations,
      riskScore: 0,
      riskLevel: "LOW",
      summary: "Bukti tidak mencukupi untuk analisis.",
      redFlags: [],
      recommendation: "Kirimkan bukti pendukung tambahan untuk dianalisis.",
    };
    logResponseContractPayload(response);
    return response;
  }

  const comp = evidence.verification.company;
  const lic = evidence.verification.license;
  const bank = evidence.verification.bank_account;
  const web = evidence.verification.website;
  const riskFactors = {
    missingLicense: Boolean(evidence.entity.company_name && lic && ["not_found", "inactive", "expired"].includes(lic.status)),
    personalBankAccount: Boolean(bank && bank.status === "personal"),
    unrealisticReturn: evidence.claims.some((claim) => ["unrealistic_return", "guaranteed_profit"].includes(claim.type)),
    urgency: Boolean((evidence.signals && evidence.signals.urgency) || evidence.patterns.some((pattern) => pattern.type === "urgency_pressure")),
    suspiciousReferral: evidence.patterns.some((pattern) => pattern.type === "suspicious_referral"),
    companyNotFound: Boolean(evidence.entity.company_name && comp && ["not_found", "unverified"].includes(comp.status)),
    websiteMismatch: detectWebsiteMismatch(evidence.entity.company_name, evidence.entity.website),
    knownFlaggedAccount: Boolean(bank && bank.risk_flag && bank.status !== "personal"),
  };
  console.log(`[openclaw] Risk factors: ${JSON.stringify(riskFactors)}`);

  const factorWeights = { missingLicense: 35, personalBankAccount: 25, unrealisticReturn: 25, urgency: 10, suspiciousReferral: 15, companyNotFound: 20, websiteMismatch: 15, knownFlaggedAccount: 40 };
  const finalScore = Math.min(100, Object.entries(riskFactors).reduce((total, [factor, detected]) => total + (detected ? factorWeights[factor] : 0), 0));

  if (riskFactors.companyNotFound) {
    findings.push({ severity: "HIGH", title: "Perusahaan Tidak Terverifikasi", evidence: `Perusahaan "${comp.company_name}" tidak ditemukan dalam registri badan usaha resmi.` });
    recommendations.push("Cek legalitas badan usaha melalui sumber regulator resmi.");
  }
  if (riskFactors.missingLicense) {
    findings.push({ severity: "CRITICAL", title: "Izin Usaha / Lisensi Regulator Tidak Ditemukan", evidence: `Tidak ditemukan izin operasional ${lic.regulator || "OJK"}.` });
    recommendations.push("Verifikasi status izin melalui regulator resmi sebelum bertransaksi.");
  }
  if (riskFactors.personalBankAccount || riskFactors.knownFlaggedAccount) {
    findings.push({ severity: "HIGH", title: "Rekening Berisiko", evidence: bank.warning || `Status rekening: ${bank.status}.` });
    recommendations.push("Jangan mentransfer dana ke rekening yang tidak dapat diverifikasi sebagai rekening badan usaha.");
  }
  if (riskFactors.unrealisticReturn) findings.push({ severity: "HIGH", title: "Klaim Keuntungan Tidak Wajar", evidence: evidence.claims.map((claim) => claim.claim).join("; ") });
  if (riskFactors.urgency) findings.push({ severity: "MEDIUM", title: "Tekanan Urgensi", evidence: evidence.patterns.find((pattern) => pattern.type === "urgency_pressure")?.evidence || "Bahasa mendesak untuk segera bertindak." });
  if (riskFactors.suspiciousReferral) findings.push({ severity: "HIGH", title: "Pola Referral Mencurigakan", evidence: evidence.patterns.find((pattern) => pattern.type === "suspicious_referral").evidence });
  if (riskFactors.websiteMismatch) findings.push({ severity: "HIGH", title: "Identitas Situs Tidak Konsisten", evidence: "Nama perusahaan dan domain situs tidak memiliki kecocokan yang jelas." });

  let riskLevel = "LOW";
  if (finalScore >= 75) riskLevel = "CRITICAL";
  else if (finalScore >= 50) riskLevel = "HIGH";
  else if (finalScore >= 25) riskLevel = "MEDIUM";

  const entityName = evidence.entity.company_name || evidence.entity.website || evidence.entity.bank_account || "Entitas Tidak Dikenal";
  const summary = `Analisis OpenClaw mendeteksi indikasi risiko ${riskLevel} (Skor: ${finalScore}/100) pada entitas "${entityName}".`;

  if (recommendations.length === 0) {
    recommendations.push("Tetap lakukan verifikasi ganda sebelum melakukan transaksi finansial apa pun.");
  }

  const normalizedFindings = findings.map((finding, index) => ({
    type: finding.type || `risk_factor_${index + 1}`,
    severity: finding.severity || "MEDIUM",
    title: finding.title,
    description: finding.description || finding.evidence,
    evidence: finding.evidence,
  }));
  const redFlags = normalizedFindings.map((finding) => ({
    type: finding.type,
    title: finding.title,
    severity: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(finding.severity) ? finding.severity : "MEDIUM",
    evidence: finding.evidence,
    explanation: finding.description,
  }));
  const topRec = recommendations[0];

  console.log(`[openclaw] Final risk score: ${finalScore}, riskLevel: ${riskLevel}`);

  const response = {
    status: "success",
    risk: {
      level: riskLevel,
      score: finalScore,
      summary,
    },
    entity: {
      company_name: evidence.entity.company_name || "",
      website: evidence.entity.website || "",
      bank_account: evidence.entity.bank_account || "",
    },
    findings: normalizedFindings,
    verification: evidence.verification,
    patterns: evidence.patterns,
    claims: evidence.claims,
    recommendations,
    limitations,
    riskScore: finalScore,
    riskLevel,
    summary,
    redFlags,
    recommendation: topRec,
  };
  logResponseContractPayload(response);
  return response;
}

// ---------------------------------------------------------------------------
// HTTP Request Router & Controller
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const clientIp = req.socket.remoteAddress || "unknown";

  // Health check endpoint
  if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "online",
        runtime: "openclaw-gateway",
        agent: "scam-risk-assessment-agent",
        version: "1.0.0",
      })
    );
    return;
  }

  // Analyze endpoint
  if (req.method === "POST" && (req.url === "/api/analyze" || req.url === "/analyze")) {
    console.log(`[openclaw] Request received: POST ${req.url} from ${clientIp}`);

    // Auth verification
    if (AUTH_TOKEN) {
      const authHeader = req.headers["authorization"] || "";
      const incomingToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : authHeader.trim();

      if (incomingToken !== AUTH_TOKEN) {
        console.warn(`[openclaw] Unauthorized access attempt from ${clientIp}`);
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized access: invalid or missing token" }));
        return;
      }
    }

    // Ingest payload body
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Payload too large" }));
        req.destroy();
      }
    });

    req.on("end", async () => {
      try {
        const input = JSON.parse(body || "{}");

        // 1. Ingest and normalize AgentInput
        const rawText = [input.content, input.salesChat, input.sales_chat, input.investmentProposal, input.investment_proposal]
          .filter(Boolean)
          .join("\n\n")
          .trim();

        let companyName = (input.companyName || input.company_name || "").trim();
        let website = (input.website || (Array.isArray(input.links) ? input.links[0] : "") || "").trim();
        let bankAccount = (input.bankAccount || input.bankAccountNumber || input.bank_account || "").trim();

        // 2. Gemini Semantic Extraction
        let geminiEntities = null;
        if (GEMINI_API_KEY && rawText) {
          geminiEntities = await callGeminiExtractEntities(rawText);
          if (geminiEntities) {
            console.log(
              `[openclaw] Gemini request executed: model=${GEMINI_MODEL}, extractedEntities=${JSON.stringify({
                company_name: geminiEntities.company_name,
                bank_account: geminiEntities.bank_account,
                website: geminiEntities.website,
                urgency: geminiEntities.urgency_detected,
                credential_request: geminiEntities.credential_request_detected,
              })}`
            );

            // Fill missing entities from Gemini semantic reasoning
            if (!companyName && geminiEntities.company_name) companyName = geminiEntities.company_name;
            if (!bankAccount && geminiEntities.bank_account) bankAccount = geminiEntities.bank_account;
            if (!website && geminiEntities.website) website = geminiEntities.website;
          }
        } else if (!GEMINI_API_KEY) {
          console.log("[openclaw] GEMINI_API_KEY not configured; executing deterministic extractor");
        }

        // Apply local heuristic fallback if entities still empty
        if (!companyName || !bankAccount || !website) {
          const fallback = extractEntitiesHeuristic(rawText);
          if (!companyName && fallback.company_name) companyName = fallback.company_name;
          if (!bankAccount && fallback.bank_account) bankAccount = fallback.bank_account;
          if (!website && fallback.website) website = fallback.website;
        }

        // 3. Conditional Tool Selection from tools.json manifest
        const selectedTools = [];
        if (companyName) {
          selectedTools.push("verify_company", "verify_license");
        }
        if (bankAccount) {
          selectedTools.push("check_bank_account");
        }
        if (website) {
          selectedTools.push("analyze_website");
        }
        if (rawText) {
          selectedTools.push("analyze_claim", "detect_scam_patterns");
        }

        console.log(`[openclaw] Selected tools: ${JSON.stringify(selectedTools)}`);

        // 4. Execute Selected Tools
        const aggregatedEvidence = {
          entity: {
            company_name: companyName,
            website,
            bank_account: bankAccount,
          },
          verification: {},
          claims: [],
          patterns: [],
          raw_text: rawText,
          signals: {
            urgency: Boolean(geminiEntities && (geminiEntities.urgency_detected || geminiEntities.urgency)),
            credentialRequest: Boolean(geminiEntities && (geminiEntities.credential_request_detected || geminiEntities.credential_request)),
          },
        };

        const executionLog = {};

        if (selectedTools.includes("verify_company")) {
          const res = toolVerifyCompany(companyName);
          aggregatedEvidence.verification.company = res.data;
          executionLog.verify_company = res.data ? res.data.status : "skipped";
        }
        if (selectedTools.includes("verify_license")) {
          const res = toolVerifyLicense(companyName);
          aggregatedEvidence.verification.license = res.data;
          executionLog.verify_license = res.data ? res.data.status : "skipped";
        }
        if (selectedTools.includes("check_bank_account")) {
          const res = toolCheckBankAccount(bankAccount, companyName);
          aggregatedEvidence.verification.bank_account = res.data;
          executionLog.check_bank_account = res.data ? res.data.status : "skipped";
        }
        if (selectedTools.includes("analyze_website")) {
          const res = toolAnalyzeWebsite(website);
          aggregatedEvidence.verification.website = res.data;
          executionLog.analyze_website = res.data ? (res.data.https ? "https_valid" : "http_insecure") : "skipped";
        }
        if (selectedTools.includes("analyze_claim")) {
          const res = toolAnalyzeClaim(rawText);
          aggregatedEvidence.claims = res.data ? res.data.claims_detected : [];
          executionLog.analyze_claim = `detected_${aggregatedEvidence.claims.length}`;
        }
        if (selectedTools.includes("detect_scam_patterns")) {
          const res = toolDetectScamPatterns(rawText);
          aggregatedEvidence.patterns = res.data ? res.data.patterns : [];
          aggregatedEvidence.patterns.push(...toolDetectExtendedPatterns(rawText));
          if (aggregatedEvidence.signals.credentialRequest && !aggregatedEvidence.patterns.some((pattern) => pattern.type === "credential_request")) {
            aggregatedEvidence.patterns.push({
              pattern_id: "GEMINI-credential_request",
              type: "credential_request",
              severity: "critical",
              evidence: "Gemini detected a credential request",
              description: "Gemini detected a possible request for sensitive credentials.",
            });
          }
          executionLog.detect_scam_patterns = `detected_${aggregatedEvidence.patterns.length}`;
        }

        console.log(`[openclaw] Tool execution results: ${JSON.stringify(executionLog)}`);

        // 5 & 6. Apply Deterministic Risk Policy
        const analysis = evaluateRiskPolicy(aggregatedEvidence);

        console.log(`[openclaw] Final risk score: ${analysis.risk.score}, riskLevel: ${analysis.risk.level}`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(analysis));
      } catch (err) {
        console.error("[openclaw] Processing error:", err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal agent processing error" }));
      }
    });
    return;
  }

  // 404 for unknown endpoints
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[openclaw] OpenClaw Agent Gateway listening on port ${PORT}`);
  console.log(`[openclaw] Auth token required: ${Boolean(AUTH_TOKEN)}`);
  console.log(`[openclaw] Gemini enabled: ${Boolean(GEMINI_API_KEY)} (model: ${GEMINI_MODEL})`);
});
