import { z } from "zod";

// ==========================================
// 1. Dataset Types & Schemas
// ==========================================

export const CompanyRecordSchema = z.object({
  company_name: z.string(),
  aliases: z.array(z.string()),
  status: z.enum(["verified", "unverified", "inactive", "ambiguous", "not_found"]),
  business_type: z.string(),
  license_status: z.string(),
  license_type: z.string().nullable(),
  license_number: z.string().nullable(),
  source: z.string(),
});
export type CompanyRecord = z.infer<typeof CompanyRecordSchema>;

export const LicenseRecordSchema = z.object({
  company_name: z.string(),
  license_status: z.enum(["active", "inactive", "expired", "not_found", "unknown", "not_applicable"]),
  license_type: z.string().nullable(),
  license_number: z.string().nullable(),
  regulator: z.string(),
});
export type LicenseRecord = z.infer<typeof LicenseRecordSchema>;

export const BankAccountRecordSchema = z.object({
  bank: z.string(),
  account_number: z.string(),
  account_name: z.string(),
  status: z.enum(["verified", "personal", "flagged", "unverified_account", "company_mismatch", "no_match"]),
  risk_flag: z.boolean(),
});
export type BankAccountRecord = z.infer<typeof BankAccountRecordSchema>;

export const ScamPatternRecordSchema = z.object({
  pattern_id: z.string(),
  pattern: z.string(),
  description: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  examples: z.array(z.string()),
});
export type ScamPatternRecord = z.infer<typeof ScamPatternRecordSchema>;

export const TestCaseRecordSchema = z.object({
  case_id: z.string(),
  company_name: z.string().optional(),
  website: z.string().optional(),
  bank_account: z.string().optional(),
  sales_chat: z.string().optional(),
  investment_proposal: z.string().optional(),
  expected_risk: z.enum(["low", "medium", "high", "critical", "insufficient_evidence"]),
});
export type TestCaseRecord = z.infer<typeof TestCaseRecordSchema>;

// ==========================================
// 2. Input Evidence Schema (Agent-Spec Section 3 & 24)
// ==========================================

export const AgentInputSchema = z.object({
  content: z.string().optional(),
  companyName: z.string().optional(),
  company_name: z.string().optional(),
  website: z.string().optional(),
  bankAccount: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bank_account: z.string().optional(),
  investmentProposal: z.string().optional(),
  investment_proposal: z.string().optional(),
  salesChat: z.string().optional(),
  sales_chat: z.string().optional(),
  links: z.array(z.string()).optional(),
  socialMedia: z.array(z.string()).optional(),
  social_media: z.array(z.string()).optional(),
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
export type AgentInput = z.infer<typeof AgentInputSchema>;

// ==========================================
// 3. Extracted Entities (Agent-Spec Section 5)
// ==========================================

export interface ExtractedEntities {
  company_name?: string;
  brand_name?: string;
  website?: string;
  bank_name?: string;
  bank_account?: string;
  account_holder?: string;
  claimed_return?: string;
  return_period?: string;
  urgency_detected?: boolean;
  credential_request_detected?: boolean;
  payment_instruction?: string;
  raw_text?: string;
}

// ==========================================
// 4. Tool Contracts (Agent-Spec Section 18)
// ==========================================

export interface ToolResult<T> {
  success: boolean;
  data: T | null;
  source: string;
  reason?: "not_found" | "tool_error" | "insufficient_data";
}

export interface CompanyVerificationData {
  found: boolean;
  company_name: string;
  status: "verified" | "unverified" | "not_found" | "inactive" | "ambiguous";
  business_type?: string;
  license_status?: string;
  license_type?: string | null;
  license_number?: string | null;
  source: string;
}

export interface LicenseVerificationData {
  found: boolean;
  company_name: string;
  status: "active" | "inactive" | "expired" | "not_found" | "unknown" | "not_applicable";
  license_type?: string | null;
  license_number?: string | null;
  regulator?: string;
}

export interface BankAccountVerificationData {
  found: boolean;
  bank?: string;
  account_number: string;
  account_holder?: string;
  status: "verified" | "personal" | "flagged" | "unverified_account" | "company_mismatch" | "no_match";
  risk_flag: boolean;
  warning?: string;
}

export interface WebsiteAnalysisData {
  reachable: boolean;
  domain: string;
  https: boolean;
  domain_age?: string;
  company_identity_present: boolean;
  contact_information_present: boolean;
  license_information_present: boolean;
  suspicious_signals: string[];
}

export interface ClaimAnalysisData {
  claims_detected: Array<{
    type: "unrealistic_return" | "guaranteed_profit" | "guaranteed_approval" | "short_period" | "zero_risk" | "misleading_claim";
    claim: string;
    severity: "low" | "medium" | "high" | "critical";
    explanation: string;
  }>;
}

export interface ScamPatternDetectionData {
  patterns: Array<{
    pattern_id: string;
    type: string;
    severity: "low" | "medium" | "high" | "critical";
    evidence: string;
    description: string;
  }>;
}

// ==========================================
// 5. Aggregated Evidence (Agent-Spec Section 13)
// ==========================================

export interface AggregatedEvidence {
  entity: {
    company_name?: string;
    website?: string;
    bank_account?: string;
  };
  verification: {
    company?: CompanyVerificationData;
    license?: LicenseVerificationData;
    bank_account?: BankAccountVerificationData;
    website?: WebsiteAnalysisData;
  };
  claims: ClaimAnalysisData["claims_detected"];
  patterns: ScamPatternDetectionData["patterns"];
  unsupported_tools?: string[];
}

// ==========================================
// 6. Final Response Schema (Agent-Spec Section 16, 17, 25)
// ==========================================

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "INSUFFICIENT_EVIDENCE";
export type FindingSeverity = "low" | "medium" | "high" | "critical";

export interface Finding {
  type: string;
  severity: FindingSeverity;
  title: string;
  description: string;
  evidence: string;
}

// Backward-compatible RedFlag format for Frontend PRD
export interface LegacyRedFlag {
  type: string;
  title: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  evidence: string;
  explanation: string;
}

export interface AgentAnalysisResponse {
  status: "success" | "insufficient_evidence" | "partial" | "error";
  risk: {
    level: RiskLevel;
    score: number;
    summary: string;
  };
  entity: {
    company_name?: string;
    website?: string;
    bank_account?: string;
  };
  findings: Finding[];
  verification: {
    company?: Partial<CompanyVerificationData>;
    license?: Partial<LicenseVerificationData>;
    bank_account?: Partial<BankAccountVerificationData>;
    website?: Partial<WebsiteAnalysisData>;
  };
  patterns: ScamPatternDetectionData["patterns"];
  claims: ClaimAnalysisData["claims_detected"];
  recommendations: string[];
  limitations: string[];

  // Frontend compatibility fields (PRD Section 9)
  riskScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  summary: string;
  redFlags: LegacyRedFlag[];
  recommendation: string;
}
