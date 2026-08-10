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
