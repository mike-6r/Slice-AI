import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../generated/prisma/index.js';
import { PrismaNewsRepository } from '../../src/persistence/news-repository.js';
import type { NewsCandidate } from '../../src/news-feed.js';
import { testDatabaseUrl } from '../test-database-url.js';

const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl() } } });
const repository = new PrismaNewsRepository(prisma); const prefix = `news-feed-test-${Date.now()}`;
const candidate = (overrides: Partial<NewsCandidate> = {}): NewsCandidate => ({ externalId: 'official-item-1', url: 'https://www.pokemon.com/us/news/item', canonicalUrl: 'https://www.pokemon.com/us/news/item', canonicalUrlHash: 'canonical-1', title: 'Pokémon TCG official announcement', publishedAt: new Date('2026-08-18T09:00:00Z'), snippet: 'Official Pokémon TCG news.', source: { id: `${prefix}-source`, name: 'Pokémon', type: 'RSS', feedUrl: 'https://www.pokemon.com/feed.xml', domain: 'pokemon.com', enabled: true, category: 'POKEMON_OFFICIAL', priority: 'major' }, contentHash: 'content-1', dedupKey: `${prefix}:id:one`, category: 'POKEMON_OFFICIAL', priority: 'major', summary: 'Pokémon TCG official announcement. Source: Pokémon.', ...overrides });

beforeAll(async () => { await prisma.$connect(); });
afterAll(async () => { await prisma.discordNewsDelivery.deleteMany({ where: { newsItem: { sourceId: { startsWith: prefix } } } }); await prisma.discordNewsItem.deleteMany({ where: { sourceId: { startsWith: prefix } } }); await prisma.discordNewsSourceState.deleteMany({ where: { sourceId: { startsWith: prefix } } }); await prisma.$disconnect(); });

describe('Prisma trusted-news persistence', () => {
  it('persists source conditional state and backs off failed sources', async () => {
    expect(await repository.sourceState(`${prefix}-state`)).toMatchObject({ etag: null, consecutiveFailures: 0 });
    await repository.sourceSuccess(`${prefix}-state`, { etag: '"etag"', lastModified: 'Mon, 18 Aug 2026 09:00:00 GMT' });
    expect(await repository.sourceState(`${prefix}-state`)).toMatchObject({ etag: '"etag"', consecutiveFailures: 0 });
    await repository.sourceFailure(`${prefix}-state`, 60_000); expect((await repository.sourceState(`${prefix}-state`)).nextPollAt).not.toBeNull();
  });
  it('deduplicates external IDs, canonical URLs, and content-hash fallback without article bodies', async () => {
    const first = await repository.upsertCandidate(candidate()); expect(first.created).toBe(true);
    expect((await repository.upsertCandidate(candidate({ title: 'Title updated', summary: 'Short metadata only.' }))).created).toBe(false);
    expect((await repository.upsertCandidate(candidate({ externalId: null, dedupKey: `${prefix}:url:two`, canonicalUrl: 'https://www.pokemon.com/us/news/another', canonicalUrlHash: 'canonical-2' }))).created).toBe(false);
    const stored = await prisma.discordNewsItem.findUniqueOrThrow({ where: { id: first.item.id } }); expect(stored).not.toHaveProperty('articleBody'); expect(stored.summary.length).toBeLessThan(501);
  });
  it('records exactly one guild delivery, retries known failures, and preserves uncertain sends', async () => {
    const item = (await repository.upsertCandidate(candidate({ externalId: 'official-item-2', dedupKey: `${prefix}:id:two`, contentHash: 'content-2' }))).item;
    await repository.ensureDelivery('guild', 'channel', item.id); await repository.ensureDelivery('guild', 'channel', item.id);
    const [delivery] = (await repository.pendingDeliveries(10)).filter((row) => row.newsItem.id === item.id); expect(delivery).toBeDefined();
    expect(await repository.claimDelivery(delivery!.id)).toBe(true); expect(await repository.claimDelivery(delivery!.id)).toBe(false);
    await repository.failed(delivery!.id, 'DISCORD_SEND_FAILED'); expect(await repository.claimDelivery(delivery!.id)).toBe(true);
    await repository.delivered(delivery!.id, 'message'); expect((await repository.pendingDeliveries(10)).some((row) => row.id === delivery!.id)).toBe(false);
    const uncertain = (await repository.upsertCandidate(candidate({ externalId: 'official-item-3', dedupKey: `${prefix}:id:three`, contentHash: 'content-3' }))).item; await repository.ensureDelivery('guild', 'channel', uncertain.id); const row = (await repository.pendingDeliveries(10)).find((entry) => entry.newsItem.id === uncertain.id)!; await repository.claimDelivery(row.id); await repository.uncertain(row.id); expect((await repository.pendingDeliveries(10)).some((entry) => entry.id === row.id)).toBe(false);
  });
});
