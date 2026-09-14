import {
  AggregatedEvidence,
  Finding,
  LegacyRedFlag,
  RiskLevel,
  AgentAnalysisResponse,
} from "./types";

export function evaluateRisk(evidence: AggregatedEvidence): AgentAnalysisResponse {
  let score = 0;
  const findings: Finding[] = [];
  const legacyRedFlags: LegacyRedFlag[] = [];
  const recommendations: string[] = [];
  const limitations: string[] = [
    "Analisis risiko berbasis bukti analitik yang dikirimkan pengguna dan dataset yang tersedia.",
    "Bukan merupakan putusan hukum final (legal determination).",
  ];

  const hasAnyEvidence =
    Boolean(evidence.entity.company_name) ||
    Boolean(evidence.entity.website) ||
    Boolean(evidence.entity.bank_account) ||
    evidence.claims.length > 0 ||
    evidence.patterns.length > 0;

  if (!hasAnyEvidence) {
    return {
      status: "insufficient_evidence",
      risk: {
        level: "INSUFFICIENT_EVIDENCE",
        score: 0,
        summary: "Bukti yang diberikan tidak mencukupi untuk melakukan analisis risiko yang bermakna.",
      },
      entity: {},
      findings: [],
      verification: {},
      patterns: [],
      claims: [],
      recommendations: ["Sediakan nama perusahaan, tautan situs web, nomor rekening, atau isi promosi/chat penawaran."],
      limitations,
      riskScore: 0,
      riskLevel: "LOW",
      summary: "Bukti tidak mencukupi untuk analisis.",
      redFlags: [],
      recommendation: "Kirimkan bukti pendukung tambahan untuk dianalisis.",
    };
  }

  // 1. Evaluate Company & License
  const comp = evidence.verification.company;
  const lic = evidence.verification.license;

  if (comp) {
    if (comp.status === "unverified" || comp.status === "not_found") {
      score += 20;
      findings.push({
        type: "company_unverified",
        severity: "medium",
        title: "Perusahaan Tidak Terverifikasi",
        description: `Perusahaan "${comp.company_name}" tidak tercatat dalam basis data badan usaha resmi atau registri fintech.`,
        evidence: comp.company_name,
      });
      legacyRedFlags.push({
        type: "UNVERIFIED_COMPANY",
        title: "Perusahaan Tidak Terdaftar",
        severity: "HIGH",
        evidence: comp.company_name,
        explanation: "Entitas bisnis tidak ditemukan pada data resmi pendaftaran perusahaan.",
      });
    }
  }

  if (lic) {
    if (lic.status === "not_found" || lic.status === "inactive" || lic.status === "expired") {
      score += 35;
      findings.push({
        type: "license_not_found",
        severity: "high",
        title: "Izin Usaha / Lisensi Regulator Tidak Ditemukan",
        description: `Tidak ditemukan izin operasional ${lic.regulator || "OJK"} yang valid untuk entitas ini.`,
        evidence: lic.company_name,
      });
      legacyRedFlags.push({
        type: "NO_LICENSE",
        title: "Izin Usaha Tidak Ditemukan",
        severity: "HIGH",
        evidence: lic.company_name,
        explanation: `Tidak ada izin aktif dari regulator keuangan (${lic.regulator || "OJK"}). Menawarkan produk keuangan tanpa izin berisiko tinggi.`,
      });
    }
  }

  // 2. Evaluate Bank Account
  const bank = evidence.verification.bank_account;
  if (bank) {
    if (bank.status === "personal") {
      score += 25;
      findings.push({
        type: "personal_account",
        severity: "high",
        title: "Rekening Tujuan Atas Nama Pribadi",
        description: `Rekening (${bank.bank || ""} ${bank.account_number}) terdaftar atas nama perorangan (${bank.account_holder || "Individu"}), bukan rekening institusi bisnis resmi.`,
        evidence: `${bank.bank || ""} ${bank.account_number} a.n. ${bank.account_holder || "Pribadi"}`,
      });
      legacyRedFlags.push({
        type: "PERSONAL_ACCOUNT",
        title: "Transfer ke Rekening Pribadi",
        severity: "HIGH",
        evidence: `${bank.bank || ""} ${bank.account_number} a.n. ${bank.account_holder || "Pribadi"}`,
        explanation: "Layanan investasi legal selalu menggunakan rekening penampung resmi atas nama perusahaan (escrow/virtual account), bukan rekening pribadi.",
      });
    }

    if (bank.risk_flag && bank.status !== "personal") {
      score += 40;
      findings.push({
        type: "flagged_account",
        severity: "critical",
        title: "Rekening Ditandai Berisiko",
        description: "Nomor rekening ini memiliki catatan laporan atau indikasi penipuan sebelumnya.",
        evidence: bank.account_number,
      });
      legacyRedFlags.push({
        type: "FLAGGED_ACCOUNT",
        title: "Rekening Berisiko Tinggi",
        severity: "CRITICAL",
        evidence: bank.account_number,
        explanation: "Nomor rekening tujuan telah masuk dalam basis data pengawasan risiko finansial.",
      });
    }
  }

  // 3. Evaluate Website
  const web = evidence.verification.website;
  if (web) {
    if (!web.https) {
      score += 15;
      findings.push({
        type: "insecure_website",
        severity: "medium",
        title: "Koneksi Website Tidak Aman (HTTP)",
        description: "Situs web tidak menerapkan enkripsi HTTPS standar untuk transaksi finansial.",
        evidence: web.domain,
      });
    }
    if (web.suspicious_signals && web.suspicious_signals.length > 0) {
      const hasDomainIssue = web.suspicious_signals.some((s) => s.includes("suspicious_domain"));
      if (hasDomainIssue) {
        score += 20;
        findings.push({
          type: "suspicious_domain",
          severity: "high",
          title: "Domain Situs Mencurigakan",
          description: "Nama domain menggunakan kata kunci atau pola yang sering diasosiasikan dengan situs penipuan tiruan.",
          evidence: web.domain,
        });
        legacyRedFlags.push({
          type: "SUSPICIOUS_DOMAIN",
          title: "Domain Tidak Kredibel",
          severity: "HIGH",
          evidence: web.domain,
          explanation: "Nama domain situs web mengindikasikan situs tiruan atau situs sementara berisiko.",
        });
      }
    }
  }

  // 4. Evaluate Claims
  for (const claim of evidence.claims) {
    if (claim.type === "unrealistic_return") {
      score += 25;
      findings.push({
        type: "unrealistic_return",
        severity: "high",
        title: "Klaim Keuntungan Tidak Wajar",
        description: claim.explanation,
        evidence: claim.claim,
      });
      legacyRedFlags.push({
        type: "UNREALISTIC_RETURN",
        title: "Klaim Return Tidak Masuk Akal",
        severity: "HIGH",
        evidence: claim.claim,
        explanation: claim.explanation,
      });
    } else if (claim.type === "guaranteed_profit") {
      score += 20;
      findings.push({
        type: "guaranteed_profit",
        severity: "high",
        title: "Garansi Bebas Risiko",
        description: claim.explanation,
        evidence: claim.claim,
      });
      legacyRedFlags.push({
        type: "GUARANTEED_PROFIT",
        title: "Klaim Profit Pasti / Tanpa Risiko",
        severity: "HIGH",
        evidence: claim.claim,
        explanation: claim.explanation,
      });
    }
  }

  // 5. Evaluate Scam Patterns
  for (const pattern of evidence.patterns) {
    if (pattern.type === "credential_request") {
      score += 45;
      findings.push({
        type: "credential_theft",
        severity: "critical",
        title: "Permintaan Kredensial Sensitif (OTP/PIN)",
        description: "Pihak promosi meminta kode OTP, PIN, atau kata sandi pribadi.",
        evidence: pattern.evidence,
      });
      legacyRedFlags.push({
        type: "CREDENTIAL_REQUEST",
        title: "Permintaan OTP / PIN Rahasia",
        severity: "CRITICAL",
        evidence: pattern.evidence,
        explanation: "Lembaga resmi tidak pernah meminta kode OTP atau PIN Anda. Ini indikasi jelas pengambilalihan akun.",
      });
    } else if (pattern.type === "urgency_pressure") {
      score += 10;
      findings.push({
        type: "urgency_tactic",
        severity: "medium",
        title: "Tekanan Urgensi / Waktu Terbatas",
        description: "Promosi menekan korban untuk segera mentransfer dana tanpa kesempatan verifikasi.",
        evidence: pattern.evidence,
      });
      legacyRedFlags.push({
        type: "URGENCY",
        title: "Tekanan Urgensi Waktu",
        severity: "MEDIUM",
        evidence: pattern.evidence,
        explanation: "Manipulasi psikologis agar korban segera mengirim uang sebelum sempat mengecek fakta.",
      });
    } else if (pattern.type === "advance_payment") {
      score += 20;
      findings.push({
        type: "advance_fee",
        severity: "high",
        title: "Permintaan Biaya di Awal (Advance Fee)",
        description: pattern.description,
        evidence: pattern.evidence,
      });
      legacyRedFlags.push({
        type: "ADVANCE_PAYMENT",
        title: "Biaya Deposit / Aktivasi di Awal",
        severity: "HIGH",
        evidence: pattern.evidence,
        explanation: "Modus meminta uang muka sebelum pinjaman/keuntungan dicairkan adalah ciri khas penipuan.",
      });
    }
  }

  // Deduplicate legacy red flags by type
  const uniqueRedFlags = legacyRedFlags.filter(
    (item, index, self) => index === self.findIndex((t) => t.type === item.type)
  );

  // Normalize final score between 0 and 100
  const normalizedScore = Math.min(100, Math.max(0, score));

  // Determine Risk Level
  let level: RiskLevel = "LOW";
  let legacyLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";

  if (normalizedScore >= 75 || findings.some((f) => f.severity === "critical")) {
    level = "CRITICAL";
    legacyLevel = "CRITICAL";
  } else if (normalizedScore >= 50) {
    level = "HIGH";
    legacyLevel = "HIGH";
  } else if (normalizedScore >= 25) {
    level = "MEDIUM";
    legacyLevel = "MEDIUM";
  } else {
    level = "LOW";
    legacyLevel = "LOW";
  }

  // Generate Summary & Recommendations
  let summary = "";
  if (level === "CRITICAL" || level === "HIGH") {
    summary = `Terdeteksi indikator risiko tinggi (${findings.length} temuan mencurigakan). Sangat dianjurkan untuk tidak mentransfer dana.`;
    recommendations.push(
      "Jangan melakukan transfer dana atau membagikan identitas pribadi dan kode OTP kepada pihak ini.",
      "Verifikasi status legalitas badan usaha langsung melalui situs resmi OJK (ojk.go.id) atau kontak 157.",
      "Laporkan nomor rekening atau nomor kontak terkait ke platform resmi lapor.go.id bila terjadi kerugian."
    );
  } else if (level === "MEDIUM") {
    summary = "Terdapat beberapa indikasi yang perlu diwaspadai sebelum mengambil keputusan finansial.";
    recommendations.push(
      "Pastikan legalitas dan perjanjian tertulis sudah jelas sebelum melakukan transaksi apa pun.",
      "Hindari pengiriman dana ke rekening atas nama perorangan."
    );
  } else {
    summary = "Berdasarkan bukti yang dianalisis, entitas terdaftar resmi dan klaim penawaran berada dalam batas kewajaran.";
    recommendations.push(
      "Tetap lakukan due diligence dan pelajari seluruh syarat dan ketentuan investasi.",
      "Selalu gunakan kanal dan rekening pembayaran resmi institusi."
    );
  }

  return {
    status: "success",
    risk: {
      level,
      score: normalizedScore,
      summary,
    },
    entity: {
      company_name: evidence.entity.company_name,
      website: evidence.entity.website,
      bank_account: evidence.entity.bank_account,
    },
    findings,
    verification: {
      company: evidence.verification.company,
      license: evidence.verification.license,
      bank_account: evidence.verification.bank_account,
      website: evidence.verification.website,
    },
    patterns: evidence.patterns,
    claims: evidence.claims,
    recommendations,
    limitations,

    // Legacy fields for frontend compatibility
    riskScore: normalizedScore,
    riskLevel: legacyLevel,
    summary,
    redFlags: uniqueRedFlags,
    recommendation: recommendations[0] || "Lakukan verifikasi menyeluruh sebelum bertransaksi.",
  };
}
