import { colorNumber, presentationConfig } from '../presentation-config.js';
import type { PermissionResolvable } from 'discord.js';

export type RoleDefinition = { key: string; name: string; color: number; hoist?: boolean; mentionable?: boolean; staff?: boolean; permissions?: PermissionResolvable[] };
export type CategoryDefinition = { key: string; name: string; staff?: boolean };
export type ChannelDefinition = { key: string; name: string; category: string; kind?: 'text' | 'forum'; order?: number; readOnly?: boolean; staff?: boolean; slowmode?: number; topic?: string };

function setup() { return presentationConfig()['setup.yml']; }
export const SLICE_DISCORD_SETUP_VERSION = setup().version;
export const ROLE_DEFINITIONS: RoleDefinition[] = setup().roles.map((role) => ({ key: role.key, name: role.name, color: colorNumber(role.color), hoist: role.hoist, mentionable: role.mentionable, staff: role.staff, permissions: role.permissions as PermissionResolvable[] }));
export const CATEGORY_DEFINITIONS: CategoryDefinition[] = setup().categories.map((category) => ({ key: category.key, name: category.name, staff: category.staff }));
export const CHANNEL_DEFINITIONS: ChannelDefinition[] = setup().channels.map((channel) => ({ key: channel.key, name: channel.name, category: channel.category, kind: channel.type, order: channel.order, readOnly: channel.read_only, staff: channel.staff, slowmode: channel.slowmode, topic: channel.topic }));
export const PANEL_CHANNELS = Object.keys(setup().panels).filter((key) => CHANNEL_DEFINITIONS.some((channel) => channel.key === key));

export const LEGACY_ROLE_NAMES: Record<string, string[]> = {
  owner: ['Owner'],
  administrator: ['Administrator'],
  operations: ['Operations Lead'],
  support: ['Support Team'],
  verified: ['Verified Member'],
  'slice-member': ['Slice Member'],
};

// These names were used by earlier Slice Discord setup versions and by the
// first manually-created server layout. They are intentionally limited to
// known Slice section names so reset can recover orphaned resources without
// treating arbitrary server channels as managed.
export const LEGACY_CATEGORY_NAMES: Record<string, string[]> = {
  start: ['01 - START', 'START HERE', '━━ START ━━', '━━ START HERE ━━'],
  slice: ['02 - SLICE PLATFORM', '02 - MY SLICE', '03 - MARKET', '03 - MARKETPLACE', 'MY SLICE', 'MARKET', 'MARKETPLACE', '━━ SLICE ━━', '━━ SLICE PLATFORM ━━', '━━ MARKET ━━', '━━ MARKETPLACE ━━'],
  collectors: ['04 - COLLECTORS', 'COLLECTORS', '━━ COLLECTORS ━━'],
  community: ['04 - COMMUNITY', '05 - COMMUNITY', 'COMMUNITY', '━━ COMMUNITY ━━'],
  support: ['05 - SUPPORT', '06 - SUPPORT', 'SUPPORT', '━━ SUPPORT ━━'],
  'private-support': ['PRIVATE SUPPORT', '━━ PRIVATE SUPPORT ━━'],
  staff: ['06 - STAFF OPS', '07 - STAFF / OPERATIONS', 'STAFF OPS', 'STAFF / OPERATIONS', '━━ STAFF ━━', '━━ STAFF / OPERATIONS ━━'],
};

export const LEGACY_CHANNEL_NAMES: Record<string, string[]> = {
  welcome: ['welcome'],
  verify: ['verify'],
  announcements: ['announcements'],
  'my-slice': ['my-slice'],
  'market-feed': ['market-feed'],
  'collector-workspace': ['collector-workspace'],
  'list-a-collectible': ['list-a-collectible'],
  general: ['general'],
  collecting: ['collecting', 'pokemon-tcg'],
  'create-a-ticket': ['create-a-ticket'],
  operations: ['operations', 'asset-operations', 'ops-center'],
  'moderation-log': ['moderation-log', 'review-queue'],
  'support-log': ['support-log', 'support-queue', 'support-ops'],
  'bot-log': ['bot-log', 'system-alerts', 'bot-logs'],
};
