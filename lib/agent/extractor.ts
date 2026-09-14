import { AgentInput, ExtractedEntities } from "./types";

export async function extractEntities(input: AgentInput): Promise<ExtractedEntities> {
  const result: ExtractedEntities = {};

  // 1. Gather text sources
  const textParts: string[] = [];
  if (input.content) textParts.push(input.content);
  if (input.salesChat || input.sales_chat) textParts.push(input.salesChat || input.sales_chat || "");
  if (input.investmentProposal || input.investment_proposal) {
    textParts.push(input.investmentProposal || input.investment_proposal || "");
  }

  const rawText = textParts.filter(Boolean).join("\n");
  result.raw_text = rawText;

  // 2. Directly supplied structured fields
  const companyName = input.companyName || input.company_name;
  if (companyName && companyName.trim()) {
    result.company_name = companyName.trim();
  }

  const website = input.website || (input.links && input.links.length > 0 ? input.links[0] : undefined);
  if (website && website.trim()) {
    result.website = website.trim();
  }

  const bankAccount = input.bankAccount || input.bankAccountNumber || input.bank_account;
  if (bankAccount && bankAccount.trim()) {
    result.bank_account = bankAccount.trim();
  }

  // 3. Regex / Heuristic Entity Extraction from raw text if missing
  if (rawText) {
    // Company name detection (e.g. PT Example ..., CV Example ...)
    if (!result.company_name) {
      const ptMatch = /(?:PT|CV)\s+[A-Za-z0-9\s]{3,35}/i.exec(rawText);
      if (ptMatch) {
        result.company_name = ptMatch[0].trim();
      }
    }

    // Website detection (http:// or https:// or domain.com)
    if (!result.website) {
      const urlMatch = /https?:\/\/[^\s/$.?#].[^\s]*/i.exec(rawText);
      if (urlMatch) {
        result.website = urlMatch[0].trim();
      }
    }

    // Bank account detection (e.g. Rekening BCA 123456, MOCK-123456)
    if (!result.bank_account) {
      const mockAccMatch = /MOCK-\d{6}/i.exec(rawText);
      if (mockAccMatch) {
        result.bank_account = mockAccMatch[0].trim();
      } else {
        const bankMatch = /(?:BCA|BRI|BNI|Mandiri|CIMB)\s*[:\s]*(\d{6,16})/i.exec(rawText);
        if (bankMatch) {
          result.bank_name = bankMatch[0].split(/\s|:/)[0];
          result.bank_account = bankMatch[1];
        }
      }
    }

    // Claimed return detection
    const returnMatch = /(?:profit|return|untung)\s*(?:sebesar)?\s*(\d+\s*%(?:\s*dalam\s*\d+\s*(?:hari|minggu|bulan))?)/i.exec(
      rawText
    );
    if (returnMatch) {
      result.claimed_return = returnMatch[1];
    }

    // Urgency statement detection
    if (/segera|sekarang|sebelum|promo berakhir|slot terbatas|dalam \d+ menit/i.test(rawText)) {
      result.urgency_detected = true;
    }

    // Credential request detection
    if (/otp|pin|password|kode rahasia/i.test(rawText)) {
      result.credential_request_detected = true;
    }
  }

  return result;
}
