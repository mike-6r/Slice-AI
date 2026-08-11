import { describe, expect, it } from "vitest";
import { vaultLiveShowcase } from "./vault-live-showcase";

describe("Vault Live educational content", () => {
  it("contains only the customer-safe lifecycle explainer", () => {
    expect(vaultLiveShowcase.journey.map(([, title]) => title)).toEqual([
      "Submitted",
      "Reviewed",
      "Valued",
      "Readiness",
      "Market live",
    ]);
  });
});
