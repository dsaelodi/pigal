import { runRiskAssessmentAgent } from "../lib/agent";
import { getTestCases } from "../lib/agent/datasets";

async function runAllTests() {
  console.log("=================================================");
  console.log("🧪 Running Risk Assessment Agent Test Suite");
  console.log("=================================================\n");

  const testCases = getTestCases();
  let passedCount = 0;
  let failedCount = 0;

  for (const tc of testCases) {
    console.log(`▶ Running ${tc.case_id} (${tc.company_name || "No company"})`);
    console.log(`  Input: Bank=${tc.bank_account || "-"}, Chat="${tc.sales_chat || "-"}"`);
    console.log(`  Expected Risk: ${tc.expected_risk.toUpperCase()}`);

    const result = await runRiskAssessmentAgent({
      companyName: tc.company_name,
      website: tc.website,
      bankAccount: tc.bank_account,
      salesChat: tc.sales_chat,
      investmentProposal: tc.investment_proposal,
    });

    const actualRisk = result.risk.level.toLowerCase();
    const isRiskMatch =
      actualRisk === tc.expected_risk.toLowerCase() ||
      // When high vs critical, critical is an acceptable high-severity match for high
      (tc.expected_risk === "high" && (actualRisk === "high" || actualRisk === "critical")) ||
      (tc.expected_risk === "critical" && (actualRisk === "critical" || actualRisk === "high"));

    if (isRiskMatch) {
      console.log(`  ✅ PASSED: Score=${result.risk.score}, Level=${result.risk.level}, Findings=${result.findings.length}\n`);
      passedCount++;
    } else {
      console.error(`  ❌ FAILED: Got ${result.risk.level}, expected ${tc.expected_risk.toUpperCase()} (Score: ${result.risk.score})\n`);
      failedCount++;
    }
  }

  // Edge case test: Insufficient evidence
  console.log(`▶ Running Edge Case: Insufficient Evidence ("Is this safe?")`);
  const edgeResult = await runRiskAssessmentAgent({
    content: "",
  });

  if (edgeResult.status === "insufficient_evidence" || edgeResult.risk.level === "INSUFFICIENT_EVIDENCE") {
    console.log(`  ✅ PASSED: Status=${edgeResult.status}, Level=${edgeResult.risk.level}\n`);
    passedCount++;
  } else {
    console.error(`  ❌ FAILED: Status=${edgeResult.status}\n`);
    failedCount++;
  }

  console.log("=================================================");
  console.log(`Test Summary: ${passedCount} passed, ${failedCount} failed.`);
  console.log("=================================================");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
