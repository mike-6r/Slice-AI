import {
  applicationUrl,
  resolveDeploymentConfiguration,
  withDeploymentBasePath,
  withoutDeploymentBasePath,
} from "./deployment";

/** Frontend deployment intent is explicit; it is never inferred from hostname. */
export const appEnvironment =
  (import.meta.env.VITE_APP_ENV as "development" | "test" | "beta" | "production" | undefined) ??
  "development";

export const deployment = resolveDeploymentConfiguration({
  channel: import.meta.env.VITE_DEPLOYMENT_CHANNEL,
  basePath: import.meta.env.BASE_URL,
});

export const isPreviewEnvironment = deployment.channel === "preview";
export const publicBasePath = deployment.basePath;

export const appPath = (path: string) => withDeploymentBasePath(path, publicBasePath);
export const routerPath = (pathname: string) =>
  withoutDeploymentBasePath(pathname, publicBasePath);
export const appUrl = (origin: string, path: string) =>
  applicationUrl(origin, path, publicBasePath);

export const isBetaEnvironment = appEnvironment === "beta";
