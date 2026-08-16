import { describe, expect, it } from 'vitest';
import { orderPayload } from '../../src/discord-delivery-worker.js';
import { SliceCustomerRouteBuilder } from '../../src/customer-routes.js';

describe('customer Discord delivery rendering', () => {
  const delivery = { deliveryId: 'delivery-1', eventId: 'event-1', claimToken: 'claim-1', discordUserId: 'discord-user', category: 'ORDERS' as const, eventType: 'order.opened' as const, occurredAt: '2026-08-16T12:00:00.000Z', order: { id: 'order-1', assetTitle: 'Umbreon VMAX', side: 'BUY' as const, units: '1', limitPriceMinor: '164', currency: 'GBP' as const, status: 'OPEN' as const } };
  it('renders a compact private order notification with only a safe internal deep link', () => { const rendered = JSON.stringify(orderPayload(delivery, new SliceCustomerRouteBuilder('https://slice.example'))); expect(rendered).toContain('Order opened'); expect(rendered).toContain('Umbreon VMAX'); expect(rendered).toContain('GBP 1.64'); expect(rendered).toContain('https://slice.example/orders/order-1'); expect(rendered).not.toContain('discord-user'); });
  it('does not emit a button without an approved web origin and distinguishes cancellation', () => { expect(JSON.stringify(orderPayload(delivery, new SliceCustomerRouteBuilder()))).not.toContain('View Order'); expect(JSON.stringify(orderPayload({ ...delivery, order: { ...delivery.order, status: 'CANCELLED' } }, new SliceCustomerRouteBuilder('https://slice.example')))).toContain('Order cancelled'); });
});
