import type { NotificationDelivery, NotificationDeliveryChannel } from '@prisma/client';
export type NotificationTransportOutcome = { status: 'DELIVERED' | 'RETRYABLE_FAILURE' | 'NON_RETRYABLE_FAILURE' | 'SUPPRESSED'; code?: string };
export interface NotificationTransport { readonly channel: NotificationDeliveryChannel; deliver(delivery: NotificationDelivery): Promise<NotificationTransportOutcome>; }
