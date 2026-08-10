import { describe, expect, it } from "vitest";

import {
  ACCOUNT_UNAVAILABLE,
  accountStatusLabel,
  complianceLabel,
  initialsFor,
  memberSinceLabel,
} from "./-account-presentation";

describe("account presentation", () => {
  it("formats authoritative statuses and profile initials", () => {
    expect(accountStatusLabel("PENDING_REVIEW")).toBe("Pending Review");
    expect(complianceLabel("APPROVED")).toBe("Verified");
    expect(initialsFor("Slice Collector", "collector@example.test")).toBe("SC");
    expect(memberSinceLabel("2026-06-12T00:00:00.000Z")).toBe("12 Jun 2026");
  });

  it("keeps unsupported account authorities explicitly unavailable", () => {
    expect(ACCOUNT_UNAVAILABLE.twoFactor).toContain("not exposed");
    expect(ACCOUNT_UNAVAILABLE.dataExport).toContain("not available");
  });
});
