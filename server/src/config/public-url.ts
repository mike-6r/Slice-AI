/**
 * Creates a first-party URL without dropping a deployment path such as
 * `/preview`. Paths are relative to the configured public application root.
 */
export function publicApplicationUrl(publicBaseUrl: string, path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Expected a rooted Slice application path.");
  }
  return new URL(path.slice(1), `${publicBaseUrl.replace(/\/$/, "")}/`).toString();
}
