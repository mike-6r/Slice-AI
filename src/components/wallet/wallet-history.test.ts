import { describe, expect, it } from "vitest";
import {
  movementHistoryQuery,
  movementPageCsv,
  movementStatusLabel,
  type MovementHistoryFilters,
} from "./wallet-history";
import type { WalletMovementView } from "@/domain";

const filters: MovementHistoryFilters = {
  type: "ALL",
  status: "ALL",
  search: "",
  from: "",
  to: "",
};
describe("Wallet movement history", () => {
  it("omits inactive filters and sends the chosen page size", () => {
    expect(movementHistoryQuery(filters, 10)).toEqual({ limit: 10 });
  });
  it("sends all filters and a cursor to the API, with inclusive UTC dates", () => {
    expect(
      movementHistoryQuery(
        {
          type: "DEPOSIT",
          status: "SETTLED",
          search: " WLT-1234 ",
          from: "2026-09-01",
          to: "2026-09-18",
        },
        25,
        "cursor-1",
      ),
    ).toEqual({
      limit: 25,
      cursor: "cursor-1",
      type: "DEPOSIT",
      status: "SETTLED",
      search: "WLT-1234",
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-18T23:59:59.999Z",
    });
  });
  it("does not mark pending or held movements as completed", () => {
    expect(movementStatusLabel("SETTLED")).toBe("Completed");
    expect(movementStatusLabel("PENDING_PROVIDER")).toBe("Awaiting provider");
    expect(movementStatusLabel("HELD")).toBe("On hold");
  });
  it("exports only safe fields and exact GBP values beyond Number precision", () => {
    const item = {
      id: "abcdefgh-private-id",
      type: "DEPOSIT",
      status: "SETTLED",
      amountMinor: "9007199254740993",
      currency: "GBP",
      sourceLabel: '=HYPERLINK("unsafe")',
      createdAt: "2026-09-18T00:00:00.000Z",
      updatedAt: "2026-09-18T00:00:00.000Z",
      replayed: false,
      provider: { name: "stripe", reference: "provider-private-reference", status: "paid" },
    } as WalletMovementView;
    const csv = movementPageCsv([item]);
    expect(csv).toContain('"90071992547409.93"');
    expect(csv).toContain('"WLT-ABCDEFGH"');
    expect(csv).toContain('"\'=HYPERLINK(""unsafe"")"');
    expect(csv).not.toContain("private");
    expect(csv).not.toContain("stripe");
  });
  it("can export an empty page as a header without fabricating transactions", () => {
    expect(movementPageCsv([]).split("\r\n")).toHaveLength(1);
  });
});
