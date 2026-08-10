import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../identity/auth/access-token.guard';
import { IdempotencyCoordinator } from '../identity/auth/idempotency-coordinator';
@Controller()
export class ReadsController {
  constructor(
    private readonly db: PrismaService,
    private readonly idempotency: IdempotencyCoordinator,
  ) {}
  @Get('collectors') async collectors(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const before = parseCursor(cursor, 'collectors');
    const pageSize = parseLimit(limit);
    const rows = await this.db.publicCollectorProfile.findMany({
      where: {
        isPublic: true,
        ...(before
          ? {
              OR: [
                { createdAt: { lt: before.createdAt } },
                { createdAt: before.createdAt, userId: { lt: before.id } },
              ],
            }
          : {}),
      },
      include: { user: { include: { profile: true } } },
      orderBy: [{ createdAt: 'desc' }, { userId: 'desc' }],
      take: pageSize + 1,
    });
    return {
      items: rows.slice(0, pageSize).map((x) => ({
        slug: x.slug,
        headline: x.headline,
        specialism: x.specialism,
        displayName: x.user.profile?.displayName ?? null,
      })),
      nextCursor:
        rows.length > pageSize
          ? makeCursor(
              'collectors',
              rows[pageSize - 1]!.createdAt,
              rows[pageSize - 1]!.userId,
            )
          : null,
    };
  }
  @Get('collectors/:slug') async collector(@Param('slug') slug: string) {
    const x = await this.db.publicCollectorProfile.findFirst({
      where: { slug, isPublic: true },
      include: { user: { include: { profile: true } } },
    });
    return x
      ? {
          slug: x.slug,
          headline: x.headline,
          specialism: x.specialism,
          displayName: x.user.profile?.displayName ?? null,
        }
      : { error: 'COLLECTOR_NOT_FOUND' };
  }
  @Get('vault/events') async vault(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const before = parseCursor(cursor, 'vault-events');
    const pageSize = parseLimit(limit);
    const rows = await this.db.vaultPublicEvent.findMany({
      where: {
        status: 'PUBLISHED',
        ...(before
          ? {
              OR: [
                { occurredAt: { lt: before.createdAt } },
                { occurredAt: before.createdAt, id: { lt: before.id } },
              ],
            }
          : {}),
      },
      include: { asset: true },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: pageSize + 1,
    });
    return {
      items: rows.slice(0, pageSize).map((x) => ({
        id: x.id,
        type: x.type,
        occurredAt: x.occurredAt.toISOString(),
        publicSummary: x.publicSummary,
        assetSlug: x.asset.slug,
      })),
      nextCursor:
        rows.length > pageSize
          ? makeCursor(
              'vault-events',
              rows[pageSize - 1]!.occurredAt,
              rows[pageSize - 1]!.id,
            )
          : null,
    };
  }
  @Get('vault/summary') async vaultSummary() {
    return {
      authority: 'UNAVAILABLE_UNTIL_CUSTODY',
      eventCount: await this.db.vaultPublicEvent.count({
        where: { status: 'PUBLISHED' },
      }),
    };
  }
  @Get('me/watchlist') @UseGuards(AccessTokenGuard) async list(
    @Req() req: AuthenticatedRequest,
    @Query('cursor') cursor?: string,
  ) {
    const before = parseCursor(cursor, 'watchlist');
    const rows = await this.db.watchlistItem.findMany({
      where: {
        userId: req.actor!.userId,
        ...(before
          ? {
              OR: [
                { createdAt: { lt: before.createdAt } },
                { createdAt: before.createdAt, assetId: { lt: before.id } },
              ],
            }
          : {}),
      },
      include: { asset: true },
      orderBy: [{ createdAt: 'desc' }, { assetId: 'desc' }],
      take: 101,
    });
    const items = rows.slice(0, 100).map((x) => ({
      assetId: x.asset.publicId,
      slug: x.asset.slug,
      createdAt: x.createdAt.toISOString(),
    }));
    return {
      items,
      nextCursor:
        rows.length > 100
          ? makeCursor('watchlist', rows[99]!.createdAt, rows[99]!.assetId)
          : null,
    };
  }
  @Put('me/watchlist/:assetId') @UseGuards(AccessTokenGuard) async add(
    @Req() req: AuthenticatedRequest,
    @Param('assetId') assetId: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.mutate(
      req,
      key,
      'watchlist.add',
      'PUT',
      `/v1/me/watchlist/${assetId}`,
      { assetId },
      async () => {
        const asset = await this.db.asset.findFirst({
          where: {
            OR: [{ id: assetId }, { publicId: assetId }],
            status: 'PUBLISHED',
          },
        });
        if (!asset)
          throw new BadRequestException({
            code: 'ASSET_NOT_FOUND',
            message: 'Resource not found.',
          });
        await this.db.watchlistItem.upsert({
          where: {
            userId_assetId: { userId: req.actor!.userId, assetId: asset.id },
          },
          create: { userId: req.actor!.userId, assetId: asset.id },
          update: {},
        });
        return { assetId: asset.publicId, watched: true };
      },
    );
  }
  @Delete('me/watchlist/:assetId') @UseGuards(AccessTokenGuard) async remove(
    @Req() req: AuthenticatedRequest,
    @Param('assetId') assetId: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.mutate(
      req,
      key,
      'watchlist.remove',
      'DELETE',
      `/v1/me/watchlist/${assetId}`,
      { assetId },
      async () => {
        const asset = await this.db.asset.findFirst({
          where: { OR: [{ id: assetId }, { publicId: assetId }] },
        });
        if (asset)
          await this.db.watchlistItem.deleteMany({
            where: { userId: req.actor!.userId, assetId: asset.id },
          });
        return { assetId, watched: false };
      },
    );
  }
  private async mutate(
    req: AuthenticatedRequest,
    key: string | undefined,
    scope: string,
    method: string,
    path: string,
    body: Record<string, unknown>,
    execute: () => Promise<Record<string, unknown>>,
  ) {
    if (!key)
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header is required.',
      });
    const result = await this.idempotency.run(
      { actorScope: `user:${req.actor!.userId}`, scope, key },
      method,
      path,
      body,
      async (tx) => {
        const value = await execute();
        const action = scope.toUpperCase();
        const metadata = action.startsWith('WATCHLIST')
          ? { assetId: String(body.assetId) }
          : action === 'NOTIFICATION.READ'
            ? { notificationId: String(body.id) }
            : { affectedCount: Number(value.readCount ?? 0) };
        await tx.audit.append({
          id: randomUUID(),
          actorUserId: req.actor!.userId as never,
          actorType: 'USER',
          action,
          resourceType: scope.split('.')[0],
          resourceId: String(body.assetId ?? body.id ?? 'self'),
          requestId: req.requestId ?? null,
          sessionId: req.actor!.sessionId as never,
          result: 'SUCCESS',
          metadata,
          createdAt: new Date(),
        });
        return value;
      },
    );
    return result.value;
  }
}
function makeCursor(scope: string, createdAt: Date, id: string) {
  return Buffer.from(
    JSON.stringify({ scope, createdAt: createdAt.toISOString(), id }),
  ).toString('base64url');
}
function parseCursor(value: string | undefined, scope: string) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as { scope?: unknown; createdAt?: unknown; id?: unknown };
    const createdAt = new Date(
      typeof parsed.createdAt === 'string' ? parsed.createdAt : '',
    );
    if (
      parsed.scope !== scope ||
      typeof parsed.id !== 'string' ||
      !parsed.id ||
      Number.isNaN(createdAt.getTime())
    )
      throw new Error();
    return { createdAt, id: parsed.id };
  } catch {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
    });
  }
}
function parseLimit(value: string | undefined) {
  if (value === undefined) return 24;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100)
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
    });
  return parsed;
}
