import { describe, expect, it } from "vitest";
import type { CollectorProfile } from "@/domain";
import { collectorCategoryLabel, collectorSpecialties } from "./collector-specialties";

const profile = (focus: string): CollectorProfile => ({
  userId: "public-collector" as CollectorProfile["userId"],
  handle: "public-collector",
  displayName: "Public Collector",
  focus,
  category: "mixed",
});

describe("collectorSpecialties", () => {
  it("derives normalized customer-facing filters only from the public focus projection", () => {
    expect(
      collectorSpecialties(
        profile("Sports Cards \u00c2\u00b7 Pok\u00c3\u00a9mon \u00c2\u00b7 Sports Cards"),
      ),
    ).toEqual(["Sports Cards", "Pok\u00e9mon TCG"]);
  });

  it("does not fabricate specialties when the public projection has none", () => {
    expect(collectorSpecialties(profile("Independent public collector"))).toEqual([]);
  });

  it("uses the shared marketplace category display mapper", () => {
    expect(collectorCategoryLabel("poke-mon")).toBe("Pok\u00e9mon TCG");
    expect(collectorCategoryLabel("magic-the-gathering")).toBe("Magic: The Gathering");
    expect(collectorCategoryLabel("one-piece")).toBe("One Piece TCG");
  });
});
