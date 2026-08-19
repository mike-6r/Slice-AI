import { describe, expect, it } from 'vitest';
import { handleSetupButton, setupCommand, setupResetPreviewPayload, setupStatusPayload, setupUpdatePreviewPayload } from '../../src/commands/setup.js';

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

  it('shows manually discovered Slice layout candidates before destructive reset', () => {
    const payload = setupResetPreviewPayload({ managedRoles: 5, managedCategories: 3, managedChannels: 12, panels: 3, ticketChannels: 2, setupMetadata: true, manuallyDiscoveredRoles: ['Moderator'], manuallyDiscoveredCategories: ['05 - SUPPORT'], manuallyDiscoveredChannels: ['legacy-ticket-panel'] }, 'reset-nonce');
    const description = payload.embeds[0]?.toJSON().description;
    expect(description).toContain('Recognized hand-built Slice resources');
    expect(description).toContain('Moderator');
    expect(description).toContain('05 - SUPPORT');
    expect(payload.components[0]?.components[0]?.data.custom_id).toBe('slice:setup:reset:reset-nonce');
  });

  it('reports protected Discord community resources without failing a reset', async () => {
    const preview = setupUpdatePreviewPayload({ missingRoles: 0, missingCategories: 0, missingChannels: 0, missingPanels: 0, renamed: 0, moved: 0, permissionDrift: 0, roleDrift: 0, separatorDrift: 0, staleReferences: 0, ambiguous: [], updateAvailable: false, artworkMissing: 0 }, 'guild-reset', 'admin-reset');
    const applyId = preview.components[0]?.components[0]?.data.custom_id;
    if (!applyId) throw new Error('reset test preview did not include an apply action');
    const result = await handleSetupButton(applyId.replace(':apply:', ':reset:'), 'admin-reset', 'guild-reset', { apply: async () => ({ created: 0, updated: 0 }), reset: async () => ({ deletedRoles: 1, deletedCategories: 2, deletedChannels: 3, deletedPanels: 4, deletedTicketChannels: 5, skippedCommunityResources: 1 }) });
    expect(result.title).toBe('Slice setup reset partially complete');
    expect(result.body).toContain('protected **1** community-required resource');
  });
});
