import { describe, expect, it } from "vitest";
import type { CollectorProfile } from "@/domain";
import { collectorSpecialties } from "./collector-specialties";

const profile = (focus: string): CollectorProfile => ({
  userId: "public-collector" as CollectorProfile["userId"],
  handle: "public-collector",
  displayName: "Public Collector",
  focus,
  category: "mixed",
});

describe("collectorSpecialties", () => {
  it("derives filters only from the public focus projection", () => {
    expect(collectorSpecialties(profile("Sports Cards · Pokémon · Sports Cards"))).toEqual([
      "Sports Cards",
      "Pokémon",
    ]);
  });

  it("does not fabricate specialties when the public projection has none", () => {
    expect(collectorSpecialties(profile("Independent public collector"))).toEqual([]);
  });
});
