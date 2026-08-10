import { createFileRoute } from "@tanstack/react-router";

import { InformationPage } from "./-information-page";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({ meta: [{ title: "How It Works | Slice" }] }),
  component: () => (
    <InformationPage
      content={{
        eyebrow: "How It Works",
        title: "A clear path from discovery to account activity.",
        intro:
          "Slice presents public catalogue and vault information first, with authenticated ownership, wallet, and order tools available inside a signed-in account.",
        sections: [
          {
            title: "Explore published assets",
            body: "Use the marketplace to discover available assets and the public information released for them.",
          },
          {
            title: "Use authenticated tools",
            body: "Eligible account actions, including wallet, portfolio, and order activity, are performed through authenticated routes and server-side controls.",
          },
          {
            title: "Keep activity traceable",
            body: "The platform records supported ownership, financial, and trading activity through its authoritative services.",
          },
        ],
      }}
    />
  ),
});
