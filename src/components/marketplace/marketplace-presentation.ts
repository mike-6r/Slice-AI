import {
  Award,
  CircleDot,
  Clock3,
  Diamond,
  Eye,
  Flame,
  Gem,
  Shield,
  Sparkles,
  Swords,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import type { MarketplaceAsset } from "./market-api-presentation";

export type MarketCategoryPresentation = {
  slug: string;
  label: string;
  icon: LucideIcon;
};

const CATEGORY_PRESENTATIONS: Record<string, MarketCategoryPresentation> = {
  "pokemon-tcg": { slug: "pokemon-tcg", label: "Pok\u00e9mon TCG", icon: Gem },
  "sports-cards": { slug: "sports-cards", label: "Sports Cards", icon: Trophy },
  "magic-the-gathering": {
    slug: "magic-the-gathering",
    label: "Magic: The Gathering",
    icon: Sparkles,
  },
  "yu-gi-oh": { slug: "yu-gi-oh", label: "Yu-Gi-Oh!", icon: Swords },
  "one-piece": { slug: "one-piece", label: "One Piece TCG", icon: Shield },
  "disney-lorcana": { slug: "disney-lorcana", label: "Disney Lorcana", icon: Diamond },
  other: { slug: "other", label: "Other", icon: CircleDot },
};

const CATEGORY_ALIASES: Record<string, string> = {
  pokemon: "pokemon-tcg",
  "poke-mon": "pokemon-tcg",
  "pokemon-tcg": "pokemon-tcg",
  sports: "sports-cards",
  "sports-cards": "sports-cards",
  basketball: "sports-cards",
  baseball: "sports-cards",
  football: "sports-cards",
  magic: "magic-the-gathering",
  mtg: "magic-the-gathering",
  "magic-the-gathering": "magic-the-gathering",
  yugioh: "yu-gi-oh",
  "yu-gi-oh": "yu-gi-oh",
  "one-piece": "one-piece",
  lorcana: "disney-lorcana",
  "disney-lorcana": "disney-lorcana",
};

const normalizeToken = (value: string) => {
  const repaired = value
    .replace(/\u00c3\u00a9/g, "\u00e9")
    .replace(/\u00c2\u00b7/g, "\u00b7")
    .replace(/\u00e2\u20ac\u2122/g, "\u2019");

  return repaired
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
};

export function marketCategoryPresentation(category: string): MarketCategoryPresentation {
  const normalized = normalizeToken(category);
  const canonical = CATEGORY_ALIASES[normalized] ?? normalized;
  return (
    CATEGORY_PRESENTATIONS[canonical] ?? {
      slug: canonical || "other",
      label: category.trim() || "Other",
      icon: CATEGORY_PRESENTATIONS.other.icon,
    }
  );
}

export type MarketplaceEditorialTag = {
  label:
    | "Trending"
    | "High Interest"
    | "Modern Chase"
    | "Iconic"
    | "Editor's Pick"
    | "Rising Fast"
    | "Most Watched"
    | "Rare Find"
    | "New Listing"
    | "Blue Chip";
  tone: "green" | "blue" | "purple" | "orange";
  icon: LucideIcon;
};

// PRESENTATION-ONLY MARKETPLACE SHOWCASE LABELS. NOT AUTHORITATIVE TRADING SIGNALS.
const EDITORIAL_TAGS: Array<{ match: RegExp; tag: MarketplaceEditorialTag }> = [
  { match: /umbreon.*vmax|moonbreon/i, tag: { label: "Modern Chase", tone: "purple", icon: Gem } },
  { match: /grey felt hat|van gogh/i, tag: { label: "Most Watched", tone: "blue", icon: Eye } },
  { match: /charizard/i, tag: { label: "Trending", tone: "green", icon: Flame } },
  { match: /wembanyama/i, tag: { label: "High Interest", tone: "green", icon: TrendingUp } },
  { match: /bedard/i, tag: { label: "New Listing", tone: "orange", icon: Clock3 } },
  { match: /stroud/i, tag: { label: "Editor's Pick", tone: "purple", icon: Sparkles } },
  {
    match: /black-lotus|dark-magician/i,
    tag: { label: "Editor's Pick", tone: "purple", icon: Sparkles },
  },
  { match: /jordan|rayquaza/i, tag: { label: "Rising Fast", tone: "green", icon: TrendingUp } },
  { match: /pikachu|luka/i, tag: { label: "Most Watched", tone: "blue", icon: Eye } },
  { match: /blastoise/i, tag: { label: "Rare Find", tone: "blue", icon: Gem } },
  { match: /mantle/i, tag: { label: "Blue Chip", tone: "blue", icon: Award } },
  { match: /one-piece/i, tag: { label: "New Listing", tone: "orange", icon: Clock3 } },
];

export function marketplaceEditorialTag(asset: Pick<MarketplaceAsset, "slug" | "title">) {
  const identity = `${asset.slug} ${asset.title}`;
  return (
    EDITORIAL_TAGS.find(({ match }) => match.test(identity))?.tag ?? {
      label: "New Listing",
      tone: "orange",
      icon: Clock3,
    }
  );
}
