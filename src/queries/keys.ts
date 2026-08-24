export const queryKeys = {
  auth: {
    signupPolicy: ["auth", "signup-policy"] as const,
  },
  assets: {
    all: ["assets"] as const,
    detail: (id: string) => ["assets", id] as const,
    featured: ["assets", "featured"] as const,
    trending: ["assets", "trending"] as const,
  },
  market: {
    summary: ["market", "summary"] as const,
    snapshot: ["market", "snapshot"] as const,
    movers: ["market", "movers"] as const,
    history: (id: string, range: string) => ["market", "history", id, range] as const,
    orderBook: (id: string) => ["market", "order-book", id] as const,
    recentTrades: (id: string) => ["market", "recent-trades", id] as const,
  },
  trading: {
    orders: ["trading", "orders"] as const,
    executions: (cursor?: string) => ["trading", "executions", cursor ?? null] as const,
  },
  portfolio: {
    summary: ["portfolio", "summary"] as const,
    insights: ["portfolio", "insights"] as const,
    holdings: ["portfolio", "holdings"] as const,
    lots: ["portfolio", "lots"] as const,
    transactions: (cursor?: string) => ["portfolio", "transactions", cursor ?? null] as const,
  },
  collectors: { all: ["collectors"] as const, detail: (id: string) => ["collectors", id] as const },
  collectorWorkspace: {
    overview: ["collector-workspace", "overview"] as const,
    detail: (submissionId: string | null) =>
      ["collector-workspace", "collectible", submissionId] as const,
  },
  watchlist: (userId: string) => ["watchlist", userId] as const,
  user: {
    current: ["user", "current"] as const,
    discordLink: ["user", "discord-link"] as const,
  },
  account: {
    capabilities: ["account", "capabilities"] as const,
    email: ["account", "email-verification"] as const,
    phone: ["account", "phone-verification"] as const,
    twoFactor: ["account", "two-factor"] as const,
    sessions: ["account", "sessions"] as const,
    preferences: ["account", "preferences"] as const,
    notificationPreferences: ["account", "notification-preferences"] as const,
    activity: (cursor?: string) => ["account", "activity", cursor ?? null] as const,
    deletion: ["account", "deletion-request"] as const,
  },
  wallet: (userId: string) => ["wallet", userId] as const,
  providers: {
    compliance: ["providers", "compliance"] as const,
    bankConnections: ["providers", "bank-connections"] as const,
    connectPayoutSetup: ["providers", "connect-payout-setup"] as const,
    movements: (cursor?: string) => ["providers", "movements", cursor ?? null] as const,
  },
  notifications: Object.assign((userId: string) => ["notifications", userId] as const, {
    unread: ["notifications", "unread"] as const,
  }),
  discussions: (assetId: string) => ["discussions", assetId] as const,
  proposal: (id: string) => ["proposal", id] as const,
  governance: {
    proposals: (status?: string, viewerRelevant?: boolean) =>
      ["governance", "proposals", status ?? null, viewerRelevant ?? false] as const,
  },
};
