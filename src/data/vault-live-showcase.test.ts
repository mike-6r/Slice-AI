import { describe, expect, it } from "vitest";
import { vaultLiveShowcase, VAULT_LIVE_SHOWCASE_LABEL } from "./vault-live-showcase";

describe("vault live public illustrative content", () => {
  it("labels static activity and supplies only the public marketplace fallback route", () => {
    expect(VAULT_LIVE_SHOWCASE_LABEL).toContain("illustrative public activity");
    expect(vaultLiveShowcase.activity).toHaveLength(5);
    expect(
      vaultLiveShowcase.activity.every((event) => event.fallbackRoute === "/marketplace"),
    ).toBe(true);
  });

  it("contains no private custody, account, provider, or compliance material", () => {
    const publicContent = JSON.stringify(vaultLiveShowcase).toLowerCase();
    for (const forbidden of [
      "@",
      "email",
      "phone",
      "wallet",
      "bank",
      "provider",
      "address",
      "tracking",
      "compliance",
      "kyc",
      "kyt",
      "internal note",
      "private evidence",
      "assignment",
    ]) {
      expect(publicContent).not.toContain(forbidden);
    }
  });
});
