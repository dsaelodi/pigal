import { verifyCompany } from "./tools/verify-company";
import { verifyLicense } from "./tools/verify-license";
import { checkBankAccount } from "./tools/check-bank-account";
import { analyzeWebsite } from "./tools/analyze-website";
import { analyzeClaim } from "./tools/analyze-claim";
import { detectScamPatterns } from "./tools/detect-scam-patterns";
import { AggregatedEvidence, ExtractedEntities } from "./types";

export async function orchestrateTools(entities: ExtractedEntities): Promise<AggregatedEvidence> {
  const aggregated: AggregatedEvidence = {
    entity: {
      company_name: entities.company_name,
      website: entities.website,
      bank_account: entities.bank_account,
    },
    verification: {},
    claims: [],
    patterns: [],
    unsupported_tools: [],
  };

  // Promise collection for parallel execution of conditionally triggered tools
  const promises: Promise<void>[] = [];

  // 1. Company name available -> verify_company & verify_license
  if (entities.company_name) {
    promises.push(
      (async () => {
        const res = await verifyCompany(entities.company_name!);
        if (res.success && res.data) {
          aggregated.verification.company = res.data;
        }
      })()
    );

    promises.push(
      (async () => {
        const res = await verifyLicense(entities.company_name!);
        if (res.success && res.data) {
          aggregated.verification.license = res.data;
        }
      })()
    );
  }

  // 2. Bank account available -> check_bank_account
  if (entities.bank_account) {
    promises.push(
      (async () => {
        const res = await checkBankAccount(entities.bank_account!, entities.company_name);
        if (res.success && res.data) {
          aggregated.verification.bank_account = res.data;
        }
      })()
    );
  }

  // 3. Website available -> analyze_website
  if (entities.website) {
    promises.push(
      (async () => {
        const res = await analyzeWebsite(entities.website!);
        if (res.success && res.data) {
          aggregated.verification.website = res.data;
        }
      })()
    );
  }

  // 4. Promotional text / chat available -> analyze_claim & detect_scam_patterns
  if (entities.raw_text && entities.raw_text.trim()) {
    promises.push(
      (async () => {
        const res = await analyzeClaim(entities.raw_text!);
        if (res.success && res.data) {
          aggregated.claims = res.data.claims_detected;
        }
      })()
    );

    promises.push(
      (async () => {
        const res = await detectScamPatterns(entities.raw_text!);
        if (res.success && res.data) {
          aggregated.patterns = res.data.patterns;
        }
      })()
    );
  }

  await Promise.all(promises);

  return aggregated;
}
