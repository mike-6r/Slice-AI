import { describe, expect, it } from 'vitest';
import { CATEGORY_DEFINITIONS, CHANNEL_DEFINITIONS, ROLE_DEFINITIONS } from '../../src/setup/manifest.js';

describe('premium Discord server manifest', () => {
  it('defines the compact member-facing structure', () => {
    expect(CATEGORY_DEFINITIONS.map((category) => category.name)).toEqual([
      'START HERE', 'SLICE', 'COLLECTORS', 'COMMUNITY', 'SUPPORT', 'PRIVATE SUPPORT', 'STAFF',
    ]);
    expect(CHANNEL_DEFINITIONS.map((channel) => channel.name)).toEqual([
      '🔐・verify', '📌・welcome', '📣・announcements', '◈・my-slice', '📈・market', '🎛️・roles',
      '🗂️・collector-hub', '🏷️・list-a-collectible', '💬・general', '🔎・collectibles', '🎫・support',
      '🛡️・operations', '🧾・review-queue', '🎫・support-ops', '⚙️・bot-logs',
    ]);
  });

  it('keeps verification and private support as explicit access boundaries', () => {
    expect(CHANNEL_DEFINITIONS.find((channel) => channel.key === 'verify')).toMatchObject({ category: 'start', readOnly: true });
    expect(CATEGORY_DEFINITIONS.find((category) => category.key === 'private-support')).toMatchObject({ staff: true });
    expect(ROLE_DEFINITIONS.find((role) => role.key === 'verified')?.name).toBe('✓ Verified');
    expect(ROLE_DEFINITIONS.find((role) => role.key === 'administrator')?.name).toBe('Staff');
    expect(ROLE_DEFINITIONS.find((role) => role.key === 'owner')?.name).toBe('Admin');
  });

  it('keeps notification roles presentation-only and non-hoisted', () => {
    for (const key of ['new-listings', 'price-alerts', 'rare-cards', 'auctions', 'giveaways', 'news', 'market-summary', 'platform-updates']) {
      expect(ROLE_DEFINITIONS.find((role) => role.key === key)).toMatchObject({ hoist: false, mentionable: false, permissions: [] });
    }
    expect(CHANNEL_DEFINITIONS.find((channel) => channel.key === 'roles')).toMatchObject({ name: '🎛️・roles', category: 'slice', order: 5, readOnly: true });
  });

  it('keeps server-settings separator roles neutral and unassignable', () => {
    const separators = ROLE_DEFINITIONS.filter((role) => role.separator);
    expect(separators.map((role) => role.key)).toEqual(['separator-slice', 'separator-staff', 'separator-collectors', 'separator-access', 'separator-notifications', 'separator-community', 'separator-system']);
    for (const role of separators) expect(role).toMatchObject({ color: 0, hoist: false, mentionable: false, permissions: [] });
  });

  it('uses the premium hierarchy with only intentional sidebar groups', () => {
    expect(ROLE_DEFINITIONS.map((role) => role.name)).toEqual([
      'Slice', '──────── SLICE ────────', '──────── STAFF ────────', 'Admin', 'Staff', 'Reviewer', 'Support',
      '──────── COLLECTORS ────────', 'Verified Collector', 'Collector', '──────── ACCESS ────────', '✓ Verified',
      '──────── NOTIFICATIONS ────────', 'New Listings', 'Price Alerts', 'Rare Finds', 'Auctions', 'Giveaways', 'Slice News', 'Market Brief', 'Platform Updates',
      '──────── PROGRESSION ────────', 'Level 50', 'Level 30', 'Level 20', 'Level 10', 'Level 5', '──────── SYSTEM ────────', 'Restricted', 'Muted',
    ]);
    expect(ROLE_DEFINITIONS.filter((role) => role.hoist).map((role) => role.name)).toEqual(['Admin', 'Staff', 'Reviewer', 'Support', 'Verified Collector', 'Collector']);
    for (const role of ROLE_DEFINITIONS.filter((role) => ['✓ Verified', 'Restricted', 'Muted', 'Level 50', 'Level 30', 'Level 20', 'Level 10', 'Level 5'].includes(role.name))) expect(role).toMatchObject({ color: 0, hoist: false, mentionable: false, permissions: [] });
  });
});
