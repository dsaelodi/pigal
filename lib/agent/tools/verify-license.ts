import { findLicenseByCompanyName } from "../datasets";
import { LicenseVerificationData, ToolResult } from "../types";

export async function verifyLicense(companyName: string): Promise<ToolResult<LicenseVerificationData>> {
  const trimmed = companyName.trim();
  if (!trimmed) {
    return {
      success: false,
      data: null,
      source: "ojk_registry",
      reason: "insufficient_data",
    };
  }

  const record = findLicenseByCompanyName(trimmed);

  if (!record || record.license_status === "not_found") {
    return {
      success: true,
      data: {
        found: false,
        company_name: trimmed,
        status: "not_found",
        license_type: null,
        license_number: null,
        regulator: "OJK",
      },
      source: "mock-license-registry",
      reason: "not_found",
    };
  }

  return {
    success: true,
    data: {
      found: record.license_status === "active",
      company_name: record.company_name,
      status: record.license_status,
      license_type: record.license_type,
      license_number: record.license_number,
      regulator: record.regulator,
    },
    source: "mock-license-registry",
  };
}
