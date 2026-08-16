import { describe, expect, it } from "vitest";

import {
  PRIVATE_NAV,
  PUBLIC_NAV,
  SLICE_LOGO_ASSET,
  primaryNavigationFor,
} from "./navigation-model";

describe("public and private navigation", () => {
  it("keeps public discovery routes visible while logged out", () => {
    expect(primaryNavigationFor(false)).toEqual(PUBLIC_NAV);
    expect(primaryNavigationFor(false).map((item) => item.label)).toEqual([
      "Home",
      "Markets",
      "Collectors",
    ]);
  });

  it("adds private account routes only after authentication", () => {
    expect(primaryNavigationFor(true)).toEqual([...PUBLIC_NAV, ...PRIVATE_NAV]);
    expect(primaryNavigationFor(false).map((item) => item.label)).not.toContain("Portfolio");
    expect(primaryNavigationFor(false).map((item) => item.label)).not.toContain("Governance");
    expect(primaryNavigationFor(false).map((item) => item.label)).not.toContain("Orders");
    expect(primaryNavigationFor(true).map((item) => item.label)).not.toContain("Account");
  });

  it("keeps the logo source behind one replacement seam", () => {
    expect(SLICE_LOGO_ASSET).toBe("/favicon.png");
  });
});
