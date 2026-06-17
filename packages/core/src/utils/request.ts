import { ProxyAgent } from "undici";
import { UnifiedChatRequest } from "../types/llm";
import { parseNoProxy } from "@CCR/shared";

/**
 * Check if a string looks like an IPv4 or IPv6 address.
 */
function isIpAddress(s: string): boolean {
  // IPv4: four groups of digits separated by dots
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) return true;
  // IPv6: contains colons
  if (s.includes(":")) return true;
  return false;
}

/**
 * Check if a hostname should bypass the proxy based on NO_PROXY rules.
 *
 * Supports standard NO_PROXY patterns:
 *   - Exact hostname match (e.g. "localhost")
 *   - Suffix match with leading dot (e.g. ".example.com" matches "any.example.com")
 *     Suffix matching only applies to DNS names, not IP addresses.
 *   - Wildcard "*" to bypass all
 *   - IPv4 CIDR notation (e.g. "10.0.0.0/8", "127.0.0.0/8")
 *     IPv6 CIDR is not supported and will be skipped.
 */
function shouldBypassProxy(hostname: string, noProxyList: string[]): boolean {
  if (noProxyList.length === 0) return false;

  for (const pattern of noProxyList) {
    // Wildcard: bypass everything
    if (pattern === "*") return true;

    // Suffix match: ".example.com" matches "sub.example.com"
    // Only applies to DNS hostnames, not IP addresses
    if (pattern.startsWith(".")) {
      if (!isIpAddress(hostname)) {
        if (hostname.endsWith(pattern) || hostname === pattern.slice(1)) {
          return true;
        }
      }
      continue;
    }

    // CIDR match (IPv4 only)
    if (pattern.includes("/")) {
      if (isInCidr(hostname, pattern)) return true;
      continue;
    }

    // Exact match (case-insensitive)
    if (hostname.toLowerCase() === pattern.toLowerCase()) return true;
  }

  return false;
}

/**
 * Check if an IPv4 address falls within a CIDR range.
 * Returns false for IPv6 addresses or invalid inputs.
 */
function isInCidr(ip: string, cidr: string): boolean {
  const [network, prefixStr] = cidr.split("/");
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix)) return false;

  const ipInt = ipToInt(ip);
  const netInt = ipToInt(network);
  if (ipInt === null || netInt === null) return false;

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (netInt & mask);
}

/**
 * Convert an IPv4 address to a 32-bit integer.
 * Returns null for non-IPv4 addresses (including IPv6).
 */
function ipToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255) return null;
    result = (result << 8) | num;
  }
  return result >>> 0;
}

export function sendUnifiedRequest(
  url: URL | string,
  request: UnifiedChatRequest,
  config: any,
  context: any,
  logger?: any
): Promise<Response> {
  const headers = new Headers({
    "Content-Type": "application/json",
  });
  if (config.headers) {
    Object.entries(config.headers).forEach(([key, value]) => {
      if (value) {
        headers.set(key, value as string);
      }
    });
  }
  let combinedSignal: AbortSignal;
  const timeoutSignal = AbortSignal.timeout(config.TIMEOUT ?? 60 * 1000 * 60);

  if (config.signal) {
    const controller = new AbortController();
    const abortHandler = () => controller.abort();
    config.signal.addEventListener("abort", abortHandler);
    timeoutSignal.addEventListener("abort", abortHandler);
    combinedSignal = controller.signal;
  } else {
    combinedSignal = timeoutSignal;
  }

  const fetchOptions: RequestInit = {
    method: "POST",
    headers: headers,
    body: JSON.stringify(request),
    signal: combinedSignal,
  };

  // Apply proxy only if NO_PROXY does not match the target hostname
  if (config.httpsProxy) {
    const targetUrl = typeof url === "string" ? new URL(url) : url;
    const noProxyList = parseNoProxy(config.noProxy);
    const shouldProxy = !shouldBypassProxy(targetUrl.hostname, noProxyList);

    if (shouldProxy) {
      (fetchOptions as any).dispatcher = new ProxyAgent(
        new URL(config.httpsProxy).toString()
      );
    }
  }

  logger?.debug(
    {
      reqId: context.req.id,
      request: fetchOptions,
      headers: Object.fromEntries(headers.entries()),
      requestUrl: typeof url === "string" ? url : url.toString(),
      useProxy: config.httpsProxy,
      noProxy: config.noProxy,
    },
    "final request"
  );
  return fetch(typeof url === "string" ? url : url.toString(), fetchOptions);
}
