import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { AppRepositories } from "@/data/repositories";
import type {
  BankConnection,
  ComplianceSummary,
  PortfolioSummary,
  WalletMovementPage,
} from "@/domain";
import { mockRepositories } from "@/mocks/repositories";
import { AppServicesProvider } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";
import {
  filterWalletMovements,
  settledMovementFlow,
  walletAccessPresentation,
} from "./-wallet-presentation";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/auth/use-session", () => ({ useSession: () => ({ isAuthenticated: true }) }));
vi.mock("react-plaid-link", () => ({
  usePlaidLink: () => ({ open: vi.fn(), ready: false, error: null }),
}));

import { Wallet } from "./wallet";

const populatedSummary: PortfolioSummary = {
  currency: "GBP",
  cash: { currency: "GBP", totalMinor: "15000", reservedMinor: "2500", availableMinor: "12500" },
  holdings: [],
  estimatedHoldingsValueMinor: null,
  estimatedPortfolioValueMinor: null,
  valuationStatus: "UNAVAILABLE",
};
const approvedCompliance: ComplianceSummary = {
  status: "APPROVED",
  expiresAt: null,
  updatedAt: "2026-08-09T00:00:00.000Z" as never,
};
const connectedBanks: BankConnection[] = [
  {
    id: "bank-private",
    institutionName: "Safe Bank",
    accountName: null,
    accountMask: "1234",
    accountType: "checking",
    currency: "GBP",
    status: "CONNECTED",
    updatedAt: "2026-08-09T00:00:00.000Z" as never,
  },
];
const settledMovement: WalletMovementPage = {
  items: [
    {
      id: "movement-private",
      type: "DEPOSIT",
      amountMinor: "5000",
      currency: "GBP",
      status: "SETTLED",
      createdAt: "2026-08-09T00:00:00.000Z" as never,
      updatedAt: "2026-08-09T00:00:00.000Z" as never,
      replayed: false,
    },
  ],
  nextCursor: null,
};

function renderWallet({
  summary = populatedSummary,
  compliance = approvedCompliance,
  banks = connectedBanks,
  movements = settledMovement,
}: {
  summary?: PortfolioSummary;
  compliance?: ComplianceSummary;
  banks?: BankConnection[];
  movements?: WalletMovementPage;
} = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(queryKeys.portfolio.summary, summary);
  client.setQueryData(queryKeys.providers.compliance, compliance);
  client.setQueryData(queryKeys.providers.bankConnections, banks);
  client.setQueryData(queryKeys.providers.movements(), movements);
  const repositories: AppRepositories = {
    ...mockRepositories,
    portfolio: { ...mockRepositories.portfolio, getPortfolio: async () => summary },
    providers: {
      ...mockRepositories.providers,
      getCompliance: async () => compliance,
      listBankConnections: async () => banks,
      listMovements: async () => movements,
    },
  };
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <AppServicesProvider repositories={repositories}>
        <Wallet />
      </AppServicesProvider>
    </QueryClientProvider>,
  );
}

describe("Document 016 wallet UI", () => {
  it("renders authoritative cash, safe bank data, settled movement insights, and customer-safe activity", () => {
    const html = renderWallet();
    expect(html).toContain("Cash and money movements");
    expect(html).toContain("£125.00");
    expect(html).toContain("Safe Bank");
    expect(html).toContain("•••• 1234");
    expect(html).toContain("Movement history");
    expect(html).toContain("Wallet insights");
    expect(html).toContain("Recent wallet activity");
    expect(html).toContain("Total deposited");
    expect(html).toContain("Cash history unavailable");
    expect(html).not.toContain("bank-private");
    expect(html).not.toContain("movement-private");
    expect(html).not.toMatch(/accessToken|itemId|provider payload|journal|reservation/i);
  });

  it("keeps an empty account visually complete with real zero balances and no fabricated provider state", () => {
    const html = renderWallet({
      summary: {
        ...populatedSummary,
        cash: { currency: "GBP", totalMinor: "0", reservedMinor: "0", availableMinor: "0" },
      },
      compliance: { ...approvedCompliance, status: "NOT_STARTED" },
      banks: [],
      movements: { items: [], nextCursor: null },
    });
    expect(html).toContain("£0.00");
    expect(html).toContain("No bank connected");
    expect(html).toContain("Connect bank");
    expect(html).toContain("No movements yet");
    expect(html).toContain("Wallet insights unavailable");
    expect(html).toContain("No recent activity");
    expect(html).toContain("Not Started");
    expect(html).not.toMatch(/operational|certified|insured|your funds protected/i);
  });

  it("derives display-only settled insights and filters only the documented movement types", () => {
    const movements = [
      ...settledMovement.items,
      {
        ...settledMovement.items[0],
        id: "withdrawal",
        type: "WITHDRAWAL" as const,
        amountMinor: "1200",
      },
      {
        ...settledMovement.items[0],
        id: "pending",
        amountMinor: "900",
        status: "PENDING_PROVIDER" as const,
      },
    ];
    expect(filterWalletMovements(movements, "DEPOSIT")).toHaveLength(2);
    expect(filterWalletMovements(movements, "WITHDRAWAL")).toHaveLength(1);
    expect(settledMovementFlow(movements)).toEqual({ inflowMinor: "5000", outflowMinor: "1200" });
  });

  it("uses the existing compliance and bank gates for customer-facing wallet access", () => {
    expect(walletAccessPresentation("NOT_STARTED", false)).toMatchObject({ status: "RESTRICTED" });
    expect(walletAccessPresentation("APPROVED", false)).toMatchObject({
      status: "AVAILABLE",
      detail: expect.stringContaining("Deposits"),
    });
    expect(walletAccessPresentation("APPROVED", true)).toMatchObject({
      status: "AVAILABLE",
      detail: expect.stringContaining("withdrawal"),
    });
  });
});
