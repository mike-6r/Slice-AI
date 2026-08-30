export type ApiErrorPayload = {
  error?: { code?: string; message?: string };
  requestId?: string;
};
import { takeQaMutationFailure } from "@/auth/qa-harness";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type QueryValue = string | number | boolean | undefined | null;
// The public staging/production web server proxies `/api` on the same origin.
// Falling back to the browser origin prevents a misconfigured client build
// from trying to refresh against the end user's own localhost.
/**
 * Resolve the API origin without allowing an unexpanded deployment placeholder
 * to become a runtime URL. The staging build is same-origin, so the browser
 * origin is a safe fallback when the deployment environment omits the Vite
 * variable or passes a shell placeholder literally.
 */
export const resolveApiOrigin = (
  configuredOrigin: string | undefined,
  browserOrigin: string | undefined,
  fallback = "http://127.0.0.1:3001",
) => {
  const isUsableOrigin = (value: string | undefined) => {
    if (!value) return false;
    try {
      const parsed = new URL(value);
      // URL accepts some punctuation in a hostname (for example a trailing
      // semicolon). A shell-escaped deployment value such as
      // `https://staging.slice.test;` would otherwise pass URL parsing and
      // make every browser API request target an invalid host.
      const hasValidHostname = parsed.hostname
        .split(".")
        .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
      return (
        (parsed.protocol === "http:" || parsed.protocol === "https:") &&
        Boolean(parsed.hostname) &&
        hasValidHostname
      );
    } catch {
      return false;
    }
  };
  const trimmed = configuredOrigin?.trim();
  const isUnexpandedPlaceholder = Boolean(trimmed && /^\$[A-Z_][A-Z0-9_]*$/.test(trimmed));
  const isLoopbackOrigin = (() => {
    if (!trimmed) return false;
    try {
      const hostname = new URL(trimmed).hostname.toLowerCase();
      return hostname === "localhost" || hostname === "::1" || hostname.startsWith("127.");
    } catch {
      return false;
    }
  })();
  const usableConfiguredOrigin =
    !isUnexpandedPlaceholder && !isLoopbackOrigin && isUsableOrigin(trimmed) ? trimmed : undefined;
  return (
    usableConfiguredOrigin ||
    (isUsableOrigin(browserOrigin) ? browserOrigin : undefined) ||
    fallback
  );
};

const browserApiOrigin = typeof window !== "undefined" ? window.location.origin : undefined;
export const API_ORIGIN = resolveApiOrigin(import.meta.env.VITE_API_BASE_URL, browserApiOrigin);

const parseBody = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(
      "CLIENT_CONTRACT_ERROR",
      "The service returned an invalid response.",
      response.headers.get("x-request-id") ?? undefined,
      response.status,
    );
  }
};

export class ApiClient {
  constructor(private readonly origin: string = API_ORIGIN) {}

  async get<T>(path: string, query?: Record<string, QueryValue>, signal?: AbortSignal): Promise<T> {
    return this.request<T>(path, { query, signal });
  }

  async request<T>(
    path: string,
    options: {
      method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      body?: unknown;
      query?: Record<string, QueryValue>;
      signal?: AbortSignal;
      headers?: Record<string, string>;
    } = {},
  ): Promise<T> {
    const qaMutationFailure =
      (options.method ?? "GET") === "GET" ? undefined : takeQaMutationFailure();
    if (qaMutationFailure) {
      throw new ApiError(
        qaMutationFailure.code,
        qaMutationFailure.message,
        undefined,
        qaMutationFailure.status,
      );
    }
    const url = new URL(`/api/v1${path}`, this.origin);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? "GET",
        cache: "no-store",
        credentials: "include",
        signal: options.signal,
        headers: {
          Accept: "application/json",
          ...(session.token() ? { Authorization: `Bearer ${session.token()}` } : {}),
          ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
          ...options.headers,
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new ApiError("NETWORK_ERROR", "Unable to reach the service.");
    }

    if (
      response.status === 401 &&
      (options.method ?? "GET") === "GET" &&
      !options.headers?.["X-Slice-Retry"] &&
      !path.startsWith("/auth/refresh") &&
      !path.startsWith("/auth/login")
    ) {
      const token = await session.refresh(this.origin);
      if (token)
        return this.request<T>(path, {
          ...options,
          headers: { ...options.headers, Authorization: `Bearer ${token}`, "X-Slice-Retry": "1" },
        });
    }
    if (response.status === 204) return undefined as T;
    const requestId = response.headers.get("x-request-id") ?? undefined;
    const body = await parseBody(response);
    if (!response.ok) {
      const payload = (body ?? {}) as ApiErrorPayload;
      throw new ApiError(
        payload.error?.code ?? "CLIENT_CONTRACT_ERROR",
        payload.error?.message ?? "The request could not be completed.",
        payload.requestId ?? requestId,
        response.status,
      );
    }
    if (body === undefined) {
      throw new ApiError(
        "CLIENT_CONTRACT_ERROR",
        "The service returned an empty response.",
        requestId,
        response.status,
      );
    }
    return body as T;
  }

  /**
   * Authenticated SSE is deliberately routed through the shared client because
   * EventSource cannot attach the bearer access credential used by Slice.
   * Durable notification reads remain the authority after any reconnect.
   */
  async stream(
    path: string,
    onEvent: (event: { type: string; data: unknown }) => void,
    signal: AbortSignal,
  ) {
    let response: Response;
    try {
      response = await fetch(new URL(`/api/v1${path}`, this.origin), {
        cache: "no-store",
        headers: {
          Accept: "text/event-stream",
          ...(session.token() ? { Authorization: `Bearer ${session.token()}` } : {}),
        },
        credentials: "include",
        signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      throw new ApiError("NETWORK_ERROR", "Unable to connect to live updates.");
    }
    if (!response.ok || !response.body)
      throw new ApiError(
        "REALTIME_UNAVAILABLE",
        "Live updates are unavailable.",
        response.headers.get("x-request-id") ?? undefined,
        response.status,
      );
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!signal.aborted) {
      const next = await reader.read();
      if (next.done) return;
      buffer += decoder.decode(next.value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const type =
          frame
            .split("\n")
            .find((line) => line.startsWith("event:"))
            ?.slice(6)
            .trim() ?? "message";
        const raw = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n");
        if (raw) {
          try {
            onEvent({ type, data: JSON.parse(raw) as unknown });
          } catch {
            /* Ignore malformed best-effort frames; durable state is refetched. */
          }
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
  }
}
import { session } from "@/auth/session";
