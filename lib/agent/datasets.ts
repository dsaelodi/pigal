import fs from "fs";
import path from "path";
import {
  CompanyRecord,
  CompanyRecordSchema,
  LicenseRecord,
  LicenseRecordSchema,
  BankAccountRecord,
  BankAccountRecordSchema,
  ScamPatternRecord,
  ScamPatternRecordSchema,
  TestCaseRecord,
  TestCaseRecordSchema,
} from "./types";

function getDatasetsPath(): string {
  // In Next.js or Node script, resolve relative to current working directory
  const cwd = process.cwd();
  return path.join(cwd, "datasets");
}

function readJsonFile<T>(filename: string): T[] {
  try {
    const filePath = path.join(getDatasetsPath(), filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`Dataset file not found: ${filePath}`);
      return [];
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T[];
  } catch (error) {
    console.error(`Failed to load dataset ${filename}:`, error);
    return [];
  }
}

// Cached datasets
let companiesCache: CompanyRecord[] | null = null;
let licensesCache: LicenseRecord[] | null = null;
let bankAccountsCache: BankAccountRecord[] | null = null;
let scamPatternsCache: ScamPatternRecord[] | null = null;
let testCasesCache: TestCaseRecord[] | null = null;

export function getCompanies(): CompanyRecord[] {
  if (!companiesCache) {
    const raw = readJsonFile<unknown>("companies.json");
    companiesCache = raw
      .map((item) => {
        const parsed = CompanyRecordSchema.safeParse(item);
        return parsed.success ? parsed.data : null;
      })
      .filter((item): item is CompanyRecord => item !== null);
  }
  return companiesCache;
}

export function getLicenses(): LicenseRecord[] {
  if (!licensesCache) {
    const raw = readJsonFile<unknown>("licenses.json");
    licensesCache = raw
      .map((item) => {
        const parsed = LicenseRecordSchema.safeParse(item);
        return parsed.success ? parsed.data : null;
      })
      .filter((item): item is LicenseRecord => item !== null);
  }
  return licensesCache;
}

export function getBankAccounts(): BankAccountRecord[] {
  if (!bankAccountsCache) {
    const raw = readJsonFile<unknown>("bank_accounts.json");
    bankAccountsCache = raw
      .map((item) => {
        const parsed = BankAccountRecordSchema.safeParse(item);
        return parsed.success ? parsed.data : null;
      })
      .filter((item): item is BankAccountRecord => item !== null);
  }
  return bankAccountsCache;
}

export function getScamPatterns(): ScamPatternRecord[] {
  if (!scamPatternsCache) {
    const raw = readJsonFile<unknown>("scam_patterns.json");
    scamPatternsCache = raw
      .map((item) => {
        const parsed = ScamPatternRecordSchema.safeParse(item);
        return parsed.success ? parsed.data : null;
      })
      .filter((item): item is ScamPatternRecord => item !== null);
  }
  return scamPatternsCache;
}

export function getTestCases(): TestCaseRecord[] {
  if (!testCasesCache) {
    const raw = readJsonFile<unknown>("test_cases.json");
    testCasesCache = raw
      .map((item) => {
        const parsed = TestCaseRecordSchema.safeParse(item);
        return parsed.success ? parsed.data : null;
      })
      .filter((item): item is TestCaseRecord => item !== null);
  }
  return testCasesCache;
}

// Normalize strings for resilient searching
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/^pt\.?\s*/i, "")
    .replace(/^cv\.?\s*/i, "")
    .replace(/[^\w\s]/gi, "")
    .trim();
}

export function findCompanyByName(name: string): CompanyRecord | null {
  const companies = getCompanies();
  const searchNorm = normalize(name);
  if (!searchNorm) return null;

  // 1. Exact match on company_name
  for (const c of companies) {
    if (normalize(c.company_name) === searchNorm) return c;
  }

  // 2. Exact match on aliases
  for (const c of companies) {
    for (const alias of c.aliases) {
      if (normalize(alias) === searchNorm) return c;
    }
  }

  // 3. Substring containment match
  for (const c of companies) {
    const cNorm = normalize(c.company_name);
    if (cNorm.includes(searchNorm) || searchNorm.includes(cNorm)) {
      return c;
    }
  }

  return null;
}

export function findLicenseByCompanyName(name: string): LicenseRecord | null {
  const licenses = getLicenses();
  const searchNorm = normalize(name);
  if (!searchNorm) return null;

  for (const l of licenses) {
    const lNorm = normalize(l.company_name);
    if (lNorm === searchNorm || lNorm.includes(searchNorm) || searchNorm.includes(lNorm)) {
      return l;
    }
  }

  return null;
}

export function findBankAccountByNumber(accountIdentifier: string): BankAccountRecord | null {
  const accounts = getBankAccounts();
  const rawId = accountIdentifier.trim().toLowerCase();
  const cleanDigits = accountIdentifier.replace(/\D/g, "");

  for (const acc of accounts) {
    // exact match on account_number, e.g. "MOCK-123456"
    if (acc.account_number.toLowerCase() === rawId) return acc;
    // numeric match, e.g. "123456"
    const accDigits = acc.account_number.replace(/\D/g, "");
    if (cleanDigits && accDigits && (cleanDigits === accDigits || accDigits.endsWith(cleanDigits) || cleanDigits.endsWith(accDigits))) {
      return acc;
    }
  }

  return null;
}
