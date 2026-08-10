import { createFileRoute } from "@tanstack/react-router";

import { InformationPage } from "./-information-page";

export const Route = createFileRoute("/fees")({
  head: () => ({ meta: [{ title: "Fees | Slice" }] }),
  component: () => (
    <InformationPage
      content={{
        eyebrow: "Fees",
        title: "Clear information before you confirm an order.",
        intro:
          "Where a fee applies to a supported trading action, its current amount is presented in the order preview before the action is confirmed.",
        sections: [
          {
            title: "Order previews",
            body: "Review the order preview for the supported amount and fee treatment before placing an order.",
          },
          {
            title: "No unsupported estimates",
            body: "Slice does not present a fee amount on this page when it cannot be determined authoritatively for an account action.",
          },
        ],
      }}
    />
  ),
});
