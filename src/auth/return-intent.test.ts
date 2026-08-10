import { describe, expect, it } from "vitest";

import { safeReturnIntent } from "./return-intent";

describe("safe return intent", () => {
  it("allows only implemented internal destinations", () => {
    expect(safeReturnIntent("/portfolio")).toBe("/portfolio");
    expect(safeReturnIntent("/wallet?tab=history")).toBe("/wallet");
  });

  it("rejects external and script-like destinations", () => {
    expect(safeReturnIntent("https://example.test")).toBe("/dashboard");
    expect(safeReturnIntent("//example.test")).toBe("/dashboard");
    expect(safeReturnIntent("javascript:alert(1)")).toBe("/dashboard");
    expect(safeReturnIntent("")).toBe("/dashboard");
  });
});
