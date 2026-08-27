import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "@/api/http-client";
import type { ISODateTime } from "@/domain";
import { createHttpRepositories, mapMarketAsset } from "./http-repositories";

const dto = {
  publicId: "asset-public-id",
  slug: "charizard",
  title: "Charizard",
  shortName: null,
  year: 1999,
  manufacturer: "The Pokémon Company",
  cardNumber: "4/102",
  description: "Reference-only staging record.",
  certificationNumber: "58291042",
  listing: {
    listedAt: "2026-08-16T01:03:01.814Z",
    listedBy: {
      displayName: "Slice Demo Collector",
      username: "slice-demo-collector",
      slug: "slice-demo-collector",
    },
  },
  category: { slug: "pokemon", name: "Pokémon" },
  collectibleSet: null,
  grading: { companyCode: "PSA", grade: "10.00", label: "10" },
  sliceValuation: {
    id: "valuation-1",
    amount: { minor: "2458000", currency: "GBP" as const },
    confidence: 92,
    sourceType: "MANUAL_RESEARCH",
    approvedAt: "2026-08-06T00:00:00.000Z",
    status: "ACTIVE" as const,
  },
  estimatedMarketValue: { minor: "2458000", currency: "GBP" as const },
  change24hBps: 1243,
  availabilityBps: null,
  confidence: 92,
  source: "AUCTION_COMPS",
  dataStatus: "DELAYED" as const,
  asOf: "2026-08-06T00:00:00.000Z",
  marketReference: null,
  sliceGrade: {
    status: "SUCCEEDED" as const,
    provider: "XIMILAR",
    overallEstimate: 4,
    overallMin: 3.5,
    overallMax: 4.5,
    centeringScore: 4,
    cornerScore: 4.2,
    edgeScore: 3.8,
    surfaceScore: 4.1,
    conditionLabel: "Very Good",
    analyzedAt: "2026-08-16T12:00:00.000Z" as ISODateTime,
    warnings: [],
    visualizations: [
      {
        side: "FRONT" as const,
        type: "overview" as const,
        url: "https://example.com/front.jpg",
        centering: null,
      },
    ],
  },
};

describe("HTTP catalogue mapping", () => {
  it("keeps the account identifier in the history path, not the strict query", async () => {
    const get = vi
      .fn()
      .mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 });
    const repositories = createHttpRepositories({ get } as unknown as ApiClient);

    await expect(
      repositories.admin.getUserHistory({
        id: "account-1",
        category: "SECURITY",
        page: 2,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({ items: [], page: 1, total: 0 });

    expect(get).toHaveBeenCalledWith("/admin/users/account-1/history", {
      category: "SECURITY",
      page: 2,
      pageSize: 20,
    });
  });

  it("maps the bounded account-capability contract without raw compliance state", async () => {
    const get = vi.fn().mockResolvedValue({
      capabilities: [
        {
          capability: "PLACE_BUY_ORDER",
          allowed: false,
          status: "ACTION_REQUIRED",
          reason: "IDENTITY_VERIFICATION_REQUIRED",
          nextAction: null,
          requirements: [
            { type: "EMAIL_VERIFICATION", satisfied: true },
            { type: "IDENTITY_VERIFICATION", satisfied: false },
          ],
          providerCaseId: "must-not-map",
        },
      ],
    });
    const repositories = createHttpRepositories({ get } as unknown as ApiClient);

    await expect(repositories.account.getCapabilities()).resolves.toEqual({
      capabilities: [
        {
          capability: "PLACE_BUY_ORDER",
          allowed: false,
          status: "ACTION_REQUIRED",
          reason: "IDENTITY_VERIFICATION_REQUIRED",
          nextAction: null,
          requirements: [
            { type: "EMAIL_VERIFICATION", satisfied: true },
            { type: "IDENTITY_VERIFICATION", satisfied: false },
          ],
        },
      ],
    });
    expect(get).toHaveBeenCalledWith("/me/capabilities");
  });

  it("maps verified identity details without accepting document data", async () => {
    const get = vi.fn().mockResolvedValue({
      available: true,
      verifiedAt: "2026-08-20T10:00:00.000Z",
      details: {
        fullName: "Michael Fultz",
        email: "povnu@example.com",
        phone: null,
        dateOfBirth: "1988-06-12",
        idNumber: "must-not-map",
        address: {
          line1: "1 Slice Street",
          line2: null,
          city: "London",
          region: "England",
          postalCode: "SW1A 1AA",
          countryCode: "GB",
        },
      },
    });
    const repositories = createHttpRepositories({ get } as unknown as ApiClient);

    await expect(repositories.providers.getIdentityDetails()).resolves.toEqual({
      available: true,
      verifiedAt: "2026-08-20T10:00:00.000Z",
      details: {
        fullName: "Michael Fultz",
        email: "povnu@example.com",
        phone: null,
        dateOfBirth: "1988-06-12",
        address: {
          line1: "1 Slice Street",
          line2: null,
          city: "London",
          region: "England",
          postalCode: "SW1A 1AA",
          countryCode: "GB",
        },
      },
    });
    expect(get).toHaveBeenCalledWith("/me/compliance/identity-details");
  });

  it("maps the admin control-center projection without turning restricted finance into zeros", async () => {
    const get = vi.fn().mockResolvedValue({
      kpis: {
        totalUsers: 4,
        collectors: 2,
        investors: 1,
        activeListings: 1,
        openOrders: 0,
        needsAttention: 2,
      },
      pipeline: [],
      attentionGroups: [],
      recentActivity: [],
      systemHealth: [],
      accountMix: { collectors: 2, investors: 1, staff: 1, admins: 1, overlapping: true },
      memberships: { starter: 0, pro: 0, elite: 0, trialing: 0, pastDue: 0, mrrMinor: "0" },
      support: { available: true, message: "No open support tickets.", open: 0 },
      counts: {
        pendingReviews: 0,
        collectorActionsWaiting: 0,
        acceptedAwaitingVault: 0,
        shipmentsInTransit: 0,
        deliveredAwaitingReceipt: 0,
        verificationQueue: 0,
        valuationQueue: 0,
        vaultReady: 0,
        marketplaceReady: 1,
        compliance: 0,
        payments: 0,
        alerts: 0,
      },
      needsAttention: [],
      controlCenter: {
        summary: {
          needsAction: {
            count: 2,
            subtitle: "Needs review.",
            severity: "WARNING",
            target: "moderation",
          },
          financialRisk: {
            count: null,
            subtitle: "Finance visibility requires finance.read.",
            severity: "LIMITED",
            target: "payments",
            access: "LIMITED",
          },
          staffDecisions: {
            count: 0,
            subtitle: "None waiting.",
            severity: "HEALTHY",
            target: "moderation",
          },
          platformIncidents: {
            count: 0,
            subtitle: "No incidents.",
            severity: "HEALTHY",
            target: "health",
          },
        },
        priorityWork: [],
        platformHealth: [],
        financialOperations: {
          available: false,
          access: "LIMITED",
          message: "Finance visibility requires finance.read.",
          currency: "GBP",
          customerCashLiabilityMinor: null,
          bacsRiskHeldMinor: null,
          withdrawalEligibleMinor: null,
          providerAvailableMinor: null,
          providerPendingMinor: null,
          payoutLiquidityCoverageBps: null,
          openDeficitsCount: null,
          openDeficitsMinor: null,
          returnsManualReviewCount: null,
          dualControlApprovals: null,
          providerLiquidityStatus: null,
          warning: null,
        },
        pipeline: [],
        importantActivity: [],
        openCases: [],
        lastRefreshedAt: "2026-08-25T00:00:00.000Z",
      },
      generatedAt: "2026-08-25T00:00:00.000Z",
    });
    const repositories = createHttpRepositories({ get } as unknown as ApiClient);

    await expect(repositories.admin.getOperationsOverview()).resolves.toMatchObject({
      controlCenter: {
        summary: { financialRisk: { count: null, access: "LIMITED" } },
        financialOperations: { available: false, providerAvailableMinor: null },
      },
    });
    expect(get).toHaveBeenCalledWith("/admin/operations/overview");
  });

  it("maps public market fields without inventing a generic price or ownership", () => {
    const asset = mapMarketAsset(dto);
    expect(asset.sliceValuation).toMatchObject({
      amount: { amount: 2458000, currency: "GBP" },
      confidence: 92,
      status: "ACTIVE",
    });
    expect(asset.market?.estimatedMarketValue?.amount).toBe(2458000);
    expect(asset.marketValue).toBeUndefined();
    expect(asset.ownershipAvailableBps).toBeUndefined();
    expect(asset.market?.source).toBe("AUCTION_COMPS");
    expect(asset.certification).toEqual({ company: "PSA", number: "58291042" });
    expect(asset.listing).toEqual({
      listedAt: "2026-08-16T01:03:01.814Z",
      listedBy: {
        displayName: "Slice Demo Collector",
        username: "slice-demo-collector",
        slug: "slice-demo-collector",
      },
    });
  });

  it("keeps the approved front image ahead of the card back", () => {
    const asset = mapMarketAsset({
      ...dto,
      media: [
        { id: "back", slot: "back", url: "https://example.com/back.jpg", alt: "Card back" },
        { id: "front", slot: "front", url: "https://example.com/front.jpg", alt: "Card front" },
      ],
    });

    expect(asset.media[0]).toMatchObject({ id: "front", url: "https://example.com/front.jpg" });
  });

  it("keeps Slice Grade supporting evidence separate from official grading", () => {
    const asset = mapMarketAsset({ ...dto, grading: null });
    expect(asset.grade).toBeUndefined();
    expect(asset.sliceGrade).toMatchObject({
      status: "SUCCEEDED",
      overallEstimate: 4,
      conditionLabel: "Very Good",
    });
    expect(asset.sliceGrade?.visualizations).toHaveLength(1);
  });

  it("uses the API adapter and never falls back to mocks", async () => {
    const get = vi.fn().mockResolvedValue({ items: [dto], hasMore: false, nextCursor: null });
    const repositories = createHttpRepositories({ get } as unknown as ApiClient);
    await expect(repositories.assets.listAssets()).resolves.toMatchObject({
      items: [{ id: "asset-public-id" }],
    });
    await expect(repositories.collectors.listCollectors()).resolves.toMatchObject([
      { handle: "charizard", category: "mixed" },
    ]);
  });

  it("maps the batched market snapshot without exposing whole-asset valuation as a quote", async () => {
    const get = vi.fn().mockResolvedValue({
      generatedAt: "2026-08-23T12:00:00.000Z",
      status: "CURRENT",
      lastUpdatedAt: "2026-08-23T11:59:00.000Z",
      items: [
        {
          assetId: "asset-public-id",
          slug: "charizard",
          title: "Charizard",
          sliceMarketPrice: {
            amount: { minor: "164", currency: "GBP" },
            kind: "LAST_TRADE",
            observedAt: "2026-08-23T11:59:00.000Z",
          },
          externalReference: {
            amount: { minor: "202500", currency: "USD" },
            source: "PRICECHARTING",
            movement24hBps: -589,
            lastRefreshedAt: "2026-08-23T11:58:00.000Z",
            freshness: "FRESH",
          },
          marketState: "SECONDARY_MARKET",
          lastUpdatedAt: "2026-08-23T11:59:00.000Z",
        },
      ],
    });
    const repositories = createHttpRepositories({ get } as unknown as ApiClient);

    await expect(repositories.market.getMarketSnapshot()).resolves.toMatchObject({
      status: "CURRENT",
      items: [
        {
          title: "Charizard",
          sliceMarketPrice: { amount: { amount: 164, currency: "GBP" }, kind: "LAST_TRADE" },
          externalReference: { amount: { amount: 202500, currency: "USD" }, movement24hBps: -589 },
        },
      ],
    });
    expect(get).toHaveBeenCalledWith("/market/snapshot");
  });

  it("maps the bounded similar-assets projection and preserves price semantics", async () => {
    const get = vi.fn().mockResolvedValue({
      items: [
        {
          assetId: "similar-asset",
          slug: "umbreon-vmax",
          title: "Umbreon VMAX",
          category: "pokemon",
          setName: "Evolving Skies",
          cardNumber: "215/203",
          thumbnail: {
            url: "https://example.com/umbreon.jpg",
            alt: "Umbreon VMAX public thumbnail",
          },
          marketState: "LIVE_MARKET",
          displayPrice: {
            type: "LAST_EXECUTION",
            amount: { minor: "164", currency: "GBP" },
            observedAt: "2026-08-23T12:00:00.000Z",
          },
          movement24hBps: 235,
        },
      ],
    });
    const repositories = createHttpRepositories({ get } as unknown as ApiClient);

    await expect(
      repositories.market.getSimilarAssets("asset-public-id" as never, 8),
    ).resolves.toMatchObject([
      {
        assetId: "similar-asset",
        setName: "Evolving Skies",
        displayPrice: {
          type: "LAST_EXECUTION",
          amount: { amount: 164, currency: "GBP" },
        },
        movement24hBps: 235,
      },
    ]);
    expect(get).toHaveBeenCalledWith("/market/assets/asset-public-id/similar", { limit: 8 });
  });

  it("preserves persisted reference-history source and range movement metadata", async () => {
    const get = vi.fn().mockResolvedValue({
      source: "PRICECHARTING",
      movementBps: -124,
      points: [
        {
          observedAt: "2026-08-01T00:00:00.000Z",
          estimatedMarketValue: { minor: "202500", currency: "USD" },
        },
        {
          observedAt: "2026-08-23T00:00:00.000Z",
          estimatedMarketValue: { minor: "198000", currency: "USD" },
        },
      ],
    });
    const repositories = createHttpRepositories({ get } as unknown as ApiClient);

    const history = await repositories.market.getPriceHistory("asset-public-id" as never, "30D");

    expect(history).toMatchObject({
      source: "PRICECHARTING",
      movementBps: -124,
      range: "30D",
    });
    expect(history).toHaveLength(2);
    expect(history[0]?.value).toEqual({ amount: 202500, currency: "USD" });
    expect(get).toHaveBeenCalledWith("/market/assets/asset-public-id/history", { range: "30D" });
  });

  it("maps authoritative trading contracts and uses mutations with idempotency keys", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        assetId: "asset-public-id",
        side: "BUY",
        type: "LIMIT",
        timeInForce: "GTC",
        units: "10",
        limitPriceMinor: "125",
        grossMinor: "1250",
        feeMinor: "13",
        feeApplication: "SETTLEMENT_BOUNDARY_PENDING",
        reservationMinor: "1263",
        reservationUnits: null,
        marketStatus: "OPEN",
        eligibility: "ELIGIBLE",
      })
      .mockResolvedValueOnce({
        id: "order-1",
        assetId: "asset-id",
        side: "BUY",
        type: "LIMIT",
        timeInForce: "GTC",
        status: "OPEN",
        limitPriceMinor: "125",
        originalUnits: "10",
        remainingUnits: "10",
        filledUnits: "0",
        averageFillPriceMinor: null,
        requestedOwnershipPercent: null,
        filledOwnershipPercent: null,
        remainingOwnershipPercent: null,
        createdAt: "2026-08-08T00:00:00.000Z",
        closedAt: null,
      });
    const repositories = createHttpRepositories({ get: vi.fn(), request } as unknown as ApiClient);
    await expect(
      repositories.trading.previewOrder({
        assetId: "asset-public-id",
        side: "BUY",
        type: "LIMIT",
        timeInForce: "GTC",
        units: "10",
        limitPriceMinor: "125",
      }),
    ).resolves.toMatchObject({ feeMinor: "13", reservationMinor: "1263" });
    await expect(
      repositories.trading.placeOrder({
        assetId: "asset-public-id",
        side: "BUY",
        type: "LIMIT",
        timeInForce: "GTC",
        units: "10",
        limitPriceMinor: "125",
      }),
    ).resolves.toMatchObject({ id: "order-1", status: "OPEN" });
    expect(request).toHaveBeenLastCalledWith(
      "/trading/orders",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
      }),
    );
  });

  it("uses protected admin account mutation routes with idempotency keys", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ userId: "user-1", accountStatus: "SUSPENDED" })
      .mockResolvedValueOnce({
        assignmentId: "assignment-1",
        userId: "user-1",
        role: "COLLECTOR",
      })
      .mockResolvedValueOnce(undefined);
    const repositories = createHttpRepositories({ get: vi.fn(), request } as unknown as ApiClient);

    await expect(
      repositories.admin.transitionUserStatus("user-1", {
        toStatus: "SUSPENDED",
        reasonCode: "beta review",
      }),
    ).resolves.toEqual({ userId: "user-1", accountStatus: "SUSPENDED" });
    await expect(
      repositories.admin.grantUserRole("user-1", { role: "COLLECTOR" }),
    ).resolves.toMatchObject({ assignmentId: "assignment-1", role: "COLLECTOR" });
    await expect(repositories.admin.revokeUserRole("user-1", "assignment-1")).resolves.toEqual({
      assignmentId: "assignment-1",
      userId: "user-1",
      revoked: true,
    });

    expect(request).toHaveBeenNthCalledWith(
      1,
      "/admin/users/user-1/status",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
      }),
    );
    expect(request).toHaveBeenLastCalledWith(
      "/admin/users/user-1/roles/assignment-1",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
      }),
    );
  });

  it("maps D17 notification topics without private resource identifiers", async () => {
    const get = vi.fn().mockResolvedValue({
      items: [
        {
          id: "notice-1",
          topic: "ORDER_UPDATES",
          title: "Order opened",
          body: "Your order is open.",
          createdAt: "2026-08-08T00:00:00.000Z",
          readAt: null,
        },
      ],
      nextCursor: null,
    });
    const repositories = createHttpRepositories({ get, request: vi.fn() } as unknown as ApiClient);
    const notices = await repositories.notifications.listNotifications("current" as never);
    expect(notices[0]).toMatchObject({ id: "notice-1", title: "Order opened" });
    expect(JSON.stringify(notices[0])).not.toMatch(/account|journal|counterparty|reservation/i);
  });

  it("maps safe Document 016 provider state and preserves minor-unit strings", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        status: "PENDING",
        expiresAt: null,
        updatedAt: "2026-08-08T00:00:00.000Z",
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "movement-1",
            type: "DEPOSIT",
            amountMinor: "12345",
            currency: "GBP",
            status: "PENDING_PROVIDER",
            createdAt: "2026-08-08T00:00:00.000Z",
            updatedAt: "2026-08-08T00:00:00.000Z",
            replayed: false,
          },
        ],
        nextCursor: null,
      });
    const repositories = createHttpRepositories({ get, request: vi.fn() } as unknown as ApiClient);
    await expect(repositories.providers.getCompliance()).resolves.toMatchObject({
      status: "PENDING",
    });
    const movements = await repositories.providers.listMovements();
    expect(movements).toMatchObject({
      items: [{ amountMinor: "12345", status: "PENDING_PROVIDER" }],
    });
    expect(JSON.stringify(movements)).not.toMatch(
      /providerReference|riskScore|sanction|accountId/i,
    );
  });

  it("maps only the safe persisted bank projection and never fabricates institution data", async () => {
    const get = vi.fn().mockResolvedValue({
      items: [
        {
          id: "bank-connection-1",
          institutionName: null,
          accountName: "Current account",
          accountMask: "1234",
          accountType: "depository",
          currency: "GBP",
          status: "CONNECTED",
          isDefault: true,
          updatedAt: "2026-08-08T00:00:00.000Z",
        },
      ],
    });
    const request = vi.fn().mockResolvedValue({
      checkoutSessionId: "cs_test",
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test",
      expiration: "2026-08-09T00:00:00.000Z",
      paymentMethodType: "bacs_debit",
      replayed: false,
    });
    const repositories = createHttpRepositories({ get, request } as unknown as ApiClient);
    await expect(repositories.providers.listBankConnections()).resolves.toEqual([
      expect.objectContaining({ institutionName: null, accountMask: "1234", status: "CONNECTED" }),
    ]);
    await expect(repositories.providers.createBankLinkCheckout()).resolves.toMatchObject({
      checkoutSessionId: "cs_test",
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test",
      replayed: false,
    });
    expect(request).toHaveBeenCalledWith(
      "/wallet/bank-link/checkout",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.stringify(await repositories.providers.listBankConnections())).not.toMatch(
      /accessToken|providerReference|accountId|journal/i,
    );
  });

  it("maps authoritative submission drafts and exposes only the catalogue IDs needed to create them", async () => {
    const get = vi.fn().mockResolvedValue({
      items: [{ id: "category-1", slug: "pokemon", name: "Pokémon", description: null }],
    });
    const request = vi.fn().mockResolvedValue({
      id: "submission-1",
      status: "DRAFT",
      version: 1,
      categoryId: "category-1",
      setId: null,
      gradeScaleEntryId: null,
      declaredMetadata: { name: "Charizard" },
      submittedAt: null,
      reviewedAt: null,
      decisionCode: null,
      createdAt: "2026-08-08T00:00:00.000Z",
      updatedAt: "2026-08-08T00:00:00.000Z",
    });
    const repositories = createHttpRepositories({ get, request } as unknown as ApiClient);
    await expect(repositories.catalogue.listSubmissionCategories()).resolves.toEqual([
      { id: "category-1", slug: "pokemon", name: "Pokémon", description: null },
    ]);
    await expect(
      repositories.submissions.createDraft({
        categoryId: "category-1",
        declaredMetadata: { name: "Charizard" },
      }),
    ).resolves.toMatchObject({ id: "submission-1", status: "DRAFT" });
    expect(request).toHaveBeenCalledWith(
      "/submissions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
      }),
    );
  });

  it("maps private submission workflow and staff operations without storage or provider internals", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        id: "submission-1",
        status: "CHANGES_REQUESTED",
        version: 3,
        categoryId: "category-1",
        setId: null,
        gradeScaleEntryId: null,
        declaredMetadata: { name: "Charizard" },
        submittedAt: "2026-08-08T00:00:00.000Z",
        reviewedAt: "2026-08-08T01:00:00.000Z",
        decisionCode: "INCOMPLETE_EVIDENCE",
        createdAt: "2026-08-08T00:00:00.000Z",
        updatedAt: "2026-08-08T01:00:00.000Z",
        media: [
          {
            id: "media-1",
            slot: "front",
            mimeType: "image/jpeg",
            sizeBytes: 100,
            status: "SAFE",
            createdAt: "2026-08-08T00:00:00.000Z",
            updatedAt: "2026-08-08T01:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "asset-1",
            publicId: "ast-safe",
            title: "Safe asset",
            catalogueStatus: "DRAFT",
            valuationStatus: "MISSING",
            custodyStatus: "MISSING",
            coverageStatus: "MISSING",
            publicationStatus: "BLOCKED",
            updatedAt: "2026-08-08T00:00:00.000Z",
          },
        ],
      });
    const repositories = createHttpRepositories({ get, request: vi.fn() } as unknown as ApiClient);
    const submission = await repositories.submissions.getOwn("submission-1");
    const operations = await repositories.lifecycle.listOperations();
    expect(submission.media[0]).toMatchObject({ id: "media-1", status: "SAFE" });
    expect(operations[0]).toMatchObject({ id: "asset-1", valuationStatus: "MISSING" });
    expect(JSON.stringify({ submission, operations })).not.toMatch(
      /objectKey|storage|scanner|provider|facility|policyRef|reviewerId/i,
    );
  });

  it("maps safe governance and current-user projections without local tallies or private identifiers", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        id: "proposal-1",
        assetId: "asset-internal",
        status: "OPEN",
        offerMinor: "25000",
        currency: "GBP",
        opensAt: "2026-08-08T00:00:00.000Z",
        closesAt: "2026-08-15T00:00:00.000Z",
        eligibleUnits: "100",
        approveUnits: "55",
        rejectUnits: "5",
        votingEnabled: true,
        ownVote: null,
      })
      .mockResolvedValueOnce({
        id: "user-1",
        email: "user@example.test",
        createdAt: "2026-08-09T00:00:00.000Z",
        accountStatus: "ACTIVE",
        emailVerificationStatus: "UNVERIFIED",
        roles: ["USER"],
        profile: {
          displayName: "Safe user",
          username: null,
          usernameChangedAt: null,
          avatarReference: null,
          countryCode: "GB",
          preferredCurrency: "GBP",
          timezone: "Europe/London",
        },
      });
    const repositories = createHttpRepositories({ get, request: vi.fn() } as unknown as ApiClient);
    const proposal = await repositories.proposals.getSaleProposal("proposal-1");
    await expect(repositories.users.getCurrentUser()).resolves.toMatchObject({
      id: "user-1",
      accountStatus: "ACTIVE",
    });
    expect(proposal).toMatchObject({ offerMinor: "25000", ownVote: null });
    expect(JSON.stringify(proposal)).not.toMatch(
      /journal|reservation|counterparty|provider|audit/i,
    );
  });

  it("maps bounded viewer-aware governance discovery and creates only through the API contract", async () => {
    const get = vi.fn().mockResolvedValue({
      items: [
        {
          id: "proposal-1",
          assetId: "asset-internal",
          asset: { id: "asset-public", slug: "safe-asset", title: "Safe asset" },
          status: "OPEN",
          offerMinor: "25000",
          currency: "GBP",
          opensAt: "2026-08-08T00:00:00.000Z",
          closesAt: "2026-08-15T00:00:00.000Z",
          closedAt: null,
          eligibleUnits: "100",
          approveUnits: "55",
          rejectUnits: "5",
          votingEnabled: true,
          viewerState: "ELIGIBLE",
          viewerEligibleUnits: "60",
          ownVote: null,
        },
      ],
      nextCursor: "proposal-next",
    });
    const request = vi
      .fn()
      .mockResolvedValue({ proposalId: "proposal-created", status: "DRAFT", replayed: false });
    const repositories = createHttpRepositories({ get, request } as unknown as ApiClient);
    await expect(
      repositories.proposals.listSaleProposals({ viewerRelevant: true, limit: 20 }),
    ).resolves.toMatchObject({
      items: [
        { viewerState: "ELIGIBLE", asset: { title: "Safe asset" }, viewerEligibleUnits: "60" },
      ],
      nextCursor: "proposal-next",
    });
    await expect(
      repositories.proposals.createSaleProposal("asset-internal" as never, "25000"),
    ).resolves.toMatchObject({ proposalId: "proposal-created", status: "DRAFT" });
    expect(get).toHaveBeenCalledWith("/sale-proposals", { viewerRelevant: true, limit: 20 });
    expect(request).toHaveBeenCalledWith(
      "/assets/asset-internal/sale-proposals",
      expect.objectContaining({
        method: "POST",
        body: { offerMinor: "25000" },
        headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
      }),
    );
  });

  it("routes authorised governance lifecycle actions through the protected API contract", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ proposalId: "proposal-1", status: "OPEN", replayed: false });
    const repositories = createHttpRepositories({ get: vi.fn(), request } as unknown as ApiClient);
    await expect(repositories.proposals.openSaleProposal("proposal-1")).resolves.toMatchObject({
      proposalId: "proposal-1",
      status: "OPEN",
    });
    await expect(repositories.proposals.closeSaleProposal("proposal-1")).resolves.toMatchObject({
      proposalId: "proposal-1",
      status: "OPEN",
    });
    expect(request).toHaveBeenNthCalledWith(
      1,
      "/admin/sale-proposals/proposal-1/open",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
      }),
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      "/admin/sale-proposals/proposal-1/close",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
      }),
    );
  });
});
