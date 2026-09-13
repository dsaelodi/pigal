# PRD - Scam Risk Detector Frontend

## 1. Document Status

- Status: Frontend MVP specification
- Owner: Frontend/Product implementation
- Integration partner: Agent/OpenClaw implementation
- Scope: Frontend, API contract, UX states, mock integration, client-side validation, security boundaries
- Out of scope: OpenClaw installation, VPS administration, Gemini provider setup on the server, agent orchestration internals, model training

## 2. Product Summary

Scam Risk Detector is a web interface that helps users assess suspicious investment or business promotion content. The system accepts text content, sends it to an agent backend, and presents an evidence-based risk assessment instead of a generic chatbot answer.

The frontend is deliberately separated from the AI runtime. The frontend does not contain the Gemini API key and does not call Gemini directly. It only communicates with a backend/agent API that will later be implemented and exposed by the team member responsible for OpenClaw.

## 3. Main User Problem

People may encounter investment or money-making promotions containing signals such as:

- unrealistic returns
- pressure or urgency
- requests to transfer money to personal accounts
- referral structures resembling MLM
- lack of verifiable licensing or authorization
- guaranteed profit claims

The product should help the user understand *why* content is risky, not merely label it as scam or not scam.

## 4. Product Goal

Build a clean, credible frontend MVP that:

1. Accepts suspicious content.
2. Sends the content to the agent API.
3. Displays the overall risk level and score.
4. Displays each detected red flag with supporting evidence.
5. Shows a concise explanation and recommendation.
6. Clearly communicates loading, errors, incomplete results, and service failures.
7. Can be integrated with the OpenClaw agent without redesigning the frontend architecture.

## 5. Non-Goals

The frontend must NOT attempt to:

- independently determine legal validity without backend evidence
- expose or store Gemini API keys
- claim that content is legally proven to be fraudulent
- replace regulators, financial institutions, or professional legal advice
- implement OpenClaw itself
- implement the agent's internal reasoning
- scrape arbitrary websites in the browser
- create user accounts for the MVP unless explicitly required later

## 6. Target MVP Flow

```text
User opens application
        |
        v
User pastes suspicious content
        |
        v
User selects Analyze
        |
        v
Frontend validates input
        |
        v
POST /api/analyze
        |
        v
Agent/OpenClaw backend
        |
        v
Structured analysis response
        |
        v
Frontend renders result
```

## 7. Primary Screens

### 7.1 Analyzer Screen

Purpose: Main task interface.

Required elements:

- product name / wordmark
- concise product description
- large text input area
- character guidance or count
- Analyze button
- clear/reset action when content exists
- optional sample input for demo mode

Do not create a chat-style interface. This is an analysis tool, not a chatbot.

### 7.2 Analysis Result

Required sections:

- Risk level
- Risk score
- One-sentence summary
- Red flags list
- Evidence for each red flag
- Explanation for each red flag
- Recommendation

Example hierarchy:

```text
HIGH RISK
87 / 100

Several high-risk indicators were detected.

Red flags
────────────────────────
Unrealistic Return       HIGH
"30% profit in 7 days"
Explanation...

Personal Account        HIGH
"Transfer to this account"
Explanation...

Recommendation
Do not transfer funds until the entity and authorization can be verified.
```

### 7.3 Error / Empty States

The frontend must support:

- empty submission
- content too long
- invalid API response
- network error
- API timeout
- backend unavailable
- server rate limiting
- analysis completed with no red flags

Errors should tell the user what happened and what action is possible. Never expose raw stack traces.

## 8. Functional Requirements

### FR-01 Input

The user can paste plain text into the analyzer.

### FR-02 Validation

The frontend rejects empty input. It should enforce a reasonable maximum payload size agreed with the backend contract.

### FR-03 Request

The frontend sends the content to a single backend analysis endpoint.

### FR-04 Loading

While analysis is running:

- disable duplicate submissions
- show a clear progress/loading state
- preserve submitted content
- do not fake progress percentages

### FR-05 Result Rendering

Render only fields returned by the validated response schema.

### FR-06 Risk Representation

Risk level should be visually obvious but not sensationalized.

Recommended levels:

- LOW
- MEDIUM
- HIGH
- CRITICAL

### FR-07 Evidence

Every displayed red flag should include evidence returned by the backend.

### FR-08 Recommendation

Show a practical recommendation based on the backend output.

### FR-09 Reset

The user can clear the current analysis and start again.

### FR-10 Mock Mode

The frontend must support local mock data while the OpenClaw backend is still being developed.

## 9. API Contract

The frontend should consume an endpoint such as:

```http
POST /api/analyze
Content-Type: application/json
```

Request:

```json
{
  "content": "Profit 30% in 7 days. Limited slots. Transfer to this personal account."
}
```

Response:

```json
{
  "riskScore": 87,
  "riskLevel": "HIGH",
  "summary": "Several high-risk indicators were detected.",
  "redFlags": [
    {
      "type": "UNREALISTIC_RETURN",
      "title": "Unrealistic Return",
      "severity": "HIGH",
      "evidence": "Profit 30% in 7 days",
      "explanation": "The promotion promises an unusually high return within a short period."
    },
    {
      "type": "PERSONAL_ACCOUNT",
      "title": "Personal Account Transfer",
      "severity": "HIGH",
      "evidence": "Transfer to this personal account",
      "explanation": "The promotion requests payment to a personal account."
    }
  ],
  "recommendation": "Verify the entity, authorization, and payment destination before transferring funds."
}
```

### Contract Rules

- `riskScore`: number from 0 to 100
- `riskLevel`: one of `LOW | MEDIUM | HIGH | CRITICAL`
- `summary`: short plain-text explanation
- `redFlags`: array, can be empty
- `redFlags[].type`: stable machine-readable identifier
- `redFlags[].title`: user-facing title
- `redFlags[].severity`: `LOW | MEDIUM | HIGH | CRITICAL`
- `redFlags[].evidence`: direct or minimally processed evidence from input
- `redFlags[].explanation`: explanation grounded in the evidence
- `recommendation`: concise action-oriented guidance

The frontend should validate this contract at runtime before rendering it.

## 10. Suggested Frontend Structure

```text
src/
├── app/
│   ├── page.tsx
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── analyzer/
│   ├── results/
│   └── ui/
├── lib/
│   ├── api.ts
│   ├── schemas.ts
│   └── mock-data.ts
└── types/
    └── analysis.ts
```

Suggested components:

- `AnalyzerForm`
- `AnalysisResult`
- `RiskScore`
- `RiskLevelBadge`
- `RedFlagList`
- `RedFlagItem`
- `RecommendationCard`
- `AnalysisError`
- `LoadingState`

## 11. Technical Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- ESLint
- Optional: shadcn/ui for low-level accessible primitives
- Optional: Lucide React for icons
- Runtime validation: Zod

The current Next.js documentation recommends `create-next-app` for initialization. The current default setup can include TypeScript, ESLint, Tailwind CSS, App Router, and Turbopack. citeturn858059search0turn858059search2

## 12. UX Principles

- Tool first, chatbot second: preferably no chat bubbles.
- Evidence before drama: show why the system reached its result.
- Calm visual hierarchy: risk should be visible without using giant red warning screens.
- One primary action per state.
- Avoid unnecessary animation.
- Avoid decorative AI imagery, glowing effects, or generic dashboard clutter.
- Use clear Indonesian or English copy consistently based on the competition's final language decision.

## 13. Acceptance Criteria

MVP is considered complete when:

- the app runs locally
- analyzer accepts text
- mock analysis renders correctly
- frontend handles empty/loading/error/success states
- API integration is isolated in a single service module
- runtime response validation exists
- no secret is present in client-side code
- frontend can switch from mock mode to real `/api/analyze` without redesign
- repository includes this PRD, design system, and security specification

## 14. Agent Handoff Summary for Teammate

### What the agent is for

The agent is responsible for analyzing suspicious investment/business promotion content and returning a structured, evidence-based risk assessment for the frontend.

### What the agent should do

1. Read the supplied content.
2. Extract relevant claims and evidence.
3. Detect supported red flags.
4. Explain each detected red flag.
5. Produce a normalized risk score.
6. Produce a risk level.
7. Produce a concise summary.
8. Produce a practical recommendation.
9. Return the result in the agreed JSON schema.

### Initial red flags

```text
NO_LICENSE
UNREALISTIC_RETURN
URGENCY
PERSONAL_ACCOUNT
MLM_REFERRAL
GUARANTEED_PROFIT
FAKE_AUTHORITY
FAKE_TESTIMONIAL
NO_VERIFIABLE_INFORMATION
```

### Important agent rules

- Do not invent evidence.
- Do not claim legal certainty from text alone.
- Every red flag should include supporting evidence.
- Keep identifiers stable so the frontend can map them to UI labels.
- Return valid structured JSON.
- Keep risk score between 0 and 100.
- Prefer deterministic scoring/rules for final risk calculation where practical.
- Keep provider credentials on the server only.

### Integration point

The frontend is expecting:

```text
POST /api/analyze
```

The teammate may implement the internal OpenClaw flow however needed, as long as the external response conforms to the API contract above.

### Information the teammate must provide after agent setup

```text
1. Final API endpoint
2. HTTP method
3. Request schema
4. Response schema
5. Maximum payload size
6. Expected timeout
7. Error codes
8. Rate-limit behavior
9. Authentication requirement, if any
10. CORS requirement, if frontend and agent are on different origins
11. Production base URL
12. Health-check endpoint, if available
```

## 15. Future Scope

Potential later additions, not part of the base frontend MVP:

- URL analysis
- image/screenshot analysis
- source verification
- regulatory database integration
- history of analyses
- exportable reports
- multilingual analysis

Do not implement these before the core text analysis integration works reliably.
