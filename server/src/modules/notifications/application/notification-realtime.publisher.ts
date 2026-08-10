import { Injectable, Logger } from '@nestjs/common';
import { Observable, type Subscriber } from 'rxjs';

export type NotificationRealtimeEvent = Readonly<{
  type: 'notification.created' | 'heartbeat';
  data: Record<string, unknown>;
}>;

let failureHook: (() => void | Promise<void>) | undefined;

/** Test-only seam: realtime failure must never undo a durable notification. */
export function setNotificationRealtimeTestFailureHook(
  next: (() => void | Promise<void>) | undefined,
) {
  failureHook = next;
}

/**
 * Single-instance best-effort fanout. PostgreSQL remains authoritative; clients
 * reconnect and refetch after process restart or a missed event.
 */
@Injectable()
export class NotificationRealtimePublisher {
  private readonly logger = new Logger(NotificationRealtimePublisher.name);
  private readonly subscribers = new Map<
    string,
    Set<Subscriber<NotificationRealtimeEvent>>
  >();

  subscribe(userId: string): Observable<NotificationRealtimeEvent> {
    return new Observable((subscriber) => {
      const userSubscribers = this.subscribers.get(userId) ?? new Set();
      if (userSubscribers.size >= 10) {
        subscriber.error(new Error('NOTIFICATION_STREAM_LIMIT_REACHED'));
        return undefined;
      }
      userSubscribers.add(subscriber);
      this.subscribers.set(userId, userSubscribers);
      const heartbeat = setInterval(() => {
        subscriber.next({ type: 'heartbeat', data: { version: 1 } });
      }, 25_000);
      return () => {
        clearInterval(heartbeat);
        userSubscribers.delete(subscriber);
        if (userSubscribers.size === 0) this.subscribers.delete(userId);
      };
    });
  }

  async publishCreated(
    userId: string,
    notification: {
      id: string;
      topic: string;
      title: string;
      body: string;
      createdAt: string;
    },
  ) {
    try {
      await failureHook?.();
      const event: NotificationRealtimeEvent = {
        type: 'notification.created',
        data: { version: 1, notification },
      };
      for (const subscriber of this.subscribers.get(userId) ?? []) {
        subscriber.next(event);
      }
    } catch {
      this.logger.warn({ userId, notificationId: notification.id }, 'Notification realtime publish failed');
    }
  }
}
