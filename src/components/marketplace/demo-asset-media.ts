import bedardImage from "@/assets/connor-bedard-young-guns-psa10.png";
import charizardBaseSetImage from "@/assets/charizard-slab-transparent.png";
import charizardImage from "@/assets/charizard-ex-obsidian-flames-psa10.jpg";
import stroudImage from "@/assets/cj-stroud-purple-pulsar-psa10.jpg";
import pikachuImage from "@/assets/pikachu-grey-felt-hat-psa10.jpg";
import umbreonImage from "@/assets/umbreon-vmax-psa10.jpg";
import wembanyamaImage from "@/assets/victor-wembanyama-prizm-bgs95.jpg";

/**
 * The public catalogue currently has no public-media URL field. These are the
 * source-attributed marketplace listing images for the fixed staging catalogue.
 * They match the record's listed card, grade and variant, but remain external
 * reference media — Slice does not claim ownership of the pictured card.
 * Unknown live catalogue records deliberately have no fallback photograph.
 */
export type DemoAssetMediaKey =
  | "umbreon-psa10"
  | "pikachu-psa10"
  | "charizard-psa10"
  | "charizard-base-set-1st-edition"
  | "wembanyama-bgs95"
  | "bedard-psa10"
  | "stroud-psa10";

type DemoAssetMedia = { key: DemoAssetMediaKey; src: string; alt: string };

const stagedMedia: Partial<Record<string, DemoAssetMedia>> = {
  "slice-demo-charizard-base-set-1st-edition": {
    key: "charizard-base-set-1st-edition",
    src: charizardBaseSetImage,
    alt: "Static educational reference image: 1999 Base Set 1st Edition Charizard, #4 holo",
  },
  "slice-demo-umbreon-vmax-moonbreon": {
    key: "umbreon-psa10",
    src: umbreonImage,
    alt: "External listing image: 2021 Umbreon VMAX 215/203 Alternate Art, PSA 10",
  },
  "slice-demo-charizard-ex-obsidian-flames": {
    key: "charizard-psa10",
    src: charizardImage,
    alt: "External listing image: 2023 Charizard ex 223/197 Special Illustration Rare, PSA 10",
  },
  "slice-demo-pikachu-grey-felt-hat": {
    key: "pikachu-psa10",
    src: pikachuImage,
    alt: "External listing image: 2023 Pikachu with Grey Felt Hat SVP 085, PSA 10",
  },
  "slice-demo-victor-wembanyama-prizm-rookie": {
    key: "wembanyama-bgs95",
    src: wembanyamaImage,
    alt: "External listing image: 2023-24 Panini Prizm Victor Wembanyama 136 rookie, BGS 9.5",
  },
  "slice-demo-connor-bedard-young-guns": {
    key: "bedard-psa10",
    src: bedardImage,
    alt: "External listing image: 2023-24 Upper Deck Connor Bedard Young Guns 451 rookie, PSA 10",
  },
  "slice-demo-cj-stroud-purple-pulsar-rookie": {
    key: "stroud-psa10",
    src: stroudImage,
    alt: "External listing image: 2023 Panini Prizm C.J. Stroud Purple Pulsar 339 rookie, PSA 10",
  },
};

export const assetShowcaseMedia = (slug: string) => stagedMedia[slug];
