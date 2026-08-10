import { afterEach, describe, expect, it, vi } from "vitest";

import { session } from "./session";

describe("browser session", () => {
  afterEach(() => {
    session.clear();
    vi.unstubAllGlobals();
  });

  it("uses one cookie-backed refresh request for concurrent recovery", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ accessToken: "access-after-refresh" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([
      session.refresh("https://api.slice.test"),
      session.refresh("https://api.slice.test"),
    ]);

    expect(first).toBe("access-after-refresh");
    expect(second).toBe("access-after-refresh");
    expect(session.token()).toBe("access-after-refresh");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("clears the in-memory credential when recovery fails", async () => {
    session.set("old-access");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(session.refresh("https://api.slice.test")).resolves.toBeNull();
    expect(session.token()).toBeNull();
  });
});
