import boosterImage from "@/assets/booster.jpg";
import charizardSlabImage from "@/assets/charizard-slab.jpg";
import charizardImage from "@/assets/charizard.jpg";
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
const stagedMedia: Record<string, { src: string; alt: string }> = {
  "slice-demo-charizard": {
    src: charizardSlabImage,
    alt: "1999 Pokemon Base Set Charizard Holo in a graded slab",
  },
  "slice-demo-pikachu": {
    src: pikachuImage,
    alt: "Pokemon Pikachu Illustrator collectible card",
  },
  "slice-demo-blastoise": {
    src: boosterImage,
    alt: "Pokemon Base Set collectible presentation",
  },
  "slice-demo-jordan": {
    src: jordanImage,
    alt: "Michael Jordan rookie sports card",
  },
  "slice-demo-mantle": {
    src: jordanImage,
    alt: "Vintage sports card collectible presentation",
  },
  "slice-demo-dark-magician": {
    src: magicImage,
    alt: "Trading card collectible presentation",
  },
  "slice-demo-black-lotus": {
    src: magicImage,
    alt: "Magic the Gathering collectible presentation",
  },
  "slice-demo-one-piece": {
    src: onePieceImage,
    alt: "One Piece trading card collectible presentation",
  },
  "slice-demo-luka": {
    src: jordanImage,
    alt: "Basketball card collectible presentation",
  },
  "slice-demo-rayquaza": {
    src: charizardImage,
    alt: "Pokemon collectible presentation",
  },
  "slice-demo-specialist-dark-magician": {
    src: magicImage,
    alt: "Yu-Gi-Oh Dark Magician trading card collectible presentation",
  },
  "slice-demo-specialist-black-lotus": {
    src: magicImage,
    alt: "Magic the Gathering Black Lotus collectible presentation",
  },
  "slice-demo-specialist-one-piece": {
    src: onePieceImage,
    alt: "One Piece manga rare trading card collectible presentation",
  },
};

export const assetShowcaseMedia = (slug: string) => stagedMedia[slug];
