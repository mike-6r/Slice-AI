import { createFileRoute } from "@tanstack/react-router";

import { InformationPage } from "./-information-page";

export const Route = createFileRoute("/help")({
  head: () => ({ meta: [{ title: "Help Centre | Slice" }] }),
  component: () => (
    <InformationPage
      content={{
        eyebrow: "Help Centre",
        title: "Find your way around Slice.",
        intro:
          "Start with the public marketplace, collector directory, or vault activity. Signed-in members can use their account areas for supported activity.",
        sections: [
          {
            title: "Marketplace and vault",
            body: "Browse published assets and review the public information Slice has approved for each collectible.",
          },
          {
            title: "Your account",
            body: "Portfolio, wallet, orders, notifications, and account tools are available after you sign in, where supported by your account state.",
          },
        ],
      }}
    />
  ),
});
