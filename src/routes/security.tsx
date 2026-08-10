import { createFileRoute } from "@tanstack/react-router";

import { InformationPage } from "./-information-page";

export const Route = createFileRoute("/security")({
  head: () => ({ meta: [{ title: "Security | Slice" }] }),
  component: () => (
    <InformationPage
      content={{
        eyebrow: "Security",
        title: "Security controls built into account activity.",
        intro:
          "Slice uses authenticated sessions, server-side authorization, and controlled financial and ownership authorities for supported account actions.",
        sections: [
          {
            title: "Account access",
            body: "Private routes require an authenticated account, and user-facing data is scoped to the signed-in account.",
          },
          {
            title: "Authoritative operations",
            body: "Financial, ownership, and trading operations are validated and recorded through server-side services rather than browser-managed balances.",
          },
          {
            title: "Provider boundaries",
            body: "Provider-backed flows remain distinct from account data and are only available when the relevant integration is configured.",
          },
        ],
      }}
    />
  ),
});
