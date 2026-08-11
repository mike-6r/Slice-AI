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
  "pokemon-tcg": { slug: "pokemon-tcg", label: "Pokémon TCG", icon: Gem },
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
  pokémon: "pokemon-tcg",
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

const normalizeToken = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9é]+/g, "-")
    .replace(/^-|-$/g, "");

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
  { match: /charizard/i, tag: { label: "Trending", tone: "green", icon: Flame } },
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
