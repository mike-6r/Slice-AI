import { describe, expect, it } from 'vitest';
import { SliceAdminRouteBuilder } from '../../src/admin-routes.js';
import { staffOperationsPayload, staffPanelPayload } from '../../src/staff-operations.js';

const routes = new SliceAdminRouteBuilder('https://slice.example');

describe('Slice staff operations', () => {
  it('centralizes deep links in the consolidated Admin workspaces', () => {
    expect(routes.adminReviewQueueUrl()).toBe('https://slice.example/admin?section=moderation');
    expect(routes.adminPhysicalIntakeUrl()).toBe('https://slice.example/admin?section=intake');
    expect(routes.adminCollectibleUrl('asset-1', 'valuation')).toBe('https://slice.example/admin?section=assetOperations&asset=asset-1&tab=valuation');
    expect(routes.adminFinanceUrl('reconciliation')).toBe('https://slice.example/admin?section=payments&tab=reconciliation');
    expect(routes.adminTrustSupportUrl('compliance')).toBe('https://slice.example/admin?section=support&tab=compliance');
    expect(routes.adminPlatformOperationsUrl('webhooks')).toBe('https://slice.example/admin?section=health&tab=webhooks');
  });

  it('only exposes the permitted staff shortcuts and uses the backend summary unchanged', () => {
    const payload = staffOperationsPayload(['ADMIN'], routes, {
      ok: true,
      value: {
        counts: { pendingReviews: 2, deliveredAwaitingReceipt: 3, verificationQueue: 4, valuationQueue: 5, marketplaceReady: 6, compliance: 7, alerts: 8 },
        memberships: { pastDue: 9 },
        support: { available: true, open: 10 },
      },
    });
    expect(JSON.stringify(payload)).toContain('Receipt required: **3**');
    expect(JSON.stringify(payload)).toContain('Open support tickets: **10**');
    expect(JSON.stringify(payload)).toContain('Finance & Trading');
    expect(JSON.stringify(staffOperationsPayload(['SUPPORT'], routes))).toContain('Trust & Support');
    expect(JSON.stringify(staffOperationsPayload(['SUPPORT'], routes))).not.toContain('Finance & Trading');
    expect(staffOperationsPayload(['COLLECTOR'], routes)).not.toHaveProperty('components');
  });

  it('keeps physical intake messaging distinct from receipt confirmation', () => {
    const payload = staffPanelPayload('physical-intake', routes);
    const serialized = JSON.stringify(payload);
    expect(serialized).toContain('Carrier delivery is not Slice receipt confirmation');
    expect(serialized).not.toContain('Received by Slice');
    expect(serialized).not.toContain('Confirm receipt');
  });
});
