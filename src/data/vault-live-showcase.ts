/**
 * PUBLIC ILLUSTRATIVE VAULT LIVE CONTENT.
 *
 * This content explains the customer-facing Slice journey when staging has
 * limited public activity. It is not private custody data, an operational
 * authority, or a claim about a live provider workflow. Routes are resolved
 * against real public assets at render time; otherwise they fall back to the
 * public marketplace.
 */
export type VaultLiveShowcaseItem = {
  id: string;
  label: string;
  title: string;
  detail: string;
  time: string;
  publicStatus: string;
  realAssetSlug?: string;
  fallbackRoute: "/marketplace";
};

export const VAULT_LIVE_SHOWCASE_LABEL = "Vault Live showcase · illustrative public activity";

export const vaultLiveShowcase = {
  featured: {
    title: "1999 Charizard",
    subtitle: "Base Set · Holo",
    grade: "PSA 10",
    publicStatus: "Market live",
    value: "£24,580",
    ownership: "24.6% available",
    realAssetSlug: "slice-demo-charizard",
    fallbackRoute: "/marketplace" as const,
  },
  metrics: [
    { label: "Public vault events", value: "24", detail: "today" },
    { label: "Newly published", value: "6", detail: "assets" },
    { label: "Valuations updated", value: "11", detail: "today" },
    { label: "Market activity", value: "38", detail: "ownership events" },
  ],
  activity: [
    {
      id: "reviewed-charizard",
      label: "Asset reviewed",
      title: "1999 Base Set Charizard",
      detail: "Public review milestone recorded.",
      time: "Moments ago",
      publicStatus: "Reviewed",
      realAssetSlug: "slice-demo-charizard",
      fallbackRoute: "/marketplace" as const,
    },
    {
      id: "valued-jordan",
      label: "Valuation updated",
      title: "1986 Fleer Michael Jordan Rookie",
      detail: "A public reference valuation was updated.",
      time: "18 min ago",
      publicStatus: "Valued",
      realAssetSlug: "slice-demo-jordan",
      fallbackRoute: "/marketplace" as const,
    },
    {
      id: "vault-pikachu",
      label: "Entering the vault",
      title: "Pikachu Illustrator",
      detail: "Moving through public readiness milestones.",
      time: "42 min ago",
      publicStatus: "Vault preparation",
      realAssetSlug: "slice-demo-pikachu",
      fallbackRoute: "/marketplace" as const,
    },
    {
      id: "market-dark-magician",
      label: "Market live",
      title: "Dark Magician 1st Edition",
      detail: "Published to the public marketplace.",
      time: "1 hr ago",
      publicStatus: "Market live",
      realAssetSlug: "slice-demo-dark-magician",
      fallbackRoute: "/marketplace" as const,
    },
    {
      id: "ownership-blastoise",
      label: "Ownership activity",
      title: "1999 Base Set Blastoise",
      detail: "Recent public ownership activity recorded.",
      time: "2 hr ago",
      publicStatus: "Public activity",
      realAssetSlug: "slice-demo-blastoise",
      fallbackRoute: "/marketplace" as const,
    },
  ] satisfies VaultLiveShowcaseItem[],
  reviewRail: [
    "slice-demo-charizard",
    "slice-demo-jordan",
    "slice-demo-pikachu",
    "slice-demo-dark-magician",
    "slice-demo-black-lotus",
  ],
  readiness: [
    { label: "Review complete", detail: "Public collection details have moved through review." },
    { label: "Valuation complete", detail: "A supported reference value is ready to publish." },
    { label: "Ready for marketplace", detail: "Eligible assets can become discoverable on Slice." },
  ],
  marketActivity: [
    { title: "1999 Charizard", detail: "Public ownership activity", value: "12 units" },
    { title: "Jordan Rookie", detail: "Illustrative position movement", value: "8 units" },
    { title: "Dark Magician", detail: "Illustrative limit-order activity", value: "Market live" },
  ],
  journey: [
    ["01", "Submitted", "Collector submits an asset and supporting evidence."],
    ["02", "Reviewed", "Metadata, condition and evidence move through review."],
    ["03", "Valued", "A supported reference valuation is established."],
    ["04", "Vault / readiness", "The collectible moves through custody-readiness steps."],
    ["05", "Market live", "Eligible ownership units become available on Slice."],
  ] as const,
  categories: ["Pokémon", "Sports", "Yu-Gi-Oh!", "MTG", "One Piece"],
} as const;
