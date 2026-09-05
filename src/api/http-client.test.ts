import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient, resolveApiOrigin } from "./http-client";
import { session } from "@/auth/session";

describe("ApiClient", () => {
  it("ignores an unexpanded deployment origin placeholder", () => {
    expect(resolveApiOrigin("$APP_PUBLIC_URL", "https://staging.slice.test")).toBe(
      "https://staging.slice.test",
    );
    expect(resolveApiOrigin("https://api.slice.test", "https://staging.slice.test")).toBe(
      "https://api.slice.test",
    );
    expect(resolveApiOrigin("http://127.0.0.1:3001", "https://staging.slice.test")).toBe(
      "https://staging.slice.test",
    );
    expect(resolveApiOrigin("http://localhost:3001", "https://staging.slice.test")).toBe(
      "https://staging.slice.test",
    );
    expect(resolveApiOrigin("\\\\", "https://staging.slice.test")).toBe(
      "https://staging.slice.test",
    );
    expect(resolveApiOrigin("not-an-origin", "https://staging.slice.test")).toBe(
      "https://staging.slice.test",
    );
    expect(resolveApiOrigin("https://staging.slice.test;", "https://staging.slice.test")).toBe(
      "https://staging.slice.test",
    );
  });

  afterEach(() => {
    session.clear();
    vi.unstubAllGlobals();
  });

  it("uses the API prefix, encoded query values, and credentialed requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await new ApiClient("https://api.slice.test").get("/market/assets", { query: "a & b" });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/api/v1/market/assets", search: "?query=a+%26+b" }),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("deduplicates case-insensitive headers before sending JSON", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await new ApiClient("https://api.slice.test").request("/admin/intake/intake-1/receipt", {
      method: "POST",
      body: { checklist: {} },
      headers: { "content-type": "application/json", "Idempotency-Key": "key-1" },
    });

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(Object.keys(headers).filter((name) => name.toLowerCase() === "content-type")).toHaveLength(
      1,
    );
    expect(headers["content-type"]).toBe("application/json");
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ body: JSON.stringify({ checklist: {} }) }),
    );
  });

  it("retains canonical error and request IDs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "RATE_LIMITED",
              message: "Slow down",
              fieldErrors: { checklist: ["must contain all receipt checks"] },
            },
            requestId: "request-1",
          }),
          { status: 429, headers: { "x-request-id": "header-id" } },
        ),
      ),
    );
    await expect(new ApiClient("https://api.slice.test").get("/market/assets")).rejects.toEqual(
      expect.objectContaining({
        code: "RATE_LIMITED",
        requestId: "request-1",
        status: 429,
        fieldErrors: { checklist: ["must contain all receipt checks"] },
      }),
    );
  });

  it("supports empty 204 responses and rejects malformed JSON safely", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(new Response("not-json", { status: 200 })),
    );
    await expect(
      new ApiClient("https://api.slice.test").request<void>("/me/example", { method: "DELETE" }),
    ).resolves.toBeUndefined();
    await expect(new ApiClient("https://api.slice.test").get("/market/assets")).rejects.toEqual(
      expect.objectContaining({ code: "CLIENT_CONTRACT_ERROR" }),
    );
  });

  it("refreshes once and retries only a safe GET after an expired access credential", async () => {
    session.set("expired-access");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: "UNAUTHORIZED" } }), { status: 401 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: "fresh-access" }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new ApiClient("https://api.slice.test").get<{ ok: boolean }>("/me/session"),
    ).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer fresh-access" }),
      }),
    );
  });

  it("does not automatically retry mutations after a 401", async () => {
    session.set("expired-access");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { code: "UNAUTHORIZED" } }), { status: 401 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new ApiClient("https://api.slice.test").request("/me/watchlist/example", { method: "PUT" }),
    ).rejects.toEqual(expect.objectContaining({ code: "UNAUTHORIZED" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
