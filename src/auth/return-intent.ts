const allowedReturnPaths = new Set([
  "/dashboard",
  "/marketplace",
  "/portfolio",
  "/wallet",
  "/account",
]);

/** Accept only implemented internal destinations; never carry external/open redirect targets. */
export function safeReturnIntent(value: unknown): string {
  if (typeof value !== "string") return "/dashboard";
  const candidate = value.trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\"))
    return "/dashboard";
  const path = candidate.split(/[?#]/, 1)[0];
  return allowedReturnPaths.has(path) ? path : "/dashboard";
}
