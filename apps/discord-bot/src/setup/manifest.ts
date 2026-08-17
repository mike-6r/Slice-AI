import { colorNumber, presentationConfig } from '../presentation-config.js';

export type RoleDefinition = { key: string; name: string; color: number; hoist?: boolean; mentionable?: boolean; staff?: boolean };
export type CategoryDefinition = { key: string; name: string; staff?: boolean };
export type ChannelDefinition = { key: string; name: string; category: string; kind?: 'text' | 'forum'; readOnly?: boolean; staff?: boolean; topic?: string };

function setup() { return presentationConfig()['setup.yml']; }
export const SLICE_DISCORD_SETUP_VERSION = setup().version;
export const ROLE_DEFINITIONS: RoleDefinition[] = setup().roles.map((role) => ({ key: role.key, name: role.name, color: colorNumber(role.color), hoist: role.hoist, mentionable: role.mentionable, staff: role.staff }));
export const CATEGORY_DEFINITIONS: CategoryDefinition[] = setup().categories.map((category) => ({ key: category.key, name: category.name, staff: category.staff }));
export const CHANNEL_DEFINITIONS: ChannelDefinition[] = setup().channels.map((channel) => ({ key: channel.key, name: channel.name, category: channel.category, kind: channel.type, readOnly: channel.read_only, staff: channel.staff, topic: channel.topic }));
export const PANEL_CHANNELS = Object.keys(setup().panels);

// These names were used by earlier Slice Discord setup versions and by the
// first manually-created server layout. They are intentionally limited to
// known Slice section names so reset can recover orphaned resources without
// treating arbitrary server channels as managed.
export const LEGACY_CATEGORY_NAMES: Record<string, string[]> = {
  start: ['01 - START', 'START HERE', '━━ START ━━', '━━ START HERE ━━'],
  slice: ['02 - SLICE PLATFORM', 'MY SLICE', '━━ SLICE ━━', '━━ SLICE PLATFORM ━━'],
  marketplace: ['03 - MARKETPLACE', 'MARKETPLACE', 'MARKET', '━━ MARKET ━━', '━━ MARKETPLACE ━━'],
  collectors: ['COLLECTORS', '━━ COLLECTORS ━━'],
  community: ['04 - COMMUNITY', 'COMMUNITY', '━━ COMMUNITY ━━'],
  support: ['05 - SUPPORT', 'SUPPORT', '━━ SUPPORT ━━'],
  staff: ['06 - STAFF OPS', 'STAFF OPS', 'STAFF / OPERATIONS', '━━ STAFF ━━', '━━ STAFF / OPERATIONS ━━'],
};

export const LEGACY_CHANNEL_NAMES: Record<string, string[]> = {
  staff: ['staff-hub'],
  operations: ['operations'],
  'compliance-alerts': ['compliance-alerts'],
  'support-log': ['support-log'],
  'moderation-log': ['moderation-log'],
  'bot-log': ['bot-log'],
  'provider-status': ['provider-status'],
};
