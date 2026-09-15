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
  const gatewayUrlConfigured = Boolean(gatewayUrl);
  const authConfigured = Boolean(process.env.OPENCLAW_AUTH_TOKEN?.trim());
  const timeoutMs = parseInt(process.env.OPENCLAW_TIMEOUT_MS || "15000", 10);

  console.info("[openclaw-client] executeAnalysis started", {
    gatewayConfigured: gatewayUrlConfigured,
    gatewayUrlConfigured,
    authConfigured,
    timeoutMs,
  });

  // If no VPS gateway configured, execute local in-process agent directly
  if (!gatewayUrl) {
    console.info("[openclaw-client] NO_GATEWAY_CONFIGURED -> using local agent");
    return runRiskAssessmentAgent(input);
  }

  const authToken = process.env.OPENCLAW_AUTH_TOKEN?.trim();

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

    console.info("[openclaw-client] sending request to VPS", {
      endpoint: targetEndpoint,
      method: "POST",
    });

    const response = await fetch(targetEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.info("[openclaw-client] VPS response received", {
      endpoint: targetEndpoint,
      status: response.status,
      ok: response.ok,
    });

    if (!response.ok) {
      const body = await response.text();
      console.warn("[openclaw-client] VPS returned non-2xx", {
        status: response.status,
        body,
      });
      return runRiskAssessmentAgent(input);
    }

    const data = await response.json();
    console.info("[openclaw-client] VPS response parsed", {
      status: data.status,
      riskLevel: data.risk?.level,
      riskScore: data.risk?.score,
    });
    return data as AgentAnalysisResponse;
  } catch (error) {
    console.warn("[openclaw-client] VPS request failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
    });
    return runRiskAssessmentAgent(input);
  }
}
