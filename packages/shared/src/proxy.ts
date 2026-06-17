/**
 * Parse NO_PROXY string into an array of trimmed, non-empty patterns.
 * Supports comma-separated values from config files and environment variables.
 */
export function parseNoProxy(noProxy: string | undefined): string[] {
  if (!noProxy) return [];
  return noProxy
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
