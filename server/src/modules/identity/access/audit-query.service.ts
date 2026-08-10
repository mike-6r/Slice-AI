import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { redactAuditMetadata } from '../domain/audit';
import {
  ACCOUNT_STATUS_HISTORY_REPOSITORY,
  AUDIT_EVENT_REPOSITORY,
  type AccountStatusHistoryRepository,
  type AuditEventRepository,
} from '../ports/repositories';
import type { Actor } from '../auth/auth.service';
import { AuthorizationService } from './authorization.service';

@Injectable()
export class AuditQueryService {
  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly audit: AuditEventRepository,
    @Inject(ACCOUNT_STATUS_HISTORY_REPOSITORY)
    private readonly statusHistories: AccountStatusHistoryRepository,
    private readonly authorization: AuthorizationService,
  ) {}

  async query(
    actor: Actor,
    input: {
      action?: string;
      actorId?: string;
      subjectType?: string;
      subjectId?: string;
      from?: Date;
      to?: Date;
      cursor?: string;
      limit: number;
    },
  ) {
    await this.authorization.authorize(actor, 'audit.read');
    const before = input.cursor ? decodeCursor(input.cursor) : undefined;
    const events = await this.audit.query({
      action: input.action,
      actorUserId: input.actorId as never,
      resourceType: input.subjectType,
      resourceId: input.subjectId,
      from: input.from,
      to: input.to,
      before,
      limit: input.limit + 1,
    });
    const page = events.slice(0, input.limit).map((event) => ({
      id: event.id,
      action: event.action,
      actorUserId: event.actorUserId,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      requestId: event.requestId,
      sessionId: event.sessionId,
      result: event.result,
      metadata: redactAuditMetadata(event.metadata),
      createdAt: event.createdAt.toISOString(),
    }));
    return {
      items: page,
      nextCursor:
        events.length > input.limit
          ? encodeCursor(page.at(-1)!.createdAt, page.at(-1)!.id)
          : null,
    };
  }

  async statusHistory(
    actor: Actor,
    userId: string,
    cursor: string | undefined,
    limit: number,
  ) {
    await this.authorization.authorize(actor, 'audit.read');
    const histories = await this.statusHistories.listForUser(userId as never);
    const before = cursor ? decodeCursor(cursor) : undefined;
    const matching = before
      ? histories.filter(
          (history) =>
            history.createdAt < before.createdAt ||
            (history.createdAt.getTime() === before.createdAt.getTime() &&
              history.id < before.id),
        )
      : histories;
    const items = matching.slice(0, limit);
    return {
      items,
      nextCursor:
        matching.length > limit
          ? encodeCursor(
              items.at(-1)!.createdAt.toISOString(),
              items.at(-1)!.id,
            )
          : null,
    };
  }
}

function encodeCursor(createdAt: string, id: string) {
  return Buffer.from(JSON.stringify({ createdAt, id })).toString('base64url');
}
function decodeCursor(value: string) {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    decoded = null;
  }
  const candidate = decoded as { createdAt?: unknown; id?: unknown } | null;
  const date = new Date(
    typeof candidate?.createdAt === 'string' ? candidate.createdAt : '',
  );
  if (
    Number.isNaN(date.getTime()) ||
    typeof candidate?.id !== 'string' ||
    !candidate.id
  ) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
    });
  }
  return { createdAt: date, id: candidate.id };
}
