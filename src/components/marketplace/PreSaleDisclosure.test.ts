import { describe, expect, it } from "vitest";
import { formatPreSaleCountdown } from "./PreSaleDisclosure";

describe("Pre-Sale disclosure", () => {
  it("shows an exact day and hour countdown", () => {
    const now = Date.parse("2026-09-02T12:00:00.000Z");
    expect(formatPreSaleCountdown("2026-09-05T15:30:00.000Z", now)).toBe("3d 3h remaining");
  });

  it("does not imply that carrier delivery is Slice receipt", () => {
    expect(formatPreSaleCountdown("2026-09-02T11:59:00.000Z", Date.parse("2026-09-02T12:00:00.000Z"))).toBe("Deadline passed");
  });
});
