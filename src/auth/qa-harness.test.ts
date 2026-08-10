import { describe, expect, it } from "vitest";

import { installQaHarness } from "./qa-harness";

describe("QA harness observability", () => {
  it("exposes only the safe snapshot when explicitly enabled", () => {
    const target = {} as Window;

    installQaHarness(target, true);

    expect(target.__sliceQa).toEqual({
      refreshCalls: 0,
      expiredTokenTriggered: false,
      forcedMutationFailures: 0,
      parallelGetsExecuted: false,
      rollbackEvents: 0,
    });
    expect(Object.keys(target.__sliceQa ?? {})).toEqual([
      "refreshCalls",
      "expiredTokenTriggered",
      "forcedMutationFailures",
      "parallelGetsExecuted",
      "rollbackEvents",
    ]);
  });

  it("does not install the harness when production mode disables it", () => {
    const target = {} as Window;

    installQaHarness(target, false);

    expect(target.__sliceQa).toBeUndefined();
  });
});
