import { afterEach, describe, expect, it, vi } from "vitest";

describe("deployment-specific session coordination", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it.each([
    ["staging", "/", "slice-auth-refresh-lock"],
    ["preview", "/preview/", "slice-preview-auth-refresh-lock"],
  ])("uses the %s lock without touching the other deployment", async (channel, base, lock) => {
    vi.resetModules();
    vi.stubEnv("VITE_DEPLOYMENT_CHANNEL", channel);
    vi.stubEnv("BASE_URL", base);
    const request = vi.fn(async (_name, _options, work: () => Promise<unknown>) => work());
    vi.stubGlobal("navigator", { locks: { request } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const { session } = await import("./session");
    await session.refresh(`https://staging.slice.test${base}`);
    expect(request).toHaveBeenCalledExactlyOnceWith(
      lock,
      { mode: "exclusive" },
      expect.any(Function),
    );
  });
});
