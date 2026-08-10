import jordanImg from "@/assets/jordan.jpg";
import mtgImg from "@/assets/mtg.jpg";
import onepieceImg from "@/assets/onepiece.jpg";
import charizardImg from "@/assets/charizard.jpg";
import pikachuImg from "@/assets/pikachu.jpg";
import boosterImg from "@/assets/booster.jpg";
import charizardSlabImg from "@/assets/charizard-slab.jpg";

export type MarketCategoryIcon =
  | "pokemon"
  | "basketball"
  | "baseball"
  | "football"
  | "magic"
  | "yugioh"
  | "one-piece"
  | "lorcana"
  | "dragon-ball"
  | "marvel"
  | "star-wars"
  | "sealed"
  | "other";

export type MarketGradingCompany = "PSA" | "BGS" | "CGC" | "SGC" | "TAG" | "ACE" | "Other";
export type MarketPresentationProfile =
  "graded-slab" | "raw-card" | "sealed-product" | "memorabilia";
export type MarketLightingProfile =
  "emerald" | "silver" | "violet" | "teal" | "blue" | "crimson" | "amber" | "graphite";
export type MarketStatusTone = "green" | "blue" | "purple" | "orange" | "red";
export type MarketAssetStatus = {
  label: string;
  tone: MarketStatusTone;
};

export type Asset = {
  id: string;
  symbol: string;
  name: string;
  category: string;
  categoryIcon: MarketCategoryIcon;
  grade: string;
  gradingCompany: MarketGradingCompany | null;
  gradeValue: string | null;
  condition: string;
  presentationProfile: MarketPresentationProfile;
  lightingProfile: MarketLightingProfile;
  status: MarketAssetStatus;
  cert: string;
  price: number;
  /** Estimated market value of the whole physical collectible, in whole pounds. */
  marketValue: number;
  /** Most recent verified whole-asset sale, in whole pounds. */
  lastSale: number;
  /** Whole category market capitalisation, in whole pounds. */
  marketCap: number;
  /** Units represented by the ownership position. */
  ownedUnits: number;
  /** Percentage represented by the ownership progress bar. */
  ownershipPercent: number;
  /** Short title for the hero panel, where the full catalogue name is too long. */
  shortName?: string;
  /** Set/variant label for the hero panel. Falls back to `category`. */
  setLabel?: string;
  change: number;
  confidence: number;
  available: number; // % ownership available
  owners: number;
  vaultStatus: string;
  insured: string;
  originalOwner: string;
  ownerRetains: number;
  img: string;
  /** Optional marketplace-specific composition while preserving the canonical asset image. */
  presentationImage?: string;
  spark: number[];
  chart: number[]; // 90 point series
  aiScore: number;
  risk: "Low" | "Medium" | "High";
  aiInsight: string;
  views: number;
  watching: number;
  addedDaysAgo: number;
  investmentType: "Whole" | "Fractional";
};

type AssetSeed = Omit<
  Asset,
  | "categoryIcon"
  | "gradingCompany"
  | "gradeValue"
  | "condition"
  | "presentationProfile"
  | "lightingProfile"
  | "status"
  | "lastSale"
  | "marketCap"
  | "ownedUnits"
  | "ownershipPercent"
> &
  Partial<Pick<Asset, "status" | "lastSale" | "marketCap" | "ownedUnits" | "ownershipPercent">>;

const MARKET_STATUSES: Record<string, MarketAssetStatus> = {
  "chz-10": { label: "Trending", tone: "green" },
  "lot-mtg": { label: "Editor's Pick", tone: "purple" },
  "jrd-rc": { label: "Rising Fast", tone: "green" },
  "pik-il": { label: "Most Watched", tone: "blue" },
  "luf-op": { label: "New Listing", tone: "green" },
  "bst-pk": { label: "Hot", tone: "red" },
};

const FALLBACK_MARKET_STATUSES: MarketAssetStatus[] = [
  { label: "Blue Chip", tone: "blue" },
  { label: "Trending", tone: "orange" },
  { label: "New Listing", tone: "green" },
  { label: "Rare Find", tone: "purple" },
];

const categoryPresentation = (
  category: string,
): Pick<Asset, "categoryIcon" | "lightingProfile"> => {
  const normalized = category.toLowerCase();
  if (normalized.includes("pok")) return { categoryIcon: "pokemon", lightingProfile: "emerald" };
  if (normalized.includes("basketball"))
    return { categoryIcon: "basketball", lightingProfile: "silver" };
  if (normalized.includes("baseball"))
    return { categoryIcon: "baseball", lightingProfile: "silver" };
  if (normalized.includes("football"))
    return { categoryIcon: "football", lightingProfile: "silver" };
  if (normalized.includes("magic")) return { categoryIcon: "magic", lightingProfile: "violet" };
  if (normalized.includes("yu-gi-oh")) return { categoryIcon: "yugioh", lightingProfile: "violet" };
  if (normalized.includes("one piece"))
    return { categoryIcon: "one-piece", lightingProfile: "teal" };
  if (normalized.includes("lorcana")) return { categoryIcon: "lorcana", lightingProfile: "blue" };
  if (normalized.includes("dragon ball"))
    return { categoryIcon: "dragon-ball", lightingProfile: "amber" };
  if (normalized.includes("marvel")) return { categoryIcon: "marvel", lightingProfile: "crimson" };
  if (normalized.includes("star wars"))
    return { categoryIcon: "star-wars", lightingProfile: "blue" };
  if (normalized.includes("sealed")) return { categoryIcon: "sealed", lightingProfile: "graphite" };
  return { categoryIcon: "other", lightingProfile: "graphite" };
};

const normalizeAssetPresentation = (asset: AssetSeed, index: number): Asset => {
  const [gradeIdentity = "Raw", rawCondition = "Unspecified"] = asset.grade.split(
    /\s*(?:\u00c2?\u00b7|\u2022)\s*/,
  );
  const conditionAliases: Record<string, string> = {
    NM: "Near Mint",
    "NM-MT": "Near Mint-Mint",
  };
  const condition = conditionAliases[rawCondition] ?? rawCondition;
  const gradeMatch = gradeIdentity.match(/^(PSA|BGS|CGC|SGC|TAG|ACE|Other)\s+(.+)$/i);
  const gradingCompany = gradeMatch
    ? ((gradeMatch[1].toUpperCase() === "OTHER"
        ? "Other"
        : gradeMatch[1].toUpperCase()) as MarketGradingCompany)
    : null;
  const presentationProfile: MarketPresentationProfile = asset.category
    .toLowerCase()
    .includes("sealed")
    ? "sealed-product"
    : asset.category.toLowerCase().includes("memorabilia")
      ? "memorabilia"
      : gradingCompany
        ? "graded-slab"
        : "raw-card";

  return {
    ...asset,
    ...categoryPresentation(asset.category),
    status:
      asset.status ??
      MARKET_STATUSES[asset.id] ??
      FALLBACK_MARKET_STATUSES[index % FALLBACK_MARKET_STATUSES.length],
    lastSale: asset.lastSale ?? asset.marketValue * (0.965 + (asset.id.length % 3) * 0.008),
    marketCap: asset.marketCap ?? asset.marketValue * Math.max(asset.owners, 72),
    ownedUnits: asset.ownedUnits ?? Math.max(asset.owners, Math.round(asset.owners * 10)),
    ownershipPercent: asset.ownershipPercent ?? asset.available,
    gradingCompany,
    gradeValue: gradeMatch?.[2] ?? null,
    condition,
    presentationProfile,
  };
};

// price series generator
const series = (start: number, end: number, n = 90, volatility = 0.03) => {
  const out: number[] = [];
  const drift = (end - start) / n;
  let v = start;
  for (let i = 0; i < n; i++) {
    v += drift + (Math.sin(i * 0.6) + Math.cos(i * 0.31)) * start * volatility * 0.15;
    out.push(Math.max(1, v));
  }
  out[n - 1] = end;
  return out;
};

export const CATEGORIES = [
  "Pokémon TCG",
  "Sports · Basketball",
  "Sports · Football",
  "Sports · Baseball",
  "Magic: The Gathering",
  "One Piece TCG",
  "Yu-Gi-Oh",
  "Disney Lorcana",
  "Dragon Ball",
  "Marvel Cards",
  "Star Wars",
  "Sealed Product",
] as const;

export const VALUE_BANDS = [
  { label: "Under £100", min: 0, max: 100 },
  { label: "£100–£500", min: 100, max: 500 },
  { label: "£500–£1,000", min: 500, max: 1000 },
  { label: "£1,000–£5,000", min: 1000, max: 5000 },
  { label: "£5,000+", min: 5000, max: Infinity },
] as const;

const ASSET_SEEDS: AssetSeed[] = [
  {
    id: "chz-10",
    symbol: "CHZ.10",
    name: "1999 Pokémon Base Set Charizard",
    category: "Pokémon TCG",
    grade: "PSA 10 · Gem Mint",
    cert: "PSA #58291042",
    price: 598,
    marketValue: 24580,
    lastSale: 23720,
    marketCap: 20370000,
    ownedUnits: 7690,
    ownershipPercent: 24.61,
    shortName: "1999 Charizard",
    setLabel: "Base Set · Holo",
    change: 12.43,
    confidence: 92,
    available: 24.61,
    owners: 1250,
    vaultStatus: "Brinks London Vault 7",
    insured: "Lloyd's of London · £15,000",
    originalOwner: "M. Reynolds",
    ownerRetains: 60,
    img: charizardImg,
    presentationImage: charizardSlabImg,
    spark: [40, 42, 38, 55, 50, 62, 70, 68, 82, 90],
    chart: series(420, 598, 90, 0.04),
    aiScore: 92,
    risk: "Low",
    aiInsight:
      "Up 22% over the last 12 months. Limited PSA 10 population (121 total), rising retail collector demand and three verified sales above £580 in the last 30 days support continued upside.",
    views: 12480,
    watching: 342,
    addedDaysAgo: 42,
    investmentType: "Fractional",
  },
  {
    id: "jrd-rc",
    symbol: "JRD.RC",
    name: "1986 Fleer Michael Jordan Rookie",
    category: "Sports · Basketball",
    grade: "PSA 8 · NM-MT",
    cert: "PSA #41029711",
    price: 682,
    marketValue: 8420,
    change: 4.2,
    confidence: 96,
    available: 31.2,
    owners: 18,
    vaultStatus: "Brinks London Vault 4",
    insured: "Lloyd's of London · £12,000",
    originalOwner: "T. Ahmed",
    ownerRetains: 65,
    img: jordanImg,
    spark: [40, 42, 38, 55, 50, 62, 70, 68, 82, 90],
    chart: series(600, 682, 90, 0.025),
    aiScore: 88,
    risk: "Low",
    aiInsight:
      "Blue-chip vintage sports card with deep liquidity. Steady 4% appreciation reflects wide investor base and low volatility — a portfolio stabiliser rather than a growth play.",
    views: 9840,
    watching: 218,
    addedDaysAgo: 61,
    investmentType: "Fractional",
  },
  {
    id: "lot-mtg",
    symbol: "LOT.MTG",
    name: "MTG Unlimited Black Lotus",
    category: "Magic: The Gathering",
    grade: "BGS 7 · Near Mint",
    cert: "BGS #0000122841",
    price: 745,
    marketValue: 15480,
    change: 2.8,
    confidence: 92,
    available: 14.3,
    owners: 12,
    vaultStatus: "Brinks London Vault 2",
    insured: "Lloyd's of London · £14,000",
    originalOwner: "J. Okafor",
    ownerRetains: 70,
    img: mtgImg,
    spark: [60, 62, 65, 61, 68, 70, 69, 74, 76, 78],
    chart: series(690, 745, 90, 0.02),
    aiScore: 90,
    risk: "Low",
    aiInsight:
      "The reserved list constrains supply permanently. Investor demand is concentrated but sticky — expect low volume, steady price discovery.",
    views: 15200,
    watching: 411,
    addedDaysAgo: 88,
    investmentType: "Fractional",
  },
  {
    id: "luf-op",
    symbol: "LUF.OP",
    name: "One Piece Monkey D. Luffy Parallel",
    category: "One Piece TCG",
    grade: "CGC 9.5 · Mint+",
    cert: "CGC #4400118",
    price: 412,
    marketValue: 1850,
    change: -1.2,
    confidence: 88,
    available: 40,
    owners: 22,
    vaultStatus: "Brinks London Vault 7",
    insured: "Lloyd's of London · £8,000",
    originalOwner: "S. Bennett",
    ownerRetains: 55,
    img: onepieceImg,
    spark: [50, 52, 48, 46, 44, 45, 43, 42, 41, 41],
    chart: series(450, 412, 90, 0.03),
    aiScore: 71,
    risk: "High",
    aiInsight:
      "Down 9% on wider modern TCG supply expansion. Emerging franchise with high investor turnover — high upside, high volatility.",
    views: 7220,
    watching: 189,
    addedDaysAgo: 14,
    investmentType: "Fractional",
  },
  {
    id: "pik-il",
    symbol: "PIK.IL",
    name: "Pikachu Illustrator Reprint",
    category: "Pokémon TCG",
    grade: "PSA 9 · Mint",
    cert: "PSA #58210022",
    price: 520,
    marketValue: 12750,
    change: 6.31,
    confidence: 90,
    available: 18.7,
    owners: 15,
    vaultStatus: "Brinks London Vault 3",
    insured: "Lloyd's of London · £10,000",
    originalOwner: "K. Larsen",
    ownerRetains: 62,
    img: pikachuImg,
    spark: [45, 46, 50, 48, 52, 55, 53, 57, 60, 62],
    chart: series(480, 520, 90, 0.025),
    aiScore: 84,
    risk: "Medium",
    aiInsight:
      "Iconic subject drives collector demand independent of grade population. Momentum supported by recent auction comps within 4% of Slice Market Price.",
    views: 8140,
    watching: 264,
    addedDaysAgo: 22,
    investmentType: "Fractional",
  },
  {
    id: "bst-pk",
    symbol: "BST.PK",
    name: "Sealed WOTC Base Set Booster",
    category: "Sealed Product",
    grade: "CGC 9.8 · Pristine",
    cert: "CGC #4400091",
    price: 640,
    marketValue: 3200,
    change: 5.1,
    confidence: 91,
    available: 15,
    owners: 8,
    vaultStatus: "Brinks London Vault 1",
    insured: "Lloyd's of London · £13,000",
    originalOwner: "R. Patel",
    ownerRetains: 75,
    img: boosterImg,
    spark: [55, 58, 60, 59, 63, 65, 66, 68, 70, 74],
    chart: series(580, 640, 90, 0.025),
    aiScore: 86,
    risk: "Medium",
    aiInsight:
      "Sealed vintage product benefits from irreversible supply reduction as packs are opened globally. Long-duration hold profile.",
    views: 6910,
    watching: 152,
    addedDaysAgo: 33,
    investmentType: "Fractional",
  },
  // Entry-level assets under £100
  {
    id: "yg-drk",
    symbol: "YG.DRK",
    name: "Yu-Gi-Oh Dark Magician 1st Edition",
    category: "Yu-Gi-Oh",
    grade: "PSA 8 · NM-MT",
    cert: "PSA #77201884",
    price: 68,
    marketValue: 3820,
    change: 5.22,
    confidence: 82,
    available: 45,
    owners: 31,
    vaultStatus: "Brinks London Vault 5",
    insured: "Lloyd's of London · £1,500",
    originalOwner: "H. Tanaka",
    ownerRetains: 55,
    img: mtgImg,
    spark: [40, 42, 45, 48, 52, 55, 58, 60, 65, 68],
    chart: series(58, 68, 90, 0.035),
    aiScore: 78,
    risk: "Medium",
    aiInsight:
      "Entry-level nostalgia play. Steady inflows from returning millennial collectors driving 6% quarterly appreciation.",
    views: 4210,
    watching: 118,
    addedDaysAgo: 8,
    investmentType: "Fractional",
  },
  {
    id: "lor-arl",
    symbol: "LOR.ARL",
    name: "Lorcana Ariel Enchanted",
    category: "Disney Lorcana",
    grade: "PSA 10 · Gem Mint",
    cert: "PSA #99012341",
    price: 145,
    marketValue: 290,
    change: 9.8,
    confidence: 79,
    available: 50,
    owners: 26,
    vaultStatus: "Brinks London Vault 6",
    insured: "Lloyd's of London · £3,000",
    originalOwner: "S. Bennett",
    ownerRetains: 50,
    img: onepieceImg,
    spark: [70, 72, 78, 82, 88, 92, 96, 108, 130, 145],
    chart: series(110, 145, 90, 0.05),
    aiScore: 74,
    risk: "High",
    aiInsight:
      "Modern release with rising secondary demand. High volatility — appropriate for smaller, satellite positions.",
    views: 5820,
    watching: 197,
    addedDaysAgo: 5,
    investmentType: "Fractional",
  },
  {
    id: "dbz-goku",
    symbol: "DBZ.GK",
    name: "Dragon Ball Z Super Saiyan Goku",
    category: "Dragon Ball",
    grade: "CGC 9 · Mint",
    cert: "CGC #4400551",
    price: 89,
    marketValue: 445,
    change: -0.8,
    confidence: 80,
    available: 40,
    owners: 19,
    vaultStatus: "Brinks London Vault 5",
    insured: "Lloyd's of London · £2,000",
    originalOwner: "K. Nakamura",
    ownerRetains: 60,
    img: onepieceImg,
    spark: [70, 72, 74, 76, 78, 80, 82, 84, 86, 89],
    chart: series(80, 89, 90, 0.02),
    aiScore: 76,
    risk: "Medium",
    aiInsight:
      "Franchise renaissance driving steady collector interest. Low ticket, high engagement.",
    views: 3420,
    watching: 87,
    addedDaysAgo: 19,
    investmentType: "Fractional",
  },
  {
    id: "sw-vader",
    symbol: "SW.VAD",
    name: "Star Wars Darth Vader Topps 1977",
    category: "Star Wars",
    grade: "PSA 7 · NM",
    cert: "PSA #63481290",
    price: 42,
    marketValue: 210,
    change: -2.4,
    confidence: 85,
    available: 60,
    owners: 44,
    vaultStatus: "Brinks London Vault 5",
    insured: "Lloyd's of London · £900",
    originalOwner: "D. Wexler",
    ownerRetains: 40,
    img: charizardImg,
    spark: [35, 36, 37, 38, 39, 40, 40, 41, 42, 42],
    chart: series(38, 42, 90, 0.015),
    aiScore: 71,
    risk: "Low",
    aiInsight: "Vintage entertainment IP with stable long-term demand. Ideal starter position.",
    views: 2810,
    watching: 62,
    addedDaysAgo: 27,
    investmentType: "Fractional",
  },
  {
    id: "mvl-hulk",
    symbol: "MVL.HK",
    name: "Marvel Hulk #181 Cover Card",
    category: "Marvel Cards",
    grade: "CGC 9.5 · Mint+",
    cert: "CGC #4401299",
    price: 210,
    marketValue: 1050,
    change: -1.6,
    confidence: 83,
    available: 35,
    owners: 21,
    vaultStatus: "Brinks London Vault 6",
    insured: "Lloyd's of London · £4,500",
    originalOwner: "A. Ives",
    ownerRetains: 55,
    img: charizardImg,
    spark: [180, 185, 190, 195, 200, 202, 205, 208, 210, 210],
    chart: series(190, 210, 90, 0.02),
    aiScore: 80,
    risk: "Medium",
    aiInsight: "First-appearance IP crossover with comic collectors provides two demand pools.",
    views: 4640,
    watching: 129,
    addedDaysAgo: 12,
    investmentType: "Fractional",
  },
  {
    id: "bst-bls",
    symbol: "BST.BLS",
    name: "1999 Pokémon Base Set Blastoise",
    category: "Pokémon TCG",
    grade: "PSA 9 · Mint",
    cert: "PSA #58291055",
    price: 465,
    marketValue: 6320,
    change: 7.64,
    confidence: 90,
    available: 28.1,
    owners: 19,
    vaultStatus: "Brinks London Vault 3",
    insured: "Lloyd's of London · £9,000",
    originalOwner: "C. Morgan",
    ownerRetains: 62,
    img: charizardImg,
    spark: [410, 420, 425, 430, 435, 440, 445, 450, 458, 465],
    chart: series(400, 465, 90, 0.03),
    aiScore: 85,
    risk: "Medium",
    aiInsight:
      "Base Set Blastoise benefits from the same WOTC-era nostalgia as Charizard, with a more accessible entry point and steady collector demand.",
    views: 6120,
    watching: 176,
    addedDaysAgo: 36,
    investmentType: "Fractional",
  },
  {
    id: "trout-rc",
    symbol: "TROUT.RC",
    name: "2011 Topps Update Mike Trout Rookie",
    category: "Sports · Baseball",
    grade: "PSA 9 · Mint",
    cert: "PSA #61234402",
    price: 575,
    marketValue: 4920,
    change: 4.61,
    confidence: 91,
    available: 32.8,
    owners: 21,
    vaultStatus: "Brinks London Vault 4",
    insured: "Lloyd's of London · £10,000",
    originalOwner: "B. Hayes",
    ownerRetains: 58,
    img: jordanImg,
    spark: [500, 510, 520, 515, 525, 530, 540, 550, 560, 575],
    chart: series(510, 575, 90, 0.025),
    aiScore: 84,
    risk: "Low",
    aiInsight:
      "Modern baseball blue-chip with a deep, liquid market. Trout's sustained performance and Hall of Fame trajectory support long-term demand.",
    views: 5480,
    watching: 143,
    addedDaysAgo: 47,
    investmentType: "Fractional",
  },
];

export const ASSETS: Asset[] = ASSET_SEEDS.map(normalizeAssetPresentation);

export const getAsset = (id: string) => ASSETS.find((a) => a.id === id) ?? ASSETS[0];

export type Order = { user: string; pct: number; price: number };

const q = (p: number, m: number) => Math.round(p * m * 100) / 100;

/** All order-book quotes are per 1% of the asset. Pass the full asset price. */
export const buyOrders = (price: number): Order[] => [
  { user: "Investor A", pct: 5.0, price: q(price / 100, 0.98) },
  { user: "Investor D", pct: 2.5, price: q(price / 100, 0.96) },
  { user: "Investor F", pct: 3.0, price: q(price / 100, 0.94) },
  { user: "Investor H", pct: 1.5, price: q(price / 100, 0.92) },
];

export const sellOrders = (price: number): Order[] => [
  { user: "Investor C", pct: 3.0, price: q(price / 100, 1.02) },
  { user: "Investor E", pct: 2.0, price: q(price / 100, 1.04) },
  { user: "Investor G", pct: 4.0, price: q(price / 100, 1.06) },
];

export const recentTrades = (price: number) => [
  { time: "14:32:18", pct: 1.5, price: q(price / 100, 1.01), up: true },
  { time: "14:31:02", pct: 0.5, price: q(price / 100, 1.0), up: true },
  { time: "14:29:44", pct: 2.0, price: q(price / 100, 0.99), up: false },
  { time: "14:28:11", pct: 1.0, price: q(price / 100, 0.98), up: false },
  { time: "14:26:59", pct: 3.0, price: q(price / 100, 0.97), up: true },
];

export const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;

/** Formats fractional (sub-unit) prices with 2dp, e.g. price per 1% of an asset. */
export const gbpFrac = (n: number) =>
  `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Price of 1% of an asset. */
export const perOnePct = (fullPrice: number) => fullPrice / 100;

// ============ Collectors ============

export type Collector = {
  id: string;
  handle: string;
  name: string;
  focus: string;
  bio: string;
  portfolioValue: number;
  annualReturn: number;
  monthlyReturn: number;
  aiScore: number;
  risk: "Low" | "Medium" | "High";
  strategy: string;
  followers: number;
  investors: number;
  assets: number;
  available: number;
  retains: number;
  minInvest: number;
  topHoldings: string[];
  chart: number[];
  aiSummary: string;
  credibility: number; // 0–5
  completedTx: number;
  verifiedAssets: number;
  memberSince: string;
};

export const COLLECTORS: Collector[] = [
  {
    id: "reynolds",
    handle: "@reynolds",
    name: "M. Reynolds",
    focus: "Vintage Pokémon",
    bio: "10 years deep in WOTC-era Pokémon. Focused on PSA 10 population under 500.",
    portfolioValue: 184320,
    annualReturn: 31.4,
    monthlyReturn: 4.2,
    aiScore: 94,
    risk: "Medium",
    strategy: "Low-pop grading, long hold",
    followers: 4820,
    investors: 214,
    assets: 47,
    available: 20,
    retains: 80,
    minInvest: 25,
    topHoldings: ["chz-10", "pik-il", "bst-pk"],
    chart: series(120000, 184320, 90, 0.02),
    aiSummary:
      "31% return over 12 months from concentrated bets on low-population WOTC-era Pokémon. Strategy scales with grading scarcity but is exposed to a single franchise.",
    credibility: 4.9,
    completedTx: 312,
    verifiedAssets: 47,
    memberSince: "2021",
  },
  {
    id: "ahmed",
    handle: "@ahmed",
    name: "T. Ahmed",
    focus: "Vintage Sports",
    bio: "Blue-chip only. Jordan, LeBron rookies, and 1960s baseball.",
    portfolioValue: 312400,
    annualReturn: 18.9,
    monthlyReturn: 1.8,
    aiScore: 88,
    risk: "Low",
    strategy: "Blue-chip, deep liquidity",
    followers: 6100,
    investors: 341,
    assets: 62,
    available: 15,
    retains: 85,
    minInvest: 50,
    topHoldings: ["jrd-rc", "lot-mtg"],
    chart: series(260000, 312400, 90, 0.015),
    aiSummary:
      "Steady 19% annual return with the lowest volatility on Slice. A defensive allocation — favour when broader collectible markets weaken.",
    credibility: 4.8,
    completedTx: 487,
    verifiedAssets: 62,
    memberSince: "2020",
  },
  {
    id: "okafor",
    handle: "@okafor",
    name: "J. Okafor",
    focus: "MTG Reserved List",
    bio: "Reserved list only. Power Nine specialist.",
    portfolioValue: 96500,
    annualReturn: 22.1,
    monthlyReturn: 2.6,
    aiScore: 90,
    risk: "Low",
    strategy: "Reserved list scarcity",
    followers: 2140,
    investors: 118,
    assets: 19,
    available: 25,
    retains: 75,
    minInvest: 25,
    topHoldings: ["lot-mtg"],
    chart: series(78000, 96500, 90, 0.02),
    aiSummary:
      "Structural supply cap drives predictable appreciation. Low turnover, high AI confidence. Best suited to long-horizon investors.",
    credibility: 4.7,
    completedTx: 168,
    verifiedAssets: 19,
    memberSince: "2022",
  },
  {
    id: "bennett",
    handle: "@bennett",
    name: "S. Bennett",
    focus: "Modern TCG Momentum",
    bio: "One Piece, Lorcana, Pokémon SV. Momentum-driven flips and holds.",
    portfolioValue: 42800,
    annualReturn: 46.2,
    monthlyReturn: 6.8,
    aiScore: 79,
    risk: "High",
    strategy: "Momentum, modern releases",
    followers: 1820,
    investors: 96,
    assets: 34,
    available: 35,
    retains: 65,
    minInvest: 10,
    topHoldings: ["luf-op", "pik-il", "lor-arl"],
    chart: series(28000, 42800, 90, 0.05),
    aiSummary:
      "Aggressive 46% return driven by modern release timing. High volatility — treat as a satellite allocation.",
    credibility: 4.2,
    completedTx: 89,
    verifiedAssets: 34,
    memberSince: "2023",
  },
  {
    id: "larsen",
    handle: "@larsen",
    name: "K. Larsen",
    focus: "Vintage Pokémon Illustrations",
    bio: "Specialist in rare Pokémon promo and illustration cards. Quality over quantity.",
    portfolioValue: 52000,
    annualReturn: 24.5,
    monthlyReturn: 3.2,
    aiScore: 85,
    risk: "Medium",
    strategy: "Rare promo cards, low pop",
    followers: 2360,
    investors: 128,
    assets: 28,
    available: 22,
    retains: 78,
    minInvest: 20,
    topHoldings: ["pik-il"],
    chart: series(40000, 52000, 90, 0.03),
    aiSummary:
      "Concentrated vintage Pokémon promo exposure. Returns driven by scarcity and collector nostalgia, with moderate volatility.",
    credibility: 4.6,
    completedTx: 176,
    verifiedAssets: 28,
    memberSince: "2022",
  },
  {
    id: "patel",
    handle: "@patel",
    name: "R. Patel",
    focus: "Sealed Vintage Product",
    bio: "Collector of sealed WOTC-era boxes and booster packs. Supply reduction is the thesis.",
    portfolioValue: 68000,
    annualReturn: 19.4,
    monthlyReturn: 2.5,
    aiScore: 86,
    risk: "Medium",
    strategy: "Sealed supply scarcity",
    followers: 3150,
    investors: 142,
    assets: 15,
    available: 12,
    retains: 88,
    minInvest: 35,
    topHoldings: ["bst-pk"],
    chart: series(54000, 68000, 90, 0.025),
    aiSummary:
      "Sealed vintage product benefits from irreversible supply shrinkage. Lower liquidity than singles, but strong long-term appreciation.",
    credibility: 4.7,
    completedTx: 203,
    verifiedAssets: 15,
    memberSince: "2021",
  },
  {
    id: "tanaka",
    handle: "@tanaka",
    name: "H. Tanaka",
    focus: "Yu-Gi-Oh & Retro TCG",
    bio: "First-edition Yu-Gi-Oh and early 2000s TCG collector. Nostalgia-driven demand.",
    portfolioValue: 34000,
    annualReturn: 16.8,
    monthlyReturn: 2.2,
    aiScore: 78,
    risk: "Medium",
    strategy: "Retro TCG nostalgia",
    followers: 1680,
    investors: 87,
    assets: 22,
    available: 28,
    retains: 72,
    minInvest: 15,
    topHoldings: ["yg-drk"],
    chart: series(28000, 34000, 90, 0.03),
    aiSummary:
      "Steady inflows from returning millennial collectors. Entry-level price points support broad investor participation.",
    credibility: 4.3,
    completedTx: 134,
    verifiedAssets: 22,
    memberSince: "2022",
  },
  {
    id: "nakamura",
    handle: "@nakamura",
    name: "K. Nakamura",
    focus: "Modern Anime & Dragon Ball",
    bio: "Dragon Ball and modern anime card specialist. Franchise renaissance buyer.",
    portfolioValue: 29000,
    annualReturn: 14.2,
    monthlyReturn: 1.9,
    aiScore: 76,
    risk: "High",
    strategy: "Anime franchise momentum",
    followers: 1240,
    investors: 64,
    assets: 18,
    available: 32,
    retains: 68,
    minInvest: 10,
    topHoldings: ["dbz-goku"],
    chart: series(24000, 29000, 90, 0.04),
    aiSummary:
      "Franchise renaissance and global expansion are tailwinds. Higher volatility due to modern supply and turnover.",
    credibility: 4.1,
    completedTx: 98,
    verifiedAssets: 18,
    memberSince: "2023",
  },
  {
    id: "wexler",
    handle: "@wexler",
    name: "D. Wexler",
    focus: "Star Wars & Entertainment",
    bio: "Vintage entertainment IP and Star Wars trading cards. Stable long-term demand.",
    portfolioValue: 45000,
    annualReturn: 11.5,
    monthlyReturn: 1.4,
    aiScore: 74,
    risk: "Low",
    strategy: "Vintage entertainment IP",
    followers: 1920,
    investors: 76,
    assets: 24,
    available: 38,
    retains: 62,
    minInvest: 12,
    topHoldings: ["sw-vader"],
    chart: series(39000, 45000, 90, 0.02),
    aiSummary:
      "Vintage entertainment IP with sticky collector demand. Lower beta to TCG cycles and ideal for conservative allocations.",
    credibility: 4.5,
    completedTx: 145,
    verifiedAssets: 24,
    memberSince: "2021",
  },
  {
    id: "ives",
    handle: "@ives",
    name: "A. Ives",
    focus: "Marvel & Comic Crossover",
    bio: "First-appearance Marvel cards and comic-adjacent collectibles. Crossover demand.",
    portfolioValue: 38000,
    annualReturn: 17.6,
    monthlyReturn: 2.3,
    aiScore: 80,
    risk: "Medium",
    strategy: "First-appearance IP",
    followers: 2150,
    investors: 103,
    assets: 20,
    available: 25,
    retains: 75,
    minInvest: 15,
    topHoldings: ["mvl-hulk"],
    chart: series(31000, 38000, 90, 0.03),
    aiSummary:
      "First-appearance IP captures both card and comic collector demand. Moderate liquidity with attractive upside.",
    credibility: 4.4,
    completedTx: 167,
    verifiedAssets: 20,
    memberSince: "2022",
  },
  {
    id: "morgan",
    handle: "@morgan",
    name: "C. Morgan",
    focus: "Vintage Pokémon",
    bio: "WOTC-era Pokémon collector chasing PSA 9+ holo starters and low-pop promos.",
    portfolioValue: 62000,
    annualReturn: 23.7,
    monthlyReturn: 3.4,
    aiScore: 86,
    risk: "Medium",
    strategy: "Holo starter lines, low pop",
    followers: 2640,
    investors: 108,
    assets: 31,
    available: 24,
    retains: 76,
    minInvest: 20,
    topHoldings: ["bst-bls", "chz-10"],
    chart: series(48000, 62000, 90, 0.03),
    aiSummary:
      "Concentrated exposure to the original three Kanto starters. Returns are driven by cross-generational nostalgia and strong grading scarcity.",
    credibility: 4.6,
    completedTx: 198,
    verifiedAssets: 31,
    memberSince: "2021",
  },
  {
    id: "hayes",
    handle: "@hayes",
    name: "B. Hayes",
    focus: "Sports · Football & Baseball",
    bio: "Modern and vintage sports cards. Chasing iconic rookies and Hall of Fame trajectory players.",
    portfolioValue: 88000,
    annualReturn: 16.2,
    monthlyReturn: 1.9,
    aiScore: 83,
    risk: "Low",
    strategy: "Sports rookies, HOF upside",
    followers: 3290,
    investors: 147,
    assets: 41,
    available: 21,
    retains: 79,
    minInvest: 30,
    topHoldings: ["trout-rc", "jrd-rc"],
    chart: series(72000, 88000, 90, 0.02),
    aiSummary:
      "Sports-card allocation balanced between modern baseball blue-chips and vintage basketball. Lower volatility than TCG momentum plays.",
    credibility: 4.7,
    completedTx: 254,
    verifiedAssets: 41,
    memberSince: "2020",
  },
];

export const getCollector = (id: string) => COLLECTORS.find((c) => c.id === id) ?? COLLECTORS[0];

export const collectorForAsset = (asset: Asset): Collector | undefined =>
  COLLECTORS.find((c) => c.name === asset.originalOwner);

// ============ Famous Asset Database (for upload dropdown) ============

export type FamousAsset = {
  id: string;
  name: string;
  category: string;
  year: number;
  set: string;
  typicalValue: number;
  popularity: number; // search volume proxy
};

export const FAMOUS_ASSETS: FamousAsset[] = [
  {
    id: "f-chz",
    name: "Charizard Base Set Holo",
    category: "Pokémon TCG",
    year: 1999,
    set: "Base Set",
    typicalValue: 4200,
    popularity: 98,
  },
  {
    id: "f-pik",
    name: "Pikachu Illustrator",
    category: "Pokémon TCG",
    year: 1998,
    set: "Promo",
    typicalValue: 180000,
    popularity: 100,
  },
  {
    id: "f-umb",
    name: "Umbreon VMAX Alt Art",
    category: "Pokémon TCG",
    year: 2021,
    set: "Evolving Skies",
    typicalValue: 950,
    popularity: 91,
  },
  {
    id: "f-lug",
    name: "Lugia Neo Genesis 1st Ed",
    category: "Pokémon TCG",
    year: 2000,
    set: "Neo Genesis",
    typicalValue: 3400,
    popularity: 88,
  },
  {
    id: "f-bst",
    name: "Blastoise Base Set Holo",
    category: "Pokémon TCG",
    year: 1999,
    set: "Base Set",
    typicalValue: 1200,
    popularity: 84,
  },
  {
    id: "f-jrd",
    name: "Michael Jordan Fleer Rookie",
    category: "Sports · Basketball",
    year: 1986,
    set: "Fleer",
    typicalValue: 3800,
    popularity: 96,
  },
  {
    id: "f-brady",
    name: "Tom Brady Rookie Card",
    category: "Sports · Football",
    year: 2000,
    set: "Playoff Contenders",
    typicalValue: 5200,
    popularity: 93,
  },
  {
    id: "f-lbj",
    name: "LeBron James Rookie Card",
    category: "Sports · Basketball",
    year: 2003,
    set: "Topps Chrome",
    typicalValue: 2800,
    popularity: 92,
  },
  {
    id: "f-luf",
    name: "One Piece Manga Rare Luffy",
    category: "One Piece TCG",
    year: 2022,
    set: "Romance Dawn",
    typicalValue: 620,
    popularity: 87,
  },
  {
    id: "f-shk",
    name: "Shanks Manga Rare",
    category: "One Piece TCG",
    year: 2022,
    set: "Romance Dawn",
    typicalValue: 480,
    popularity: 82,
  },
  {
    id: "f-lot",
    name: "Black Lotus (Unlimited)",
    category: "Magic: The Gathering",
    year: 1993,
    set: "Unlimited",
    typicalValue: 8500,
    popularity: 99,
  },
  {
    id: "f-mox",
    name: "Mox Sapphire (Alpha)",
    category: "Magic: The Gathering",
    year: 1993,
    set: "Alpha",
    typicalValue: 12000,
    popularity: 90,
  },
  {
    id: "f-dark",
    name: "Dark Magician 1st Ed",
    category: "Yu-Gi-Oh",
    year: 2002,
    set: "LOB",
    typicalValue: 220,
    popularity: 85,
  },
  {
    id: "f-ariel",
    name: "Ariel Enchanted",
    category: "Disney Lorcana",
    year: 2023,
    set: "First Chapter",
    typicalValue: 340,
    popularity: 78,
  },
];

// ============ Trending & search helpers ============

export const TRENDING_SEARCHES = [
  "Charizard Base Set",
  "Michael Jordan Rookie",
  "PSA 10 Pikachu",
  "One Piece Manga Rare",
  "Black Lotus",
  "Pokémon 1999",
];

export const mostViewed = () => [...ASSETS].sort((a, b) => b.views - a.views).slice(0, 4);
export const recentlyAdded = () =>
  [...ASSETS].sort((a, b) => a.addedDaysAgo - b.addedDaysAgo).slice(0, 4);
export const fastestGrowing = () => [...ASSETS].sort((a, b) => b.change - a.change).slice(0, 4);
export const popularCollectors = () =>
  [...COLLECTORS].sort((a, b) => b.followers - a.followers).slice(0, 4);

export type SearchResult =
  { kind: "asset"; asset: Asset } | { kind: "collector"; collector: Collector };

export const searchAll = (query: string, limit = 8): SearchResult[] => {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const matches: SearchResult[] = [];
  for (const a of ASSETS) {
    const hay = `${a.name} ${a.symbol} ${a.category} ${a.grade} ${a.cert} ${a.id}`.toLowerCase();
    if (hay.includes(q)) matches.push({ kind: "asset", asset: a });
  }
  for (const c of COLLECTORS) {
    const hay = `${c.name} ${c.handle} ${c.focus} ${c.strategy}`.toLowerCase();
    if (hay.includes(q)) matches.push({ kind: "collector", collector: c });
  }
  return matches.slice(0, limit);
};

// ============ Collector holdings & portfolio capacity ============

export type CollectorHolding = {
  id: string;
  baseAssetId: string;
  name: string;
  symbol: string;
  category: string;
  grade: string;
  img: string;
  value: number; // full asset value
  change: number; // % 30d
  offeredPct: number; // % of this asset the collector offers to investors
  takenPct: number; // % already taken by investors
  spark: number[];
};

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const GRADES = [
  "PSA 10 · Gem Mint",
  "PSA 9 · Mint",
  "BGS 9.5 · Gem Mint",
  "CGC 9 · Mint",
  "PSA 8 · NM-MT",
];

const CARD_POOL: Record<string, string[]> = {
  "Pokémon TCG": [
    "Base Set Blastoise Holo",
    "Base Set Venusaur Holo",
    "Neo Genesis Lugia 1st Ed",
    "Umbreon VMAX Alt Art",
    "Jungle Snorlax Holo",
    "Fossil Dragonite Holo",
    "Team Rocket Dark Charizard",
    "Gym Heroes Blaine's Charizard",
    "Skyridge Crystal Charizard",
    "Base Set Chansey Holo",
    "Rayquaza VMAX Alt Art",
    "Charizard V Alt Art",
    "Shining Mewtwo Neo Destiny",
    "Espeon Gold Star",
    "Base Set Mewtwo Holo",
    "Legendary Collection Reverse Holo",
  ],
  "Sports · Basketball": [
    "Michael Jordan Fleer Rookie",
    "LeBron James Topps Chrome RC",
    "Kobe Bryant Topps Rookie",
    "Luka Doncic Prizm RC",
    "Larry Bird Topps Rookie",
    "Ja Morant Optic Rated Rookie",
  ],
  "Sports · Football": [
    "Tom Brady Playoff Contenders RC",
    "Joe Burrow Prizm RC",
    "Patrick Mahomes Prizm RC",
    "Justin Herbert Optic RC",
    "Drew Brees Topps Chrome RC",
  ],
  "Sports · Baseball": [
    "Mike Trout Topps Update RC",
    "Derek Jeter SP Rookie",
    "Ken Griffey Jr Upper Deck RC",
    "Ronald Acuña Jr Topps RC",
    "Aaron Judge Topps Chrome RC",
  ],
  "Magic: The Gathering": [
    "Unlimited Black Lotus",
    "Alpha Mox Sapphire",
    "Beta Time Walk",
    "Revised Underground Sea",
    "Arabian Nights Juzám Djinn",
    "Legends Mana Drain",
  ],
  "One Piece TCG": [
    "Luffy Manga Rare",
    "Shanks Manga Rare",
    "Zoro Parallel Alt Art",
    "Nami Super Rare",
    "Ace Leader Alt Art",
  ],
  "Disney Lorcana": [
    "Ariel Enchanted",
    "Elsa Enchanted",
    "Mickey Brave Little Tailor",
    "Maleficent Enchanted",
  ],
  "Sealed Product": [
    "Base Set Booster Pack",
    "Evolving Skies Booster Box",
    "1st Ed Jungle Booster Box",
  ],
};

const focusCategories = (c: Collector): string[] => {
  const f = c.focus.toLowerCase();
  if (f.includes("pokémon") || f.includes("pokemon"))
    return ["Pokémon TCG", "Pokémon TCG", "Sealed Product"];
  if (f.includes("sports"))
    return ["Sports · Basketball", "Sports · Football", "Sports · Baseball"];
  if (f.includes("mtg") || f.includes("magic"))
    return ["Magic: The Gathering", "Magic: The Gathering"];
  return ["One Piece TCG", "Disney Lorcana", "Pokémon TCG"];
};

const holdingCache = new Map<string, CollectorHolding[]>();

/** Deterministic full holdings list for a collector — length matches collector.assets. */
export const collectorHoldings = (collectorId: string): CollectorHolding[] => {
  const cached = holdingCache.get(collectorId);
  if (cached) return cached;

  const c = getCollector(collectorId);
  const rand = rng(hash(collectorId));
  const cats = focusCategories(c);
  const out: CollectorHolding[] = [];

  // seed with real top holdings so links stay live
  for (const hid of c.topHoldings) {
    const a = getAsset(hid);
    out.push({
      id: hid,
      baseAssetId: hid,
      name: a.name,
      symbol: a.symbol,
      category: a.category,
      grade: a.grade,
      img: a.img,
      value: a.price,
      change: a.change,
      offeredPct: a.available,
      takenPct: Math.round(a.available * (0.2 + rand() * 0.5) * 10) / 10,
      spark: a.spark,
    });
  }

  for (let i = out.length; i < c.assets; i++) {
    const cat = cats[Math.floor(rand() * cats.length)];
    const pool = CARD_POOL[cat] ?? CARD_POOL["Pokémon TCG"];
    const base = ASSETS.find((a) => a.category === cat) ?? ASSETS[i % ASSETS.length];
    const nameCore = pool[Math.floor(rand() * pool.length)];
    const year = 1996 + Math.floor(rand() * 28);
    const value = Math.round(320 + rand() * 620);
    const change = Math.round((rand() * 34 - 9) * 10) / 10;
    // some cards are barely offered — this is the point of capacity limits
    const offeredPct = [0, 2, 5, 5, 8, 10, 12, 15, 20, 25][Math.floor(rand() * 10)];
    const takenPct = Math.round(offeredPct * rand() * 0.8 * 10) / 10;
    const s0 = value * (1 - change / 200);
    out.push({
      id: `${collectorId}-h${i}`,
      baseAssetId: base.id,
      name: `${year} ${nameCore}`,
      symbol: `${nameCore
        .replace(/[^A-Za-z]/g, "")
        .slice(0, 3)
        .toUpperCase()}.${String(i).padStart(2, "0")}`,
      category: cat,
      grade: GRADES[Math.floor(rand() * GRADES.length)],
      img: base.img,
      value,
      change,
      offeredPct,
      takenPct,
      spark: Array.from(
        { length: 10 },
        (_, k) => s0 + ((value - s0) * k) / 9 + Math.sin(k * 1.3 + i) * value * 0.02,
      ),
    });
  }

  holdingCache.set(collectorId, out);
  return out;
};

/** Real portfolio value = sum of holding values. */
export const collectorPortfolioValue = (collectorId: string) =>
  Math.round(collectorHoldings(collectorId).reduce((s, h) => s + h.value, 0));

export type Capacity = { offered: number; taken: number; remaining: number };

/** Total money the collector can accept, based on each asset's own offered %. */
export const portfolioCapacity = (collectorId: string): Capacity => {
  const hs = collectorHoldings(collectorId);
  let offered = 0;
  let taken = 0;
  for (const h of hs) {
    offered += h.value * (h.offeredPct / 100);
    taken += h.value * (h.takenPct / 100);
  }
  offered = Math.round(offered * 100) / 100;
  taken = Math.round(taken * 100) / 100;
  return { offered, taken, remaining: Math.round((offered - taken) * 100) / 100 };
};

export type Allocation = {
  holding: CollectorHolding;
  amount: number;
  pct: number;
  capped: boolean;
};

/** Spread an amount pro-rata across holdings by each asset's remaining offered capacity. */
export const allocate = (amount: number, collectorId: string): Allocation[] => {
  const hs = collectorHoldings(collectorId);
  const caps = hs.map((h) => Math.max(0, h.value * ((h.offeredPct - h.takenPct) / 100)));
  const total = caps.reduce((s, v) => s + v, 0);
  if (total <= 0 || amount <= 0) return [];
  const spend = Math.min(amount, total);
  return hs
    .map((h, i) => {
      const share = Math.round(((spend * caps[i]) / total) * 100) / 100;
      return {
        holding: h,
        amount: share,
        pct: Math.round((share / h.value) * 100 * 100) / 100,
        capped: caps[i] > 0 && share >= caps[i] - 0.01,
      };
    })
    .filter((a) => a.amount > 0)
    .sort((a, b) => b.amount - a.amount);
};
