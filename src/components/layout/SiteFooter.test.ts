import { describe, expect, it } from "vitest";

import { FOOTER_ROUTE_AUDIT } from "./SiteFooter";

describe("global footer route audit", () => {
  it("keeps every rendered footer destination on an implemented first-party route", () => {
    expect(FOOTER_ROUTE_AUDIT).toEqual({
      markets: [{ label: "All Assets", to: "/marketplace" }],
      collectors: [{ label: "Collectors", to: "/collectors" }],
      company: [
        { label: "About Slice", to: "/about" },
        { label: "How It Works", to: "/how-it-works" },
        { label: "Security", to: "/security" },
      ],
      support: [
        { label: "Help Centre", to: "/help" },
        { label: "Fees", to: "/fees" },
      ],
    });
  });

  it("omits unsupported social, newsletter, legal, status, and market-data claims", () => {
    const labels = Object.values(FOOTER_ROUTE_AUDIT)
      .flat()
      .map((link) => link.label);

    expect(labels).not.toEqual(
      expect.arrayContaining([
        "Trending",
        "New Listings",
        "Top Gainers",
        "Most Watched",
        "Leaderboard",
        "Following",
        "Verified Collectors",
        "Blog",
        "Careers",
        "Platform Status",
      ]),
    );
  });
});
