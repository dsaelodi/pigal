import { runRiskAssessmentAgent } from "./index";
import { AgentAnalysisResponse, AgentInput } from "./types";

/**
 * Check if external OpenClaw VPS Gateway is configured.
 */
export function isOpenClawGatewayConfigured(): boolean {
  return Boolean(process.env.OPENCLAW_GATEWAY_URL && process.env.OPENCLAW_GATEWAY_URL.trim());
}

/**
 * Execute risk assessment through OpenClaw VPS Gateway if configured,
 * or gracefully fallback to local in-process OpenClaw agent runner.
 * 
 * Complies with docs/security(1).md:
 * - Internal gateway IP and tokens are never leaked to user clients.
 * - Fault tolerant with automatic local fallback if VPS is offline or unreachable.
 */
export async function executeAnalysis(input: AgentInput): Promise<AgentAnalysisResponse> {
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL?.trim();

  // If no VPS gateway configured, execute local in-process agent directly
  if (!gatewayUrl) {
    return runRiskAssessmentAgent(input);
  }

  const authToken = process.env.OPENCLAW_AUTH_TOKEN?.trim();
  const timeoutMs = parseInt(process.env.OPENCLAW_TIMEOUT_MS || "15000", 10);

  // Normalize gateway endpoint: if path not specified, target /api/analyze
  let targetEndpoint = gatewayUrl;
  if (!targetEndpoint.endsWith("/api/analyze")) {
    targetEndpoint = `${targetEndpoint.replace(/\/+$/, "")}/api/analyze`;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(targetEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(
        `OpenClaw gateway returned HTTP ${response.status}. Falling back to local agent runtime.`
      );
      return runRiskAssessmentAgent(input);
    }

    const data = await response.json();
    return data as AgentAnalysisResponse;
  } catch (error) {
    // Log safe server error without leaking sensitive tokens
    console.warn("Unable to reach OpenClaw VPS Gateway, executing local agent runner:", error instanceof Error ? error.message : "Network error");
    return runRiskAssessmentAgent(input);
  }
}
