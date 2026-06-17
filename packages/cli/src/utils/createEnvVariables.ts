import { readConfigFile } from ".";
import { parseNoProxy } from "@CCR/shared";

/**
 * Get environment variables for Agent SDK/Claude Code integration
 * This function is shared between `ccr env` and `ccr code` commands
 */
export const createEnvVariables = async (): Promise<Record<string, string | undefined>> => {
  const config = await readConfigFile();
  const port = config.PORT || 3456;
  const apiKey = config.APIKEY || "test";

  // Build NO_PROXY: always include 127.0.0.1 (ccrouter itself), merge with user config
  const userNoProxy = config.NO_PROXY || config.no_proxy || config.noProxy || process.env.NO_PROXY || process.env.no_proxy || "";
  const parsedNoProxy = parseNoProxy(userNoProxy);
  const noProxyParts = parsedNoProxy.includes("127.0.0.1")
    ? parsedNoProxy
    : [...parsedNoProxy, "127.0.0.1"];
  const noProxyValue = noProxyParts.join(",");

  return {
    ANTHROPIC_AUTH_TOKEN: apiKey,
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
    NO_PROXY: noProxyValue,
    DISABLE_TELEMETRY: "true",
    DISABLE_COST_WARNINGS: "true",
    API_TIMEOUT_MS: String(config.API_TIMEOUT_MS ?? 600000),
    // Reset CLAUDE_CODE_USE_BEDROCK when running with ccr
    CLAUDE_CODE_USE_BEDROCK: undefined,
  };
}
