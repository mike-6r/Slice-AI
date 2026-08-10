import { afterEach, describe, expect, it, vi } from "vitest";

import { logout, logoutAll } from "./actions";
import { session } from "./session";

describe("auth actions", () => {
  afterEach(() => {
    session.clear();
    vi.unstubAllGlobals();
  });

  it("clears the in-memory credential after logout", async () => {
    session.set("access-token");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await logout();

    expect(session.token()).toBeNull();
    expect(fetchMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ pathname: "/api/v1/auth/logout" }),
    );
  });

  it("uses a durable idempotency key and clears the credential after logout-all", async () => {
    session.set("access-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await logoutAll();

    expect(session.token()).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/api/v1/auth/logout-all" }),
      expect.objectContaining({
        headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
      }),
    );
  });
});
