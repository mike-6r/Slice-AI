import { PrismaClient } from '@prisma/client';
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL required');
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const id = `reads-i-${Date.now()}`;
describe('Document 008 PostgreSQL read-model invariants', () => {
  let publicUser: string;
  let privateUser: string;
  let assetId: string;
  beforeAll(async () => {
    await db.$connect();
    await db.category.create({
      data: { id: `${id}-cat`, slug: `${id}-cat`, name: 'C', sortOrder: 1 },
    });
    assetId = (
      await db.asset.create({
        data: {
          id: `${id}-asset`,
          publicId: `ast_${id.replace(/-/g, '')}`,
          slug: `${id}-asset`,
          categoryId: `${id}-cat`,
          title: 'A',
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
      })
    ).id;
    publicUser = (
      await db.user.create({
        data: {
          id: `${id}-pub`,
          email: `${id}-pub@example.test`,
          normalizedEmail: `${id}-pub@example.test`,
          passwordHash: 'x',
          profile: { create: { displayName: 'Public' } },
        },
      })
    ).id;
    privateUser = (
      await db.user.create({
        data: {
          id: `${id}-private`,
          email: `${id}-private@example.test`,
          normalizedEmail: `${id}-private@example.test`,
          passwordHash: 'x',
          profile: { create: { displayName: 'Private' } },
        },
      })
    ).id;
    await db.publicCollectorProfile.createMany({
      data: [
        { userId: publicUser, slug: `${id}-public`, isPublic: true },
        { userId: privateUser, slug: `${id}-private`, isPublic: false },
      ],
    });
  });
  afterAll(async () => {
    await db.watchlistItem.deleteMany({
      where: { userId: { in: [publicUser, privateUser] } },
    });
    await db.notification.deleteMany({
      where: { userId: { in: [publicUser, privateUser] } },
    });
    await db.publicCollectorProfile.deleteMany({
      where: { userId: { in: [publicUser, privateUser] } },
    });
    await db.user.deleteMany({
      where: { id: { in: [publicUser, privateUser] } },
    });
    await db.asset.delete({ where: { id: assetId } });
    await db.category.delete({ where: { id: `${id}-cat` } });
    await db.$disconnect();
  });
  it('enforces visibility, watchlist uniqueness, and notification self-only state', async () => {
    expect(
      await db.publicCollectorProfile.findMany({
        where: { isPublic: true, userId: privateUser },
      }),
    ).toHaveLength(0);
    await db.watchlistItem.create({ data: { userId: publicUser, assetId } });
    await expect(
      db.watchlistItem.create({ data: { userId: publicUser, assetId } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    const note = await db.notification.create({
      data: { userId: publicUser, type: 'SYSTEM', title: 'Safe', body: 'Safe' },
    });
    await db.notification.updateMany({
      where: { id: note.id, userId: privateUser },
      data: { readAt: new Date() },
    });
    expect(
      (await db.notification.findUnique({ where: { id: note.id } }))?.readAt,
    ).toBeNull();
    await db.notification.updateMany({
      where: { id: note.id, userId: publicUser },
      data: { readAt: new Date() },
    });
    expect(
      (await db.notification.findUnique({ where: { id: note.id } }))?.readAt,
    ).not.toBeNull();
  });
  it('uses stable composite ordering for public collector and vault continuation queries', async () => {
    const stamp = new Date('2026-08-06T12:00:00.000Z');
    const user2 = await db.user.create({
      data: {
        id: `${id}-page-user`,
        email: `${id}-page@example.test`,
        normalizedEmail: `${id}-page@example.test`,
        passwordHash: 'x',
      },
    });
    await db.publicCollectorProfile.create({
      data: {
        userId: user2.id,
        slug: `${id}-page`,
        isPublic: true,
        createdAt: stamp,
      },
    });
    await db.publicCollectorProfile.update({
      where: { userId: publicUser },
      data: { createdAt: stamp },
    });
    const collectors = await db.publicCollectorProfile.findMany({
      where: { isPublic: true },
      orderBy: [{ createdAt: 'desc' }, { userId: 'desc' }],
      take: 2,
    });
    expect(new Set(collectors.map((row) => row.userId)).size).toBe(2);
    await db.vaultPublicEvent.createMany({
      data: [
        {
          id: `${id}-page-event-a`,
          assetId,
          type: 'A',
          occurredAt: stamp,
          publicSummary: 'A',
        },
        {
          id: `${id}-page-event-b`,
          assetId,
          type: 'B',
          occurredAt: stamp,
          publicSummary: 'B',
        },
      ],
    });
    const events = await db.vaultPublicEvent.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: 2,
    });
    expect(events.map((event) => event.id)).toEqual(
      [...events.map((event) => event.id)].sort().reverse(),
    );
    await db.vaultPublicEvent.deleteMany({
      where: { id: { startsWith: `${id}-page-event` } },
    });
    await db.publicCollectorProfile.delete({ where: { userId: user2.id } });
    await db.user.delete({ where: { id: user2.id } });
  });
});
