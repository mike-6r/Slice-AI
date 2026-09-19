/** Builds an API URL relative to a configured application base URL. */
export const apiUrl = (apiBaseUrl: string, path: string): URL => {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Expected an API path beginning with a single slash.");
  }
  return new URL(`api/v1${path}`, `${trimTrailingSlash(apiBaseUrl)}/`);
};

export function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
