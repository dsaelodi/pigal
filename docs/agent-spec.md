# Agent Specification

## Scam & Illegal Lending Risk Assessment Agent

**Version:** 1.0
**Status:** Draft for Implementation
**Primary Runtime:** OpenClaw
**LLM:** Gemini
**Purpose:** Evidence-based risk assessment for potential online lending, investment, and scam-related activity.

---

## 1. Agent Objective

The agent analyzes evidence submitted by a user and produces a structured risk assessment.

The system must identify:

* suspicious entities
* potentially invalid or missing licenses
* suspicious payment destinations
* unrealistic financial claims
* scam-like communication patterns
* inconsistencies between submitted evidence
* supporting evidence and explanations for each detected risk

The agent must **not** definitively declare that a person, company, website, or service is a scam.

The output should use language such as:

* `Low Risk`
* `Medium Risk`
* `High Risk`
* `Potentially Suspicious`
* `Evidence Insufficient`

The assessment is an analytical risk signal, not a legal determination.

---

# 2. High-Level Architecture

```text
Frontend
   │
   │ POST /api/analyze
   ▼
Agent API
   │
   ▼
OpenClaw Agent
   │
   ├── Gemini
   │
   ├── Entity Extraction Tool
   │
   ├── Company Verification Tool
   │
   ├── License Verification Tool
   │
   ├── Bank Account Verification Tool
   │
   ├── Website Analysis Tool
   │
   ├── Claim Analysis Tool
   │
   ├── Scam Pattern Detection Tool
   │
   └── Risk Assessment / Rule Engine
   │
   ▼
Structured Analysis Result
   │
   ▼
Frontend
```

OpenClaw is responsible for orchestrating the workflow.

Gemini is responsible for reasoning, extraction, classification, and interpretation where appropriate.

Deterministic rules should be used for calculations and policy-based checks whenever possible.

---

# 3. Input Evidence

The agent may receive any combination of the following:

| Evidence            | Required | Example                          |
| ------------------- | -------- | -------------------------------- |
| Company name        | No       | PT Example Digital               |
| Website             | No       | https://example.com              |
| Screenshot          | No       | app screenshot                   |
| Bank account        | No       | 1234567890                       |
| Investment proposal | No       | "Return 30% in 7 days"           |
| Sales chat          | No       | "Transfer now before promo ends" |
| Link                | No       | social/link destination          |
| Social media        | No       | Instagram/TikTok/X URL           |

At least one evidence item must be provided.

The agent must not assume that missing evidence means the entity is safe.

---

# 4. Agent Workflow

## Step 1: Input Validation

Validate the incoming request.

Check:

* at least one evidence item exists
* URLs are syntactically valid when provided
* text fields are present and readable
* uploaded files meet supported format/size constraints handled by the API layer

If insufficient evidence exists, return:

```json
{
  "status": "insufficient_evidence"
}
```

---

# 5. Step 2: Entity Extraction

Extract relevant entities from all available evidence.

Potential entities include:

```text
company_name
brand_name
website
bank_name
bank_account
person_name
license_number
social_media_account
phone_number
claimed_return
claimed_interest_rate
referral_structure
urgency_statement
payment_instruction
```

Example:

Input:

> "PT Cepat Kaya menawarkan keuntungan 50% dalam 7 hari. Transfer ke rekening BRI Budi Santoso sekarang."

Extract:

```json
{
  "company_name": "PT Cepat Kaya",
  "bank_name": "BRI",
  "account_holder": "Budi Santoso",
  "claimed_return": "50%",
  "return_period": "7 days",
  "urgency_detected": true
}
```

The extraction result becomes the input for downstream tools.

---

# 6. Step 3: Company Verification

If a company or brand name is available, call:

```text
verify_company(company_name)
```

The tool should search the available company dataset or registry.

Expected output:

```json
{
  "found": true,
  "company_name": "PT Example Digital",
  "status": "verified",
  "business_type": "fintech",
  "source": "company_registry"
}
```

Possible states:

```text
verified
unverified
not_found
inactive
ambiguous
```

### Important

`not_found` must not automatically mean "scam".

It should generate a risk signal requiring additional evidence.

---

# 7. Step 4: License Verification

If the entity claims to operate in a regulated financial category, call:

```text
verify_license(company_name)
```

Expected output:

```json
{
  "found": true,
  "status": "active",
  "license_type": "P2P Lending",
  "license_number": "MOCK-001",
  "regulator": "OJK"
}
```

Possible states:

```text
active
inactive
expired
not_found
unknown
not_applicable
```

If a regulated activity is claimed but no corresponding license is found, create a high-priority risk signal.

---

# 8. Step 5: Bank Account Verification

If a bank account is provided, call:

```text
check_bank_account(account_number)
```

Expected output:

```json
{
  "found": true,
  "bank": "BRI",
  "account_holder": "Budi Santoso",
  "account_type": "personal",
  "status": "flagged"
}
```

Potential signals:

```text
personal_account
company_mismatch
unverified_account
known_risk_account
no_match
verified_business_account
```

A personal account should be treated as a risk signal, not automatic proof of fraud.

---

# 9. Step 6: Website Analysis

If a website or URL is available, call the website analysis tool.

Example:

```text
analyze_website(url)
```

Possible output:

```json
{
  "reachable": true,
  "domain_age": "unknown",
  "https": true,
  "company_identity_present": false,
  "contact_information_present": true,
  "license_information_present": false,
  "suspicious_signals": [
    "missing_company_identity"
  ]
}
```

The tool may inspect:

* HTTPS availability
* company identity
* contact information
* license claims
* terms and conditions
* privacy policy
* suspicious redirects
* inconsistent branding
* suspicious claims
* obvious impersonation signals

The agent must not treat technical website properties alone as proof of fraud.

---

# 10. Step 7: Claim Analysis

Analyze financial and promotional claims.

Example:

```text
analyze_claim(text)
```

The agent should detect:

* unrealistic returns
* guaranteed profit
* guaranteed approval
* guaranteed income
* unusually short return periods
* zero-risk claims
* misleading financial claims

Example:

```json
{
  "claims_detected": [
    {
      "type": "unrealistic_return",
      "claim": "50% profit in 7 days",
      "severity": "high"
    }
  ]
}
```

The agent should preserve the original claim as evidence.

---

# 11. Step 8: Scam Pattern Analysis

Analyze messages, screenshots, proposals, and extracted text.

Example:

```text
detect_scam_patterns(text)
```

Patterns may include:

```text
unrealistic_return
urgency_pressure
fear_pressure
guaranteed_profit
personal_account
fake_authority
impersonation
referral_pressure
advance_payment
identity_request
too_good_to_be_true
```

Example:

```json
{
  "patterns": [
    {
      "pattern_id": "SCAM-001",
      "type": "unrealistic_return",
      "severity": "high",
      "evidence": "Profit 50% in 7 days"
    },
    {
      "pattern_id": "SCAM-002",
      "type": "urgency_pressure",
      "severity": "medium",
      "evidence": "Transfer before midnight"
    }
  ]
}
```

---

# 12. Conditional Tool Orchestration

The agent should **not blindly call every tool**.

OpenClaw should determine which tools are relevant based on available evidence.

Example:

```text
Company name available
        │
        ├── verify_company
        └── verify_license

Bank account available
        │
        └── check_bank_account

Website available
        │
        └── analyze_website

Sales chat available
        │
        ├── analyze_claim
        └── detect_scam_patterns

Screenshot available
        │
        └── extract/interpret visual evidence
```

This conditional orchestration is a core requirement.

---

# 13. Evidence Aggregation

After all relevant tools finish, aggregate their results into a single evidence object.

Example:

```json
{
  "entity": {
    "company_name": "PT Cepat Kaya Indonesia",
    "website": "https://example.com"
  },
  "verification": {
    "company": {
      "status": "unverified"
    },
    "license": {
      "status": "not_found"
    },
    "bank_account": {
      "status": "personal",
      "account_holder": "Budi Santoso"
    }
  },
  "claims": [
    {
      "type": "unrealistic_return",
      "severity": "high"
    }
  ],
  "patterns": [
    {
      "type": "urgency_pressure",
      "severity": "medium"
    }
  ]
}
```

---

# 14. Risk Assessment

Risk assessment should combine deterministic signals and model reasoning.

Recommended risk levels:

```text
LOW
MEDIUM
HIGH
INSUFFICIENT_EVIDENCE
```

Example deterministic scoring:

| Signal                                     | Weight |
| ------------------------------------------ | -----: |
| Missing regulated license                  |    +35 |
| Personal bank account for business payment |    +25 |
| Unrealistic financial return               |    +25 |
| Urgency pressure                           |    +10 |
| Suspicious referral structure              |    +15 |
| Company not found                          |    +20 |
| Website identity inconsistency             |    +15 |
| Known flagged account                      |    +40 |

Suggested thresholds:

```text
0-24   = LOW
25-49  = MEDIUM
50-74  = HIGH
75+    = HIGH
```

These values are initial prototype rules and must remain configurable.

The agent must explain how the score was produced.

---

# 15. Risk Assessment Rules

The agent must:

1. Preserve evidence for every major risk signal.
2. Avoid claiming certainty when evidence is incomplete.
3. Distinguish between:

   * verified facts
   * detected patterns
   * model interpretation
   * missing information
4. Never invent a license, company record, bank result, or external source.
5. Clearly mark mock or unavailable data when applicable.

---

# 16. Final Response Schema

The agent must return structured JSON.

```json
{
  "status": "success",
  "risk": {
    "level": "HIGH",
    "score": 75,
    "summary": "Several indicators suggest elevated risk."
  },
  "entity": {
    "company_name": "PT Example",
    "website": "https://example.com"
  },
  "findings": [
    {
      "type": "license",
      "severity": "high",
      "title": "License not found",
      "description": "No matching license was found in the available dataset.",
      "evidence": "PT Example"
    }
  ],
  "verification": {
    "company": {},
    "license": {},
    "bank_account": {}
  },
  "patterns": [],
  "claims": [],
  "recommendations": [
    "Verify the company's legal status through the relevant regulator.",
    "Avoid transferring funds until the entity is independently verified."
  ],
  "limitations": [
    "Analysis is based only on submitted evidence.",
    "External registry data may be incomplete."
  ]
}
```

---

# 17. Status Values

Top-level `status`:

```text
success
insufficient_evidence
partial
error
```

Risk level:

```text
LOW
MEDIUM
HIGH
INSUFFICIENT_EVIDENCE
```

Finding severity:

```text
low
medium
high
critical
```

---

# 18. Tool Contract

Every agent tool should follow a consistent structure.

## Tool Request

```json
{
  "tool": "verify_company",
  "input": {
    "company_name": "PT Example"
  }
}
```

## Tool Response

```json
{
  "success": true,
  "data": {},
  "source": "mock_company_registry"
}
```

If a tool cannot determine the answer:

```json
{
  "success": false,
  "data": null,
  "reason": "not_found"
}
```

The agent must distinguish:

```text
not_found
tool_error
insufficient_data
```

These states must not be treated as equivalent.

---

# 19. Dataset Requirements

The agent should support the following datasets:

```text
companies.json
licenses.json
bank_accounts.json
scam_patterns.json
test_cases.json
```

Recommended directory:

```text
datasets/
├── companies.json
├── licenses.json
├── bank_accounts.json
├── scam_patterns.json
└── test_cases.json
```

Dataset ownership belongs to the Dataset / Research member.

The Agent Engineer is responsible for exposing datasets through tools.

---

# 20. Test Cases

The agent must be tested against controlled scenarios.

Minimum scenarios:

### CASE-001: Low Risk

* verified company
* active license
* business account
* reasonable claims
* no major scam patterns

Expected:

```text
LOW
```

### CASE-002: High Risk

* company not found
* license not found
* personal bank account
* unrealistic return
* urgent transfer request

Expected:

```text
HIGH
```

### CASE-003: Insufficient Evidence

Input:

```text
"Is this company safe?"
```

with no supporting evidence.

Expected:

```text
INSUFFICIENT_EVIDENCE
```

### CASE-004: Mixed Evidence

Some legitimate indicators plus several suspicious indicators.

Expected:

```text
MEDIUM
```

The agent should explain both positive and negative evidence.

---

# 21. Failure Handling

If a tool fails:

```text
Do not fabricate the result.
```

Instead:

```json
{
  "status": "partial",
  "limitations": [
    "License verification was unavailable."
  ]
}
```

The agent may continue with other available evidence.

---

# 22. Hallucination Prevention

The agent must follow these rules:

### Rule 1

Never invent external verification results.

### Rule 2

Never claim a regulator confirmed something unless the tool actually returned that information.

### Rule 3

Never invent a website's content.

### Rule 4

Never invent bank account ownership.

### Rule 5

Never convert uncertainty into certainty.

### Rule 6

Clearly distinguish mock dataset results from real-world verification.

---

# 23. Privacy & Security Requirements

The agent should treat all submitted evidence as untrusted.

Do not:

* expose API keys
* expose OpenClaw credentials
* expose VPS credentials
* log sensitive evidence unnecessarily
* return secrets to the frontend
* execute arbitrary user-supplied code
* trust uploaded files automatically

Sensitive information should only be processed for the purpose of the analysis.

---

# 24. Frontend Integration Contract

Frontend sends:

```http
POST /api/analyze
Content-Type: application/json
```

Conceptual request:

```json
{
  "companyName": "PT Example",
  "website": "https://example.com",
  "bankAccount": "MOCK-123",
  "investmentProposal": "...",
  "salesChat": "...",
  "links": [],
  "socialMedia": [],
  "screenshots": []
}
```

The final transport format for files may be changed by the backend implementation.

The frontend must not assume whether screenshots are transported using:

```text
base64
multipart/form-data
storage URL
object reference
```

The backend team owns that decision.

---

# 25. Frontend Response Contract

Frontend expects:

```json
{
  "status": "success",
  "risk": {
    "level": "HIGH",
    "score": 75,
    "summary": "..."
  },
  "entity": {},
  "findings": [],
  "verification": {},
  "patterns": [],
  "claims": [],
  "recommendations": [],
  "limitations": []
}
```

Frontend should render the result without needing to know the internal OpenClaw implementation.

---

# 26. Agent Engineer Responsibilities

The OpenClaw / Agent Engineer owns:

* OpenClaw setup
* agent configuration
* Gemini provider configuration
* tool registration
* conditional tool orchestration
* dataset integration
* verification workflow
* risk calculation
* final response formatting
* backend API implementation
* deployment
* server-side secret management
* agent testing

The Agent Engineer must not modify the frontend design system without coordination.

---

# 27. Dataset / Research Responsibilities

The Dataset / Research member owns:

* mock dataset creation
* dataset field definitions
* realistic test scenarios
* scam pattern research
* source documentation when using public information
* data cleaning
* test-case maintenance

The dataset member does not need to implement OpenClaw tools.

They should provide stable JSON structures that the Agent Engineer can consume.

---

# 28. Frontend Engineer Responsibilities

The Frontend Engineer owns:

* evidence input UI
* screenshot upload UI
* form validation
* analysis loading states
* error states
* result visualization
* risk summary
* findings display
* API client
* mock implementation
* responsive UI
* accessibility
* frontend security

The Frontend Engineer must not implement:

* OpenClaw
* Gemini server-side orchestration
* risk engine backend
* crawling infrastructure
* registry verification backend
* dataset processing pipelines

---

# 29. Definition of Done

The agent implementation is considered ready when:

* OpenClaw can receive an analysis request.
* OpenClaw can conditionally call relevant tools.
* Tools can access the provided datasets.
* Gemini is integrated server-side.
* Risk scoring produces deterministic results.
* Agent outputs the agreed JSON schema.
* At least four test cases pass.
* Tool failures do not cause hallucinated results.
* Mock data can later be replaced with real sources without changing the frontend contract.
* Frontend can consume the agent response without internal OpenClaw knowledge.

---

# 30. Core Principle

The architecture should demonstrate:

```text
Evidence
   ↓
Extraction
   ↓
Conditional Tool Selection
   ↓
Verification
   ↓
Pattern Detection
   ↓
Evidence Aggregation
   ↓
Risk Scoring
   ↓
Explainable Result
```

The project should **not** become:

```text
User Input
   ↓
Gemini
   ↓
"Probably a scam bro"
```

The value of OpenClaw is its ability to orchestrate the evidence-analysis workflow and select the appropriate tools based on the evidence available.
