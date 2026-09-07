import { describe, expect, it } from "vitest";

import {
  actionOwnerLabel,
  adminActionRequired,
  guidanceActorFromAuthority,
  guidanceStepState,
} from "./OperationalGuidance";

describe("operational guidance presentation", () => {
  it.each([
    ["clean auto-qualified submission", "SYSTEM", "Automated system", false],
    ["human review exception", "STAFF", "Slice staff", true],
    ["collector action required", "COLLECTOR", "Collector", false],
    ["hard blocked submission", "STAFF", "Slice staff", true],
    ["pre-sale configured but not launched", "STAFF", "Slice staff", true],
    ["pre-sale live awaiting shipment", "COLLECTOR", "Collector", false],
    ["carrier delivered awaiting receipt", "STAFF", "Slice staff", true],
    ["receipt confirmed verification pending", "STAFF", "Slice staff", true],
    ["verification complete custody pending", "STAFF", "Slice staff", true],
    ["custody complete ownership finalization", "STAFF", "Slice staff", true],
    ["ownership finalized market launch", "STAFF", "Slice staff", true],
    ["market live", "NONE", "No action required", false],
    ["failed finance payout", "STAFF", "Slice staff", true],
    ["clearing deposit", "PROVIDER", "External provider", false],
    ["account restriction", "STAFF", "Slice staff", true],
    ["external actor no action", "NONE", "No action required", false],
  ])("keeps %s owned by the authoritative next actor", (_scenario, authority, label, needed) => {
    const actor = guidanceActorFromAuthority(
      authority as "COLLECTOR" | "NONE" | "PROVIDER" | "STAFF" | "SYSTEM",
    );
    expect(actionOwnerLabel(actor)).toBe(label);
    expect(adminActionRequired(actor)).toBe(needed);
  });

  it("normalizes server lifecycle states without creating new workflow states", () => {
    expect(guidanceStepState("LIVE")).toBe("COMPLETE");
    expect(guidanceStepState("READY")).toBe("COMPLETE");
    expect(guidanceStepState("IN_PROGRESS")).toBe("CURRENT");
    expect(guidanceStepState("BLOCKED")).toBe("BLOCKED");
    expect(guidanceStepState("WAITING")).toBe("WAITING");
  });
});
