import { describe, expect, it } from "vitest";

import {
  applicationUrl,
  browserPersistenceFor,
  resolveDeploymentConfiguration,
  withDeploymentBasePath,
  withoutDeploymentBasePath,
} from "./deployment";

describe("public deployment configuration", () => {
  it("preserves staging browser keys while isolating every Preview key and cookie path", () => {
    const staging = browserPersistenceFor("staging");
    expect(staging).toEqual({
      refreshLock: "slice-auth-refresh-lock",
      refreshChannel: "slice-auth-refresh-events",
      currencyStorage: "slice.display-currency",
      currencyCookie: "slice_display_currency",
      cookiePath: "/",
    });
    const preview = browserPersistenceFor("preview");
    for (const key of Object.keys(staging) as Array<keyof typeof staging>) {
      expect(preview[key]).not.toBe(staging[key]);
    }
    expect(preview.cookiePath).toBe("/preview");
  });
  it("keeps normal staging at the root path", () => {
    expect(resolveDeploymentConfiguration({})).toEqual({
      channel: "staging",
      basePath: "/",
      viteBasePath: "/",
    });
  });

  it("requires preview to be explicitly mounted beneath /preview", () => {
    expect(resolveDeploymentConfiguration({ channel: "preview", basePath: "/preview/" })).toEqual({
      channel: "preview",
      basePath: "/preview",
      viteBasePath: "/preview/",
    });
    expect(() => resolveDeploymentConfiguration({ channel: "preview" })).toThrow(
      "Preview builds require",
    );
    expect(() => resolveDeploymentConfiguration({ basePath: "/preview" })).toThrow(
      "Staging builds must use",
    );
  });

  it("keeps application navigation and absolute URLs inside the preview mount", () => {
    expect(withDeploymentBasePath("/portfolio", "/preview")).toBe("/preview/portfolio");
    expect(withDeploymentBasePath("/", "/preview")).toBe("/preview/");
    expect(withoutDeploymentBasePath("/preview/portfolio", "/preview")).toBe("/portfolio");
    expect(applicationUrl("https://staging.slice.test", "/wallet", "/preview")).toBe(
      "https://staging.slice.test/preview/wallet",
    );
  });
});
