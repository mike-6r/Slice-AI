import { describe, expect, it } from "vitest";
import {
  collectibleDetailTabs,
  formatCollectibleDetailState,
} from "./AdminCollectibleDetail.presentation";

describe("collectible detail dossier presentation", () => {
  it("keeps the dossier focused on records and specialist handoffs", () => {
    expect(collectibleDetailTabs).toEqual([
      "overview",
      "identity-media",
      "valuation",
      "ownership",
      "market",
      "history",
    ]);
    expect(collectibleDetailTabs).not.toContain("physical");
    expect(collectibleDetailTabs).not.toContain("issuance");
    expect(collectibleDetailTabs).not.toContain("offering");
  });

  it("renders authoritative state values without exposing raw enums", () => {
    expect(formatCollectibleDetailState("AWAITING_DROP_OFF")).toBe("Awaiting Drop Off");
    expect(formatCollectibleDetailState("MARKET_LIVE")).toBe("Market Live");
  });
});
