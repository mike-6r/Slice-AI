/**
 * Educational content for Vault Live. It explains the public lifecycle but
 * never represents an asset, event, value, or market statistic as live data.
 */
export const vaultLiveShowcase = {
  journey: [
    ["01", "Submitted", "A collector submits an asset and supporting evidence."],
    ["02", "Reviewed", "Public-ready metadata and evidence move through review."],
    ["03", "Valued", "A supported public reference valuation is established."],
    ["04", "Readiness", "The collectible moves through marketplace-readiness steps."],
    ["05", "Market live", "Eligible ownership shares become available on Slice."],
  ] as const,
} as const;
