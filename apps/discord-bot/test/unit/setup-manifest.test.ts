import { describe, expect, it } from 'vitest';
import { CATEGORY_DEFINITIONS, CHANNEL_DEFINITIONS, ROLE_DEFINITIONS } from '../../src/setup/manifest.js';

describe('premium Discord server manifest', () => {
  it('defines the compact member-facing structure', () => {
    expect(CATEGORY_DEFINITIONS.map((category) => category.name)).toEqual([
      'START HERE', 'SLICE', 'COLLECTORS', 'COMMUNITY', 'SUPPORT', 'PRIVATE SUPPORT', 'STAFF',
    ]);
    expect(CHANNEL_DEFINITIONS.map((channel) => channel.name)).toEqual([
      '🔐・verify', '📌・welcome', '📣・announcements', '◈・my-slice', '📈・market',
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
});
