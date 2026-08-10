import { Injectable, NotFoundException } from '@nestjs/common';
import type { Notification } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

export type NotificationDto = Readonly<{
  id: string;
  topic: string;
  title: string;
  body: string;
  payloadVersion: 1;
  readAt: string | null;
  createdAt: string;
}>;

@Injectable()
export class NotificationService {
  constructor(private readonly db: PrismaService) {}

  async list(input: {
    userId: string;
    cursor?: string;
    limit: number;
    unreadOnly: boolean;
  }) {
    const before = input.cursor ? decodeCursor(input.cursor) : undefined;
    const rows = await this.db.notification.findMany({
      where: {
        userId: input.userId,
        ...(input.unreadOnly ? { readAt: null } : {}),
        ...(before
          ? {
              OR: [
                { createdAt: { lt: before.createdAt } },
                { createdAt: before.createdAt, id: { lt: before.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });
    const page = rows.slice(0, input.limit);
    return {
      items: page.map((row) => this.safe(row)),
      nextCursor:
        rows.length > input.limit && page.length
          ? encodeCursor(page.at(-1)!)
          : null,
    };
  }

  unreadCount(userId: string) {
    return this.db.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, notificationId: string) {
    const owned = await this.db.notification.findFirst({
      where: { id: notificationId, userId },
      select: { id: true },
    });
    if (!owned)
      throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND', message: 'Resource not found.' });
    const changed = await this.db.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    const row = await this.db.notification.findUniqueOrThrow({ where: { id: notificationId } });
    return { item: this.safe(row), changed: changed.count };
  }

  async markAllRead(userId: string) {
    const result = await this.db.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { readCount: result.count };
  }

  safe(row: Notification): NotificationDto {
    return {
      id: row.id,
      topic: row.type,
      title: row.title,
      body: row.body,
      payloadVersion: 1,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function encodeCursor(row: Pick<Notification, 'createdAt' | 'id'>) {
  return Buffer.from(
    JSON.stringify({ scope: 'notifications', createdAt: row.createdAt.toISOString(), id: row.id }),
  ).toString('base64url');
}

function decodeCursor(value: string) {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      scope?: unknown;
      createdAt?: unknown;
      id?: unknown;
    };
    const createdAt = new Date(typeof parsed.createdAt === 'string' ? parsed.createdAt : '');
    if (
      parsed.scope !== 'notifications' ||
      typeof parsed.id !== 'string' ||
      !parsed.id ||
      Number.isNaN(createdAt.getTime())
    )
      throw new Error();
    return { createdAt, id: parsed.id };
  } catch {
    throw new NotFoundException({ code: 'NOTIFICATION_CURSOR_INVALID', message: 'Resource not found.' });
  }
}
