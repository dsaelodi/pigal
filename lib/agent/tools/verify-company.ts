import { findCompanyByName } from "../datasets";
import { CompanyVerificationData, ToolResult } from "../types";

export async function verifyCompany(companyName: string): Promise<ToolResult<CompanyVerificationData>> {
  const trimmed = companyName.trim();
  if (!trimmed) {
    return {
      success: false,
      data: null,
      source: "company_registry",
      reason: "insufficient_data",
    };
  }

  const record = findCompanyByName(trimmed);

  if (!record) {
    return {
      success: true,
      data: {
        found: false,
        company_name: trimmed,
        status: "not_found",
        source: "mock-registry",
      },
      source: "mock-registry",
      reason: "not_found",
    };
  }

  return {
    success: true,
    data: {
      found: true,
      company_name: record.company_name,
      status: record.status,
      business_type: record.business_type,
      license_status: record.license_status,
      license_type: record.license_type,
      license_number: record.license_number,
      source: record.source,
    },
    source: record.source,
  };
}
