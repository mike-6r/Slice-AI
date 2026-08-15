type Listener = () => void;
import { recordQaRefresh } from "@/auth/qa-harness";
let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;
type SessionState = "initializing" | "authenticated" | "anonymous";
export type SessionRestoreStatus =
  "idle" | "restoring" | "ready" | "failed" | "expired" | "offline";
let state: SessionState = "initializing";
let restoreStatus: SessionRestoreStatus = "restoring";
const listeners = new Set<Listener>();
export const session = {
  token: () => accessToken,
  state: () => state,
  restoreStatus: () => restoreStatus,
  set(token: string | null) {
    accessToken = token;
    state = token ? "authenticated" : "anonymous";
    restoreStatus = token ? "ready" : "idle";
    listeners.forEach((listener) => listener());
  },
  clear() {
    this.set(null);
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  refresh(origin: string) {
    if (refreshPromise) return refreshPromise;
    const initialRestore =
      state === "initializing" ||
      restoreStatus === "restoring" ||
      restoreStatus === "failed" ||
      restoreStatus === "expired" ||
      restoreStatus === "offline";
    state = "initializing";
    restoreStatus = "restoring";
    listeners.forEach((listener) => listener());
    recordQaRefresh();
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), 8000);
    refreshPromise = fetch(new URL("/api/v1/auth/refresh", origin), {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.ok) return response.json() as Promise<{ accessToken: string }>;
        if (response.status === 401 || response.status === 403) {
          const path = typeof window === "undefined" ? "/" : window.location.pathname;
          const protectedPath =
            /^\/(admin|account|dashboard|portfolio|orders|wallet|list|onboarding|collector-workspace|operations|submissions|buy|sell|governance|watchlist)/.test(
              path,
            );
          if (protectedPath) restoreStatus = "expired";
        }
        return null;
      })
      .then((body) => {
        accessToken = body?.accessToken ?? null;
        state = accessToken ? "authenticated" : "anonymous";
        if (accessToken) restoreStatus = "ready";
        else if (restoreStatus === "restoring") restoreStatus = "idle";
        listeners.forEach((listener) => listener());
        return accessToken;
      })
      .catch(() => {
        accessToken = null;
        state = "anonymous";
        restoreStatus = initialRestore
          ? typeof navigator !== "undefined" && !navigator.onLine
            ? "offline"
            : "failed"
          : "idle";
        listeners.forEach((listener) => listener());
        return null;
      })
      .finally(() => {
        globalThis.clearTimeout(timeout);
        refreshPromise = null;
      });
    return refreshPromise;
  },
};
