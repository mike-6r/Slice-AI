import { describe, expect, it } from 'vitest';
import { setupCommand, setupStatusPayload, setupUpdatePreviewPayload } from '../../src/commands/setup.js';

describe('setup status refresh', () => {
  it('registers a non-destructive refresh command', () => {
    const options = setupCommand.toJSON().options ?? [];
    expect(options.map((option) => option.name)).toContain('refresh');
  });

  it('reports structure and drift separately without an apply action', () => {
    const payload = setupStatusPayload({ version: 15, configured: true, plan: { missingRoles: 1, missingCategories: 2, missingChannels: 3, missingPanels: 4, renamed: 5, moved: 6, permissionDrift: 7, roleDrift: 8, separatorDrift: 9, staleReferences: 10, ambiguous: ['channel:roles'], updateAvailable: false, artworkMissing: 0 } });
    const embed = payload.embeds[0]?.toJSON();
    expect(embed?.fields?.map((field) => field.name)).toEqual(['SERVER STRUCTURE', 'PERSISTENCE', 'ROLE AUDIT', 'DRIFT', 'OVERALL']);
    expect(payload.components[0]?.components[0]?.data.custom_id).toBe('slice:setup:refresh');
  });

  it('visibly acknowledges a completed read-only refresh', () => {
    const payload = setupStatusPayload({ version: 15, configured: true, plan: { missingRoles: 0, missingCategories: 0, missingChannels: 0, missingPanels: 0, renamed: 0, moved: 0, permissionDrift: 0, roleDrift: 0, separatorDrift: 0, staleReferences: 0, ambiguous: [], updateAvailable: false, artworkMissing: 0 } }, true);
    expect(payload.embeds[0]?.toJSON().description).toContain('Status refreshed just now');
  });

  it('turns an update review into a confirmation-gated repair preview', () => {
    const payload = setupUpdatePreviewPayload({ missingRoles: 1, missingCategories: 2, missingChannels: 3, missingPanels: 4, renamed: 5, moved: 6, permissionDrift: 7, roleDrift: 8, separatorDrift: 9, staleReferences: 10, ambiguous: [], updateAvailable: true, artworkMissing: 0 }, 'guild-1', 'admin-1');
    expect(payload.embeds[0]?.toJSON().description).toContain('No Discord changes have been made');
    expect(payload.components[0]?.components[0]?.data.custom_id).toMatch(/^slice:setup:apply:/);
  });
});
