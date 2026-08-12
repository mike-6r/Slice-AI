import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { AppRepositories } from "@/data/repositories";
import { mockRepositories } from "@/mocks/repositories";
import { AppServicesProvider } from "@/providers/AppServicesProvider";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
}));
vi.mock("@/auth/use-session", () => ({ useSession: () => ({ isAuthenticated: true }) }));

import { SubmissionPage } from "./list";

function renderList() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(
    ["catalogue", "submission-categories"],
    [{ id: "cards", slug: "cards", name: "Collectible cards", description: null }],
  );
  client.setQueryData(["submissions", "mine"], { items: [], nextCursor: null });
  const repositories: AppRepositories = {
    ...mockRepositories,
    catalogue: {
      listSubmissionCategories: async () => [
        { id: "cards", slug: "cards", name: "Collectible cards", description: null },
      ],
    },
    submissions: {
      ...mockRepositories.submissions,
      listOwn: async () => ({ items: [], nextCursor: null }),
    },
  };
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <AppServicesProvider repositories={repositories}>
        <SubmissionPage />
      </AppServicesProvider>
    </QueryClientProvider>,
  );
}

describe("Document 010 list asset UI", () => {
  it("renders submission review workflow and never offers fabricated auction, price, shipping, or publication controls", () => {
    const html = renderList();
    expect(html).toContain("List your card in a few simple steps.");
    expect(html).toContain("What are you listing?");
    expect(html).toContain("Check the market");
    expect(html).toContain("Add photos");
    expect(html).toContain("Review &amp; submit");
    expect(html).toContain("My submissions");
    expect(html).not.toContain("£2,500");
    expect(html).not.toContain("Publish now");
    expect(html).not.toContain("seller payout");
  });
});
