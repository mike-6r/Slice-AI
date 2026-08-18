import { describe, expect, it } from 'vitest';
import { SliceEmbed } from '../../src/embeds/slice-embed.js';
import { presentationConfig } from '../../src/presentation-config.js';
import { PANEL_CHANNELS } from '../../src/setup/manifest.js';

describe('Slice premium visual system', () => {
  it('uses the configured restrained palette and standard footer', () => {
    const branding = presentationConfig()['branding.yml'];
    expect(branding.colors.info).toBe('#3CCFB4');
    expect(branding.colors.staff).toBe('#6F8FA6');
    expect(SliceEmbed.info('Updated', 'Your preferences were saved.').toJSON().footer?.text).toBe(branding.footer.text);
  });

  it('requires and renders a single compact permanent panel per panel channel', () => {
    const setup = presentationConfig()['setup.yml'];
    expect(PANEL_CHANNELS).toEqual(expect.arrayContaining(['verify', 'welcome', 'announcements', 'my-slice', 'market-feed', 'roles', 'collector-workspace', 'list-a-collectible', 'create-a-ticket', 'operations', 'moderation-log', 'support-log', 'bot-log']));
    const panel = SliceEmbed.panel(setup.panels.verify).toJSON();
    expect(panel.description).toContain('SLICE ACCESS');
    expect(panel.timestamp).toBeUndefined();
  });

  it('keeps select-driven support safely within Discord limits', () => {
    const tickets = presentationConfig()['tickets.yml'];
    expect(tickets.support_panel?.categories).toEqual(['account-issues', 'seller-support', 'marketplace-issue', 'withdrawal', 'technical-issue', 'report-user', 'general-support']);
  });
});
