import { describe, expect, it } from 'vitest';
import { SliceCustomerRouteBuilder } from '../../src/customer-routes.js';
import { connectPayload, mySliceActionsPayload, mySlicePayload } from '../../src/my-slice.js';

const routes = new SliceCustomerRouteBuilder('https://slice.example');

describe('My Slice panel', () => {
  it('shows a credential-free connect state when no account is linked', () => {
    expect(JSON.stringify(mySlicePayload({ ok: true, value: { linked: false } }, routes))).toContain('Connect Slice Account');
    expect(JSON.stringify(connectPayload())).not.toContain('Portfolio Value');
  });

  it('renders a private customer panel for an investor, including staff users', () => {
    const payload = mySlicePayload({ ok: true, value: {
      linked: true,
      identity: { username: 'slice-demo', displayName: 'Slice Demo', preferredCurrency: 'GBP', capabilities: { investor: true, collector: false } },
      portfolio: { currency: 'GBP', estimatedPortfolioValueMinor: '123456', estimatedHoldingsValueMinor: '100000', availableCashMinor: '23456', reservedCashMinor: '1000', holdings: 2, valuationStatus: 'AVAILABLE' },
      orders: { openCount: 1, recent: [{ assetTitle: 'Modern collectible', assetSlug: 'modern', side: 'BUY', status: 'OPEN', remainingUnits: '2', filledUnits: '0', limitPriceMinor: '5000', currency: 'GBP' }] },
      collector: null,
    } }, routes);
    const rendered = JSON.stringify(payload);
    expect(rendered).toContain('@slice-demo');
    expect(rendered).toContain('GBP 1,234.56');
    expect(rendered).toContain('Open orders: **1**');
    expect(rendered).not.toContain('Admin');
  });

  it('adds Collector usage and current authoritative actions without unsafe URLs', () => {
    const collector = mySlicePayload({ ok: true, value: {
      linked: true,
      identity: { username: 'collector', displayName: null, preferredCurrency: 'USD', capabilities: { investor: true, collector: true } },
      portfolio: null,
      orders: null,
      collector: { collectibles: 14, marketLive: 2, inReview: 1, openActionCount: 1, membership: { planName: 'Collector Pro', status: 'ACTIVE', activeCollectibles: 14, maxActiveCollectibles: 50, monthlySubmissions: 2, monthlyLimit: 20, concurrentIntake: 1, concurrentIntakeLimit: 2 } },
    } }, routes);
    expect(JSON.stringify(collector)).toContain('14 / 50 collectibles');
    const actions = mySliceActionsPayload({ ok: true, value: [{ id: 'action', title: 'Modern collectible', grade: null, type: 'ADD_TRACKING', message: 'Add tracking', actionUrl: 'https://outside.example' }] }, routes);
    expect(JSON.stringify(actions)).not.toContain('outside.example');
    expect(JSON.stringify(mySliceActionsPayload({ ok: true, value: [] }, routes))).toContain("You're all caught up");
  });
});
