import { findBankAccountByNumber } from "../datasets";
import { BankAccountVerificationData, ToolResult } from "../types";

export async function checkBankAccount(
  accountNumber: string,
  expectedCompanyName?: string
): Promise<ToolResult<BankAccountVerificationData>> {
  const trimmed = accountNumber.trim();
  if (!trimmed) {
    return {
      success: false,
      data: null,
      source: "bank_verification",
      reason: "insufficient_data",
    };
  }

  const record = findBankAccountByNumber(trimmed);

  if (!record) {
    return {
      success: true,
      data: {
        found: false,
        account_number: trimmed,
        status: "no_match",
        risk_flag: false,
        warning: "Rekening tidak ditemukan dalam basis data registrasi bank resmi.",
      },
      source: "mock-bank-registry",
      reason: "not_found",
    };
  }

  // Check company mismatch if expectedCompanyName is provided
  let status = record.status;
  let warning: string | undefined;

  if (record.status === "personal") {
    warning = `Rekening atas nama perorangan (${record.account_name}), bukan rekening badan usaha terdaftar.`;
  } else if (expectedCompanyName && record.account_name) {
    const normExpected = expectedCompanyName.toLowerCase().replace(/^pt\.?\s*/i, "");
    const normActual = record.account_name.toLowerCase().replace(/^pt\.?\s*/i, "");
    if (!normActual.includes(normExpected) && !normExpected.includes(normActual)) {
      status = "company_mismatch";
      warning = `Nama pemegang rekening (${record.account_name}) tidak cocok dengan nama perusahaan yang diklaim (${expectedCompanyName}).`;
    }
  }

  return {
    success: true,
    data: {
      found: true,
      bank: record.bank,
      account_number: record.account_number,
      account_holder: record.account_name,
      status,
      risk_flag: record.risk_flag || status === "personal" || status === "company_mismatch",
      warning,
    },
    source: "mock-bank-registry",
  };
}
