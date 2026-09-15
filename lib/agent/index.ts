import { generateGeminiSummary, isGeminiEnabled } from "./gemini";
import { extractEntities } from "./extractor";
import { orchestrateTools } from "./orchestrator";
import { evaluateRisk } from "./rule-engine";
import { AgentAnalysisResponse, AgentInput } from "./types";

/**
 * Main entry point for the Scam & Illegal Lending Risk Assessment Agent.
 * Conforms to OpenClaw & Gemini pipeline defined in docs/agent-spec.md:
 * 
 * 1. Input Validation
 * 2. Entity Extraction (Powered by Gemini with Heuristic Fallback)
 * 3. Conditional Tool Orchestration (Verify Company, License, Bank Account, Website, Claims, Patterns)
 * 4. Evidence Aggregation
 * 5. Deterministic Risk Scoring & Explanation
 */
export async function runRiskAssessmentAgent(input: AgentInput): Promise<AgentAnalysisResponse> {
// Step 1: Input Validation
const hasContent = Boolean(input.content && input.content.trim());
const hasCompany = Boolean((input.companyName || input.company_name)?.trim());
const hasWebsite = Boolean(input.website?.trim() || (input.links && input.links.length > 0));
const hasBank = Boolean((input.bankAccount || input.bankAccountNumber || input.bank_account)?.trim());
const hasChat = Boolean((input.salesChat || input.sales_chat)?.trim());
const hasProposal = Boolean((input.investmentProposal || input.investment_proposal)?.trim());
const hasScreenshots = Boolean(input.screenshots && input.screenshots.length > 0);

if (!hasContent && !hasCompany && !hasWebsite && !hasBank && !hasChat && !hasProposal && !hasScreenshots) {
  return {
    status: "insufficient_evidence",
    risk: {
      level: "INSUFFICIENT_EVIDENCE",
      score: 0,
      summary: "Tidak ada bukti yang dikirimkan untuk dianalisis.",
    },
    entity: {},
    findings: [],
    verification: {},
    patterns: [],
    claims: [],
    recommendations: ["Harap sertakan minimal satu bukti seperti teks penawaran, nama perusahaan, atau nomor rekening."],
    limitations: ["Analisis membutuhkan bukti masukan awal."],
    riskScore: 0,
    riskLevel: "LOW",
    summary: "Bukti tidak mencukupi untuk analisis.",
    redFlags: [],
    recommendation: "Harap sertakan bukti pendukung.",
  };
}

// Step 2: Entity Extraction
const entities = await extractEntities(input);

// Step 3: Conditional Tool Orchestration & Evidence Aggregation
const aggregatedEvidence = await orchestrateTools(entities);

// Step 4: Deterministic Risk Assessment & Rule Engine
const analysisResult = evaluateRisk(aggregatedEvidence);

// Step 5: Optional Gemini AI contextual summary enrichment
if (isGeminiEnabled() && analysisResult.findings.length > 0) {
  try {
    const geminiSummary = await generateGeminiSummary(
      analysisResult.findings,
      analysisResult.risk.score,
      analysisResult.risk.level
    );
    if (geminiSummary) {
      analysisResult.risk.summary = geminiSummary;
      analysisResult.summary = geminiSummary;
    }
  } catch {
    // Continue with deterministic summary
  }
}

return analysisResult;
}

export * from "./types";
export * from "./datasets";
export * from "./gemini";
export * from "./openclaw-client";
