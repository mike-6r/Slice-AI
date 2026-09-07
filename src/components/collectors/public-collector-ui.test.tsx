import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CollectorProfile, CollectorPublishedListing } from "@/domain";
import { minorUnits, type ISODateTime } from "@/domain/common";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a className={className}>{children}</a>
  ),
}));

vi.mock("@/currency/CurrencyProvider", () => ({
  useCurrency: () => ({
    formatMoney: (amount: number | string, currency = "GBP") =>
      `${currency} ${(Number(amount) / 100).toFixed(2)}`,
  }),
}));

vi.mock("@/components/marketplace/PreSaleDisclosure", () => ({
  formatPreSaleCountdown: () => "12d 3h remaining",
}));

import { CollectorCard } from "./public-collector-ui";

const preSaleListing: CollectorPublishedListing = {
  assetId: "umbreon" as CollectorPublishedListing["assetId"],
  slug: "umbreon-ex-161",
  title: "Umbreon ex #161",
  category: "pokemon",
  year: 2024,
  variant: "Prismatic Evolutions",
  grade: "PSA 10",
  media: [{ id: "front", slot: "FRONT", url: "https://cdn.example/umbreon.webp", alt: "Umbreon" }],
  preSale: {
    status: "ACTIVE",
    physicalStatus: "AWAITING_INTAKE",
    pricePerUnitMinor: "42",
    currency: "GBP",
    offeredUnits: "10000",
    reservedUnits: "0",
    availableUnits: "10000",
    reservedPercentageBps: 0,
    sliceOwnershipPercentageBps: 1,
    deadlineAt: "2030-01-01T12:00:00.000Z" as ISODateTime,
  },
};

const liveListing: CollectorPublishedListing = {
  assetId: "ohtani" as CollectorPublishedListing["assetId"],
  slug: "shohei-ohtani-aa",
  title: "Shohei Ohtani Aa",
  category: "baseball",
  year: 2018,
  grade: "BGS 9.5",
  estimatedMarketValue: { amount: minorUnits(1_848_839), currency: "GBP" },
};

const collector: CollectorProfile = {
  userId: "slice-demo" as CollectorProfile["userId"],
  handle: "slice-demo-collector",
  displayName: "Slice Demo Collector",
  focus: "A carefully selected public catalogue.",
  specialties: ["pokemon", "baseball"],
  categories: ["pokemon", "baseball"],
  category: "mixed",
  publicSince: "2026-01-01T00:00:00.000Z" as ISODateTime,
  isFeatured: true,
  publishedListingCount: 3,
  preSaleListingCount: 1,
  liveListingCount: 2,
  publishedListings: [preSaleListing, liveListing],
  activity: [
    {
      id: "presale",
      type: "PRE_SALE",
      title: "Umbreon ex #161 entered Pre-Sale",
      detail: "2024 · Prismatic Evolutions",
      occurredAt: "2026-09-01T00:00:00.000Z" as ISODateTime,
      assetSlug: "umbreon-ex-161",
    },
  ],
};

describe("CollectorCard", () => {
  it("uses the public catalogue projection for its storefront summary and previews", () => {
    const html = renderToStaticMarkup(<CollectorCard collector={collector} />);

    expect(html).toContain("Active Collector");
    expect(html).toContain("Collector since 2026");
    expect(html).toContain("Published");
    expect(html).toContain("Pre-Sale");
    expect(html).toContain("Market Live");
    expect(html).toContain("Categories");
    expect(html).toContain("Recent public activity");
    expect(html).toContain("Price per Slice");
    expect(html).toContain("GBP 0.42");
    expect(html).toContain("0.01%");
    expect(html).toContain("10000 available");
    expect(html).toContain("12d 3h remaining");
    expect(html).toContain("Market reference");
    expect(html).toContain("GBP 18488.39");
    expect(html).toContain("View Collector");
    expect(html).toContain("View all 3 assets");
    expect(html).toContain("+1 more assets");
    expect(html).not.toContain("active listings");
  });
});
