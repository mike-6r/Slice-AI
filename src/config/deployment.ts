export type DeploymentChannel = "staging" | "preview";

export type DeploymentConfiguration = {
  channel: DeploymentChannel;
  basePath: "/" | "/preview";
  viteBasePath: "/" | "/preview/";
};

const previewBasePath = "/preview" as const;

/**
 * Resolves the public deployment shape from explicit build configuration.
 * Preview is deliberately opt-in: a root-path build can never become a
 * preview build merely because it happens to run on a preview port.
 */
export function resolveDeploymentConfiguration(input: {
  channel?: string;
  basePath?: string;
}): DeploymentConfiguration {
  const channel = input.channel?.trim() || "staging";
  if (channel !== "staging" && channel !== "preview") {
    throw new Error("VITE_DEPLOYMENT_CHANNEL must be either staging or preview.");
  }

  const basePath = normalizeBasePath(input.basePath);
  if (channel === "preview" && basePath !== previewBasePath) {
    throw new Error("Preview builds require VITE_PUBLIC_BASE_PATH=/preview.");
  }
  if (channel === "staging" && basePath !== "/") {
    throw new Error("Staging builds must use the root public base path.");
  }

  return {
    channel,
    basePath,
    viteBasePath: basePath === "/" ? "/" : "/preview/",
  };
}

export function normalizeBasePath(value: string | undefined): "/" | "/preview" {
  const normalized = (value ?? "/").trim().replace(/\/+$/, "") || "/";
  if (normalized === "/" || normalized === previewBasePath) return normalized;
  throw new Error("VITE_PUBLIC_BASE_PATH must be / or /preview.");
}

/** Prefixes an internal route or public asset with the configured deployment path. */
export function withDeploymentBasePath(path: string, basePath: "/" | "/preview"): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Expected a rooted Slice application path.");
  }
  if (basePath === "/") return path;
  if (path === basePath || path.startsWith(`${basePath}/`)) return path;
  return path === "/" ? `${basePath}/` : `${basePath}${path}`;
}

/** Converts a browser pathname back to its router-relative counterpart. */
export function withoutDeploymentBasePath(
  pathname: string,
  basePath: "/" | "/preview",
): string {
  if (basePath === "/") return pathname.startsWith("/") ? pathname : "/";
  if (pathname === basePath || pathname === `${basePath}/`) return "/";
  if (pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length);
  return pathname.startsWith("/") ? pathname : "/";
}

/** Builds an absolute URL that remains inside the configured Slice application. */
export function applicationUrl(
  origin: string,
  path: string,
  basePath: "/" | "/preview",
): string {
  return new URL(withDeploymentBasePath(path, basePath), origin).toString();
}
