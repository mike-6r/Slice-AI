/** Frontend deployment intent is explicit; it is never inferred from hostname. */
export const appEnvironment =
  (import.meta.env.VITE_APP_ENV as "development" | "test" | "beta" | "production" | undefined) ??
  "development";

export const isBetaEnvironment = appEnvironment === "beta";
