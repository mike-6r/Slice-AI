import { describe, expect, it } from "vitest";

import { safeReturnIntent } from "./return-intent";

describe("safe return intent", () => {
  it("allows only implemented internal destinations", () => {
    expect(safeReturnIntent("/portfolio")).toBe("/portfolio");
    expect(safeReturnIntent("/wallet?tab=history")).toBe("/wallet");
    expect(safeReturnIntent("/list")).toBe("/list");
  });

  it("rejects external and script-like destinations", () => {
    expect(safeReturnIntent("https://example.test")).toBe("/portfolio");
    expect(safeReturnIntent("//example.test")).toBe("/portfolio");
    expect(safeReturnIntent("javascript:alert(1)")).toBe("/portfolio");
    expect(safeReturnIntent("")).toBe("/portfolio");
  });
});
