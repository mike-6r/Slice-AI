import charizardSlabImage from "@/assets/charizard-slab.jpg";
import jordanImage from "@/assets/jordan.jpg";
import magicImage from "@/assets/mtg.jpg";
import onePieceImage from "@/assets/onepiece.jpg";
import pikachuImage from "@/assets/pikachu.jpg";

/**
 * The public catalogue currently has no public-media URL field. These are the
 * approved, bundled staging showcase photographs for the fixed demo catalogue;
 * catalogue identity, pricing, history, availability and trading are still
 * read from the API. Unknown live catalogue records deliberately have no
 * fallback photograph rather than being shown with misleading media.
 */
export type DemoAssetMediaKey =
  "charizard-slab" | "jordan-rookie" | "black-lotus" | "one-piece" | "pikachu-illustrator";

type DemoAssetMedia = { key: DemoAssetMediaKey; src: string; alt: string };

const stagedMedia: Partial<Record<string, DemoAssetMedia>> = {
  "slice-demo-charizard": {
    key: "charizard-slab",
    src: charizardSlabImage,
    alt: "1999 Pokemon Base Set Charizard Holo in a graded slab",
  },
  "slice-demo-pikachu": {
    key: "pikachu-illustrator",
    src: pikachuImage,
    alt: "Pokemon Pikachu Illustrator collectible card",
  },
  "slice-demo-jordan": {
    key: "jordan-rookie",
    src: jordanImage,
    alt: "Michael Jordan rookie sports card",
  },
  "slice-demo-black-lotus": {
    key: "black-lotus",
    src: magicImage,
    alt: "Magic the Gathering collectible presentation",
  },
  "slice-demo-one-piece": {
    key: "one-piece",
    src: onePieceImage,
    alt: "One Piece trading card collectible presentation",
  },
  "slice-demo-specialist-black-lotus": {
    key: "black-lotus",
    src: magicImage,
    alt: "Magic the Gathering Black Lotus collectible presentation",
  },
  "slice-demo-specialist-one-piece": {
    key: "one-piece",
    src: onePieceImage,
    alt: "One Piece manga rare trading card collectible presentation",
  },
};

export const assetShowcaseMedia = (slug: string) => stagedMedia[slug];
