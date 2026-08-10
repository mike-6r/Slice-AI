import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { AppRepositories } from "@/data/repositories";
import type { BankConnection, ComplianceSummary } from "@/domain";
import { mockRepositories } from "@/mocks/repositories";
import { AppServicesProvider } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/auth/use-session", () => ({ useSession: () => ({ isAuthenticated: true }) }));

import { AccountPageForTest } from "./account";

const compliance: ComplianceSummary = {
  status: "APPROVED",
  expiresAt: null,
  updatedAt: "2026-08-09T00:00:00.000Z" as never,
};
const banks: BankConnection[] = [
  {
    id: "private-bank-id",
    institutionName: "Safe Bank",
    accountName: null,
    accountMask: "1234",
    accountType: "checking",
    currency: "GBP",
    status: "CONNECTED",
    updatedAt: "2026-08-09T00:00:00.000Z" as never,
  },
];

function renderAccount() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(queryKeys.user.current, {
    id: "private-user-id",
    email: "collector@example.test",
    createdAt: "2026-06-12T00:00:00.000Z",
    accountStatus: "ACTIVE",
    emailVerificationStatus: "VERIFIED" as const,
    roles: ["USER"],
    profile: {
      displayName: "Slice Collector",
      username: "slice_collector",
      avatarReference: null,
      countryCode: "GB",
      preferredCurrency: "GBP" as const,
      timezone: "Europe/London",
    },
  });
  client.setQueryData(queryKeys.providers.compliance, compliance);
  client.setQueryData(queryKeys.providers.bankConnections, banks);
  client.setQueryData(queryKeys.account.email, {
    verified: true,
    verifiedAt: "2026-08-09T00:00:00.000Z",
  });
  client.setQueryData(queryKeys.account.phone, { phone: null, verified: false, verifiedAt: null });
  client.setQueryData(queryKeys.account.twoFactor, {
    enabled: true,
    enabledAt: "2026-08-09T00:00:00.000Z",
  });
  client.setQueryData(queryKeys.account.sessions, { sessions: [] });
  client.setQueryData(queryKeys.account.preferences, {
    timezone: "Europe/London",
    locale: "en-GB",
  });
  client.setQueryData(queryKeys.account.notificationPreferences, {
    preferences: [
      { topic: "ORDER_UPDATES" as const, channel: "IN_APP" as const, enabled: true },
      { topic: "PORTFOLIO_UPDATES" as const, channel: "IN_APP" as const, enabled: false },
    ],
  });
  client.setQueryData(queryKeys.account.activity(), { items: [], nextCursor: null });
  client.setQueryData(queryKeys.account.deletion, null);
  const repositories: AppRepositories = {
    ...mockRepositories,
    users: {
      getCurrentUser: async () =>
        client.getQueryData(queryKeys.user.current) as Awaited<
          ReturnType<AppRepositories["users"]["getCurrentUser"]>
        >,
      updateCurrentProfile: async () => {},
      getDiscordLink: async () => ({
        connected: false,
        configured: false,
        username: null,
        displayName: null,
        linkedAt: null,
      }),
      beginDiscordLink: async () => ({ authorizationUrl: "https://discord.com/oauth2/authorize" }),
      disconnectDiscordLink: async () => ({ disconnected: true }),
    },
    providers: {
      ...mockRepositories.providers,
      getCompliance: async () => compliance,
      listBankConnections: async () => banks,
    },
  };
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <AppServicesProvider repositories={repositories}>
        <AccountPageForTest />
      </AppServicesProvider>
    </QueryClientProvider>,
  );
}

function renderAccountWithOptionalPanelsUnavailable() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(queryKeys.user.current, {
    id: "private-user-id",
    email: "collector@example.test",
    createdAt: "2026-06-12T00:00:00.000Z",
    accountStatus: "ACTIVE",
    emailVerificationStatus: "VERIFIED" as const,
    roles: ["USER"],
    profile: {
      displayName: "Slice Collector",
      username: "slice_collector",
      avatarReference: null,
      countryCode: "GB",
      preferredCurrency: "GBP" as const,
      timezone: "Europe/London",
    },
  });
  client.setQueryData(queryKeys.providers.compliance, null);
  client.setQueryData(queryKeys.providers.bankConnections, null);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <AppServicesProvider repositories={mockRepositories}>
        <AccountPageForTest />
      </AppServicesProvider>
    </QueryClientProvider>,
  );
}

describe("account UI", () => {
  it("renders the real account center with safe profile and linked-bank projections", () => {
    const html = renderAccount();
    expect(html).toContain("Account Center");
    expect(html).toContain("Slice Collector");
    expect(html).toContain("Safe Bank");
    expect(html).toContain("•••• 1234");
    expect(html).toContain("Two-factor auth");
    expect(html).toContain("Order &amp; transaction updates");
    expect(html).toContain("Portfolio &amp; wallet activity");
    expect(html).toContain("Account data export");
    expect(html).toContain("Request account deletion");
    expect(html).not.toContain("private-user-id");
    expect(html).not.toContain("private-bank-id");
    expect(html).not.toContain("accessToken");
    expect(html).not.toContain("providerAccessToken");
    expect(html).not.toContain("recoveryCodes");
    expect(html).not.toContain("financialAccountId");
  });

  it("keeps the account shell visible when optional projections are unavailable", () => {
    const html = renderAccountWithOptionalPanelsUnavailable();
    expect(html).toContain("Account Center");
    expect(html).toContain("No bank accounts connected");
    expect(html).toContain("Not enabled");
    expect(html).toContain("Loading account data");
    expect(html).not.toContain("Account unavailable");
  });
});
