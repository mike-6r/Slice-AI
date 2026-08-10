import { ApiClient } from "@/api/http-client";
import { session } from "@/auth/session";

const createIdempotencyKey = () => crypto.randomUUID();

/** Auth mutations are deliberately explicit; the HTTP client never retries them automatically. */
export async function logout() {
  try {
    await new ApiClient().request<void>("/auth/logout", { method: "POST" });
  } finally {
    session.clear();
  }
}

export async function logoutAll() {
  try {
    await new ApiClient().request<void>("/auth/logout-all", {
      method: "POST",
      headers: { "Idempotency-Key": createIdempotencyKey() },
    });
  } finally {
    session.clear();
  }
}
