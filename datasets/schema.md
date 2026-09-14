# Dataset Schema Documentation

## 1. companies.json

| Field | Type | Description | Example |
|---|---|---|---|
| company_name | string | Official company name | PT Aman Sejahtera Digital |
| aliases | array[string] | Alternative names of the company | ["Aman Sejahtera", "ASD"] |
| status | string | Company verification status | verified |
| business_type | string | Type of business | fintech |
| license_status | string | License availability status | licensed |
| license_type | string/null | Type of business license | P2P Lending |
| license_number | string/null | License identifier | MOCK-001 |
| source | string | Source of registry data | mock-registry |

## 2. licenses.json

| Field | Type | Description | Example |
|---|---|---|---|
| company_name | string | Company associated with the license | PT Aman Sejahtera Digital |
| license_status | string | Current license status | active |
| license_type | string/null | Type of license | P2P Lending |
| license_number | string/null | License identifier | MOCK-001 |
| regulator | string | Regulatory authority | OJK |

## 3. bank_accounts.json

| Field | Type | Description | Example |
|---|---|---|---|
| bank | string | Bank name | BCA |
| account_number | string | Mock bank account number | MOCK-123456 |
| account_name | string | Registered account name | PT Aman Sejahtera Digital |
| status | string | Account classification | verified |
| risk_flag | boolean | Indicates whether the account has a risk flag | false |

## 4. scam_patterns.json

| Field | Type | Description | Example |
|---|---|---|---|
| pattern_id | string | Unique pattern identifier | SCAM-001 |
| pattern | string | Scam pattern category | unrealistic_return |
| description | string | Explanation of the pattern | Promising unusually high returns |
| severity | string | Severity level | high |
| examples | array[string] | Example phrases | ["profit 30% in 7 days"] |

## 5. test_cases.json

| Field | Type | Description | Example |
|---|---|---|---|
| case_id | string | Unique test case identifier | CASE-001 |
| company_name | string | Company used in the test | PT Aman Sejahtera Digital |
| website | string | Website associated with the test case | https://example.com |
| bank_account | string | Bank account used in the test | MOCK-123456 |
| sales_chat | string | Example sales conversation | Investasi aman, return 5% per tahun. |
| expected_risk | string | Expected risk classification | low |