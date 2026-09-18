import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { CollectorProfile, CollectorPublishedListing } from "@/domain";
import { CollectorDiscoveryCard, CollectorSpotlight } from "./CollectorDiscoveryCard";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    ...props
  }: {
    children: ReactNode;
    to: string;
    params: { id: string };
  }) => (
    <a href={to.replace("$id", params.id)} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/currency/CurrencyProvider", () => ({
  useCurrency: () => ({
    formatMoney: (value: string | number) => `GBP ${(Number(value) / 100).toFixed(2)}`,
  }),
}));
const listing = {
  assetId: "asset-1",
  slug: "published-card",
  title: "Published card",
  category: "pokemon",
  grade: "PSA 10",
  marketPricePerSlice: { amount: 420, currency: "GBP" },
  estimatedMarketValue: { amount: 120000, currency: "GBP" },
} as CollectorPublishedListing;
const collector = {
  userId: "collector-1",
  handle: "north-star",
  displayName: "North Star",
  focus: "Pokémon cards with a story.",
  category: "tcg",
  specialties: ["pokemon"],
  publishedListingCount: 40,
  liveListingCount: 39,
  preSaleListingCount: 1,
  publishedListings: [listing],
  isFeatured: false,
} as CollectorProfile;

describe("collector discovery presentation", () => {
  it("uses aggregate public counts rather than the preview count", () => {
    const html = renderToStaticMarkup(<CollectorDiscoveryCard collector={collector} />);
    expect(html).toContain("40");
    expect(html).toContain("1 of 40");
    expect(html).toContain("Pokémon cards with a story.");
    expect(html).toContain('href="/collector/north-star"');
    expect(html).toContain('href="/collector/north-star/assets"');
    expect(html).toContain('href="/asset/published-card"');
    expect(html).not.toContain("Featured");
  });
  it("does not label total asset values as per-Slice prices", () => {
    const html = renderToStaticMarkup(
      <CollectorDiscoveryCard
        collector={{
          ...collector,
          publishedListings: [{ ...listing, marketPricePerSlice: undefined }],
        }}
      />,
    );
    expect(html).not.toContain("Per Slice");
    expect(html).not.toContain("1200.00");
    expect(html).toContain("Explore asset");
  });
  it("shows a per-Slice price only from its authoritative field", () => {
    const html = renderToStaticMarkup(<CollectorDiscoveryCard collector={collector} />);
    expect(html).toContain("Per Slice");
    expect(html).toContain("GBP 4.20");
  });
  it("does not invent previews, verifications or collector endorsements", () => {
    const html = renderToStaticMarkup(
      <CollectorDiscoveryCard collector={{ ...collector, publishedListings: [] }} />,
    );
    expect(html).toContain("Preview unavailable");
    expect(html).not.toContain("Verified");
    expect(html).not.toContain("PSA 10");
    expect(html).not.toContain("Featured");
  });
  it("has honest missing-media and featured states", () => {
    const html = renderToStaticMarkup(
      <CollectorDiscoveryCard collector={{ ...collector, isFeatured: true }} />,
    );
    expect(html).toContain("Featured");
    expect(html).toContain("Image unavailable");
  });
  it("provides a quiet empty hero without a fabricated collection", () => {
    const html = renderToStaticMarkup(<CollectorSpotlight loading={false} />);
    expect(html).toContain("Every collection starts with a story.");
    expect(html).not.toContain("View collector");
    expect(html).not.toContain("Demo");
  });
  it("keeps demonstration assets labelled in the hero as well as the directory", () => {
    const demoCollector = {
      ...collector,
      publishedListings: [{ ...listing, dataStatus: "DEMO" as const }],
    };
    expect(
      renderToStaticMarkup(<CollectorSpotlight collector={demoCollector} loading={false} />),
    ).toContain('class="cn-demo-label">Demo');
    expect(renderToStaticMarkup(<CollectorDiscoveryCard collector={demoCollector} />)).toContain(
      'class="cn-demo-label">Demo',
    );
  });
});
