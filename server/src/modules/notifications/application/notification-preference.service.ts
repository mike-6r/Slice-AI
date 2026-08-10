import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type NotificationDeliveryChannel } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { fingerprintRequest } from '../../identity/domain/idempotency';
import type { Actor } from '../../identity/auth/auth.service';
import { AuthAbuseService } from '../../identity/auth/auth-abuse.service';

export const customerNotificationTopics = [
  'ORDER_UPDATES',
  'PORTFOLIO_UPDATES',
] as const;

export type CustomerNotificationTopic =
  (typeof customerNotificationTopics)[number];

export type CustomerNotificationPreferencesDto = Readonly<{
  preferences: ReadonlyArray<
    Readonly<{
      topic: CustomerNotificationTopic;
      channel: 'IN_APP';
      enabled: boolean;
    }>
  >;
}>;

@Injectable()
export class NotificationPreferenceService {
  constructor(
    private readonly db: PrismaService,
    private readonly abuse: AuthAbuseService,
  ) {}

  async get(userId: string): Promise<CustomerNotificationPreferencesDto> {
    return this.read(userId);
  }

  async update(
    actor: Actor,
    input: ReadonlyArray<
      Readonly<{ topic: CustomerNotificationTopic; enabled: boolean }>
    >,
    ip: string,
    requestId: string,
    idempotencyKey: string,
  ): Promise<CustomerNotificationPreferencesDto> {
    await this.abuse.enforce('notification-preferences', ip, actor.userId);
    const normalized = normalize(input);
    const requestHash = fingerprintRequest(
      'PATCH',
      '/v1/me/notifications/preferences',
      normalized,
    );
    const identity = {
      actorScope: `user:${actor.userId}`,
      scope: 'notification.preferences.update',
      key: idempotencyKey,
    };

    return this.db.$transaction(async (tx) => {
      const existing = await tx.idempotencyRecord.findUnique({
        where: { actorScope_scope_key: identity },
      });
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_CONFLICT',
            message: 'The request key cannot be reused for this operation.',
          });
        if (existing.status === 'PROCESSING')
          throw new ConflictException({
            code: 'PERSISTENCE_CONFLICT',
            message: 'The request is already in progress. Please retry.',
          });
        return parseStored(existing.responseBody);
      }

      await tx.idempotencyRecord.create({
        data: {
          ...identity,
          requestHash,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      for (const preference of normalized) {
        await tx.notificationPreference.upsert({
          where: {
            userId_topic_channel: {
              userId: actor.userId,
              topic: preference.topic,
              channel: 'IN_APP' satisfies NotificationDeliveryChannel,
            },
          },
          create: {
            userId: actor.userId,
            topic: preference.topic,
            channel: 'IN_APP',
            enabled: preference.enabled,
          },
          update: { enabled: preference.enabled },
        });
      }
      const result = await this.read(actor.userId, tx);
      await tx.auditEvent.create({
        data: {
          id: randomUUID(),
          actorUserId: actor.userId,
          actorType: 'USER',
          action: 'NOTIFICATION_PREFERENCES_UPDATED',
          resourceType: 'notification-preferences',
          resourceId: actor.userId,
          requestId,
          sessionId: actor.sessionId,
          result: 'SUCCESS',
          metadata: {
            changedTopics: normalized.map((preference) => preference.topic),
          },
        },
      });
      await tx.idempotencyRecord.update({
        where: { actorScope_scope_key: identity },
        data: {
          status: 'COMPLETED',
          responseStatus: 200,
          responseBody: result as unknown as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
      return result;
    });
  }

  private async read(
    userId: string,
    client: Pick<PrismaService, 'notificationPreference'> = this.db,
  ): Promise<CustomerNotificationPreferencesDto> {
    const rows = await client.notificationPreference.findMany({
      where: {
        userId,
        channel: 'IN_APP',
        topic: { in: [...customerNotificationTopics] },
      },
      select: { topic: true, enabled: true },
    });
    const configured = new Map(rows.map((row) => [row.topic, row.enabled]));
    return {
      preferences: customerNotificationTopics.map((topic) => ({
        topic,
        channel: 'IN_APP' as const,
        enabled: configured.get(topic) ?? true,
      })),
    };
  }
}

function normalize(
  input: ReadonlyArray<
    Readonly<{ topic: CustomerNotificationTopic; enabled: boolean }>
  >,
) {
  return customerNotificationTopics
    .flatMap((topic) =>
      input.filter((preference) => preference.topic === topic).slice(0, 1),
    )
    .map((preference) => ({
      topic: preference.topic,
      enabled: preference.enabled,
    }));
}

function parseStored(
  value: Prisma.JsonValue | null,
): CustomerNotificationPreferencesDto {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Stored notification preference replay is invalid.');
  const preferences = (value as { preferences?: unknown }).preferences;
  if (!Array.isArray(preferences))
    throw new Error('Stored notification preference replay is invalid.');
  return {
    preferences: preferences.map((preference) => {
      if (
        !preference ||
        typeof preference !== 'object' ||
        Array.isArray(preference)
      )
        throw new Error('Stored notification preference replay is invalid.');
      const row = preference as {
        topic?: unknown;
        channel?: unknown;
        enabled?: unknown;
      };
      if (
        !customerNotificationTopics.includes(
          row.topic as CustomerNotificationTopic,
        ) ||
        row.channel !== 'IN_APP' ||
        typeof row.enabled !== 'boolean'
      )
        throw new Error('Stored notification preference replay is invalid.');
      return {
        topic: row.topic as CustomerNotificationTopic,
        channel: 'IN_APP' as const,
        enabled: row.enabled,
      };
    }),
  };
}
