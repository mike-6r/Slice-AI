export type AdminCollectibleTab = 'verification' | 'valuation' | 'custody' | 'marketplace' | 'exception';
export type AdminTrustSupportTab = 'compliance' | 'restrictions' | 'tickets' | 'escalations';
export type AdminFinanceTab = 'wallets' | 'movements' | 'orders' | 'executions' | 'reconciliation' | 'adjustments';
export type AdminPlatformTab = 'health' | 'jobs' | 'webhooks' | 'integrations' | 'audit' | 'feature-flags' | 'settings';

/** One route authority for Discord staff deep links. Every destination is a
 * consolidated Admin workspace; capability names below are tabs, not legacy
 * standalone consoles. */
export class SliceAdminRouteBuilder {
  constructor(private readonly webBaseUrl?: string) {}

  adminOverviewUrl() { return this.admin({ section: 'control' }); }
  adminAccountsUrl() { return this.admin({ section: 'users' }); }
  adminReviewQueueUrl(filters: Record<string, string | undefined> = {}) { return this.admin({ section: 'moderation', ...filters }); }
  adminSubmissionReviewUrl(submissionId: string) { return this.admin({ section: 'moderation', q: submissionId }); }
  adminPhysicalIntakeUrl(filters: Record<string, string | undefined> = {}) { return this.admin({ section: 'intake', ...filters }); }
  adminCollectibleUrl(collectibleId: string, tab: AdminCollectibleTab = 'verification') { return this.admin({ section: 'assetOperations', asset: collectibleId, tab }); }
  adminAssetOperationsUrl(tab?: AdminCollectibleTab, filters: Record<string, string | undefined> = {}) { return this.admin({ section: 'assetOperations', tab, ...filters }); }
  adminMembershipsUrl(filters: Record<string, string | undefined> = {}) { return this.admin({ section: 'memberships', ...filters }); }
  adminFinanceUrl(tab: AdminFinanceTab = 'reconciliation', filters: Record<string, string | undefined> = {}) { return this.admin({ section: 'payments', tab, ...filters }); }
  adminTrustSupportUrl(tab: AdminTrustSupportTab = 'tickets', filters: Record<string, string | undefined> = {}) { return this.admin({ section: 'support', tab, ...filters }); }
  adminPlatformOperationsUrl(tab: AdminPlatformTab = 'health', filters: Record<string, string | undefined> = {}) { return this.admin({ section: 'health', tab, ...filters }); }

  private admin(query: Record<string, string | undefined>) { return this.url('/admin', query); }
  private url(path: string, query: Record<string, string | undefined> = {}) {
    if (!this.webBaseUrl) return null;
    const url = new URL(path, this.webBaseUrl);
    for (const [key, value] of Object.entries(query)) if (value) url.searchParams.set(key, value);
    return url.toString();
  }
}
