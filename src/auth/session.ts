type Listener = () => void;
import { recordQaRefresh } from "@/auth/qa-harness";
let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;
let refreshRetryAt = 0;
type SessionState = "initializing" | "authenticated" | "anonymous";
export type SessionRestoreStatus =
  "idle" | "restoring" | "ready" | "failed" | "expired" | "offline" | "rate_limited";
let state: SessionState = "initializing";
let restoreStatus: SessionRestoreStatus = "restoring";
const listeners = new Set<Listener>();
const refreshLockKey = "slice-auth-refresh-lock";
const refreshChannelName = "slice-auth-refresh-events";
const refreshLeaseMs = 10_000;
const refreshWaitMs = 12_000;
const refreshOwner =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `refresh-${Math.random().toString(36).slice(2)}`;

type RefreshLease = { owner: string; expiresAt: number };

function broadcastRefreshEvent(type: "complete" | "released") {
  if (typeof globalThis.BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(refreshChannelName);
  channel.postMessage({ type });
  channel.close();
}

function readRefreshLease(): RefreshLease | null {
  try {
    if (typeof window === "undefined") return null;
    const value = window.localStorage.getItem(refreshLockKey);
    return value ? (JSON.parse(value) as RefreshLease) : null;
  } catch {
    return null;
  }
}

async function waitForRefreshLease() {
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
      channel?.removeEventListener("message", onMessage);
      if (timer) globalThis.clearTimeout(timer);
      channel?.close();
      resolve();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === refreshLockKey) finish();
    };
    const onMessage = () => finish();
    const channel =
      typeof globalThis.BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(refreshChannelName);
    const timer = globalThis.setTimeout(finish, 750);
    if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
    channel?.addEventListener("message", onMessage);
  });
}

async function acquireRefreshLease() {
  if (typeof window === "undefined") return () => undefined;
  const startedAt = Date.now();
  try {
    while (Date.now() - startedAt < refreshWaitMs) {
      const current = readRefreshLease();
      if (!current || current.expiresAt <= Date.now()) {
        const candidate: RefreshLease = {
          owner: refreshOwner,
          expiresAt: Date.now() + refreshLeaseMs,
        };
        window.localStorage.setItem(refreshLockKey, JSON.stringify(candidate));
        if (readRefreshLease()?.owner === refreshOwner) {
          return () => {
            try {
              if (readRefreshLease()?.owner === refreshOwner) {
                window.localStorage.removeItem(refreshLockKey);
                broadcastRefreshEvent("released");
              }
            } catch {
              /* Storage may be unavailable in privacy mode. */
            }
          };
        }
      }
      await waitForRefreshLease();
    }
  } catch {
    /* A blocked storage implementation must never prevent session recovery. */
  }
  return () => undefined;
}

/**
 * Serialize refresh-token rotation across tabs. Web Locks provides an atomic
 * same-origin lock in supported browsers; the local-storage lease remains the
 * compatibility fallback for older browsers and restricted environments.
 */
async function withRefreshLease<T>(work: () => Promise<T>) {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request(refreshLockKey, { mode: "exclusive" }, () => work());
  }
  const release = await acquireRefreshLease();
  try {
    return await work();
  } finally {
    release();
  }
}

function retryAfterSeconds(response: Response) {
  const value = response.headers.get("Retry-After");
  const seconds = value ? Number(value) : NaN;
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
  const date = value ? Date.parse(value) : NaN;
  return Number.isFinite(date) ? Math.max(1, Math.ceil((date - Date.now()) / 1000)) : 30;
}

export const session = {
  token: () => accessToken,
  state: () => state,
  restoreStatus: () => restoreStatus,
  retryAfterSeconds: () => Math.max(0, Math.ceil((refreshRetryAt - Date.now()) / 1000)),
  set(token: string | null) {
    if (token) refreshRetryAt = 0;
    accessToken = token;
    state = token ? "authenticated" : "anonymous";
    restoreStatus = token ? "ready" : "idle";
    listeners.forEach((listener) => listener());
  },
  clear() {
    refreshRetryAt = 0;
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
    if (refreshRetryAt > Date.now()) return Promise.resolve(null);
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
    refreshPromise = withRefreshLease(() =>
      fetch(new URL("/api/v1/auth/refresh", origin), {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      }),
    )
      .then(async (response) => {
        if (response.ok) return response.json() as Promise<{ accessToken: string }>;
        if (response.status === 429) {
          refreshRetryAt = Date.now() + retryAfterSeconds(response) * 1000;
          restoreStatus = "rate_limited";
          return null;
        }
        if (response.status === 401 || response.status === 403) {
          const path = typeof window === "undefined" ? "/" : window.location.pathname;
          const protectedPath =
            /^\/(admin|account|dashboard|portfolio|orders|wallet|list|onboarding|collector-workspace|operations|submissions|buy|sell|watchlist)/.test(
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
        broadcastRefreshEvent("complete");
        refreshPromise = null;
      });
    return refreshPromise;
  },
};
