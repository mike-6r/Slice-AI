import { createFileRoute } from "@tanstack/react-router";

import { InformationPage } from "./-information-page";

export const Route = createFileRoute("/about")({
  head: () => ({ meta: [{ title: "About Slice | Slice" }] }),
  component: () => (
    <InformationPage
      content={{
        eyebrow: "About Slice",
        title: "Collectible assets, made easier to explore.",
        intro:
          "Slice brings published collectible assets, public vault activity, and authenticated account tools into one focused marketplace experience.",
        sections: [
          {
            title: "Discover with context",
            body: "Browse the published catalogue and inspect the public information available for each collectible asset.",
          },
          {
            title: "Built around account authority",
            body: "Ownership, financial, and trading activity are handled through the platform's server-side account controls.",
          },
        ],
      }}
    />
  ),
});
