import { presentationConfig } from './presentation-config.js';

export const NOTIFICATION_ROLE_KEYS = ['new-listings', 'price-alerts', 'rare-cards', 'auctions', 'giveaways', 'news', 'market-summary', 'platform-updates'] as const;
export type NotificationRoleKey = typeof NOTIFICATION_ROLE_KEYS[number];
export function isNotificationRoleKey(value: string): value is NotificationRoleKey { return (NOTIFICATION_ROLE_KEYS as readonly string[]).includes(value); }
export type AccountState = { link: 'CONNECTED' | 'NOT_CONNECTED' | 'BACKEND_SEAM_REQUIRED'; verification: 'VERIFIED' | 'PENDING' | 'ACTION_REQUIRED' | 'REVIEW' | 'UNAVAILABLE'; memberSince?: Date };
export interface SliceAccountLinkClient { createLinkChallenge(input: { discordUserId: string; guildId: string }): Promise<{ status: 'BACKEND_SEAM_REQUIRED'; message: string } | { status: 'READY'; url: string; expiresAt: Date }>; getLinkStatus(discordUserId: string): Promise<AccountState>; unlinkAccount(discordUserId: string): Promise<{ status: 'BACKEND_SEAM_REQUIRED' }>; }
export class BackendSeamAccountLinkClient implements SliceAccountLinkClient {
  async createLinkChallenge(input: { discordUserId: string; guildId: string }): Promise<{ status: 'BACKEND_SEAM_REQUIRED'; message: string }> { void input; return { status: 'BACKEND_SEAM_REQUIRED', message: 'Secure Discord link endpoints are not available from Slice yet.' }; }
  async getLinkStatus(discordUserId: string): Promise<AccountState> { void discordUserId; return { link: 'BACKEND_SEAM_REQUIRED', verification: 'UNAVAILABLE' }; }
  async unlinkAccount(discordUserId: string): Promise<{ status: 'BACKEND_SEAM_REQUIRED' }> { void discordUserId; return { status: 'BACKEND_SEAM_REQUIRED' }; }
}
export const FAQ: Record<string, string> = presentationConfig()['onboarding.yml'].faq;
