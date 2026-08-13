import { presentationConfig } from './presentation-config.js';

export const NOTIFICATION_ROLE_KEYS = [
  'new-listings',
  'price-alerts',
  'rare-cards',
  'auctions',
  'giveaways',
  'news',
  'market-summary',
  'platform-updates',
] as const;

export type NotificationRoleKey = (typeof NOTIFICATION_ROLE_KEYS)[number];

export function isNotificationRoleKey(value: string): value is NotificationRoleKey {
  return (NOTIFICATION_ROLE_KEYS as readonly string[]).includes(value);
}

export type SliceDestination =
  | 'account'
  | 'marketplace'
  | 'portfolio'
  | 'orders'
  | 'transactions'
  | 'collector-workspace'
  | 'your-actions'
  | 'membership'
  | 'list'
  | 'admin-console';

const destinationPaths: Record<SliceDestination, string> = {
  account: '/account',
  marketplace: '/marketplace',
  portfolio: '/portfolio',
  orders: '/orders',
  transactions: '/portfolio',
  'collector-workspace': '/collector-workspace',
  'your-actions': '/collector-workspace',
  membership: '/collector-workspace',
  list: '/list',
  'admin-console': '/admin',
};

export type WebsiteHandoff =
  | { available: true; url: string }
  | { available: false; message: string };

/**
 * Discord never receives a Slice session or credentials. It only sends a member
 * to the authenticated Slice website, where account linking and every private
 * product decision remain server-authoritative.
 */
export class SliceWebsiteHandoffClient {
  constructor(private readonly webBaseUrl?: string) {}

  handoff(destination: SliceDestination): WebsiteHandoff {
    if (!this.webBaseUrl) {
      return {
        available: false,
        message: 'Slice website handoff is not configured for Discord yet.',
      };
    }

    return {
      available: true,
      url: new URL(destinationPaths[destination], this.webBaseUrl).toString(),
    };
  }
}

export const FAQ: Record<string, string> = presentationConfig()['onboarding.yml'].faq;
