/** Central customer-facing Slice deep links. Only same-origin internal routes
 * can be turned into Discord buttons. */
export class SliceCustomerRouteBuilder {
  constructor(private readonly webBaseUrl?: string) {}

  accountUrl() { return this.url('/account'); }
  portfolioUrl() { return this.url('/portfolio'); }
  ordersUrl() { return this.url('/orders'); }
  orderUrl(orderId: string) { return /^[A-Za-z0-9_-]{1,128}$/.test(orderId) ? this.url(`/orders/${encodeURIComponent(orderId)}`) : null; }
  transactionsUrl() { return this.url('/portfolio'); }
  collectorWorkspaceUrl() { return this.url('/collector-workspace'); }
  membershipUrl() { return this.url('/collector-workspace'); }
  marketplaceUrl() { return this.url('/marketplace'); }
  collectorActionUrl(route: string) { return this.url(route); }

  private url(path: string) {
    if (!this.webBaseUrl || !path.startsWith('/') || path.startsWith('//')) return null;
    const base = new URL(this.webBaseUrl);
    const target = new URL(path, base);
    return target.origin === base.origin ? target.toString() : null;
  }
}
