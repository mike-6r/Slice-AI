type Listener = () => void;
import { recordQaRefresh } from "@/auth/qa-harness";
let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;
type SessionState = "initializing" | "authenticated" | "anonymous";
let state: SessionState = "initializing";
const listeners = new Set<Listener>();
export const session = {
  token: () => accessToken,
  state: () => state,
  set(token: string | null) {
    accessToken = token;
    state = token ? "authenticated" : "anonymous";
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
    recordQaRefresh();
    refreshPromise = fetch(new URL("/api/v1/auth/refresh", origin), {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    })
      .then(async (response) =>
        response.ok ? (response.json() as Promise<{ accessToken: string }>) : null,
      )
      .then((body) => {
        this.set(body?.accessToken ?? null);
        return accessToken;
      })
      .catch(() => {
        this.set(null);
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
    return refreshPromise;
  },
};
