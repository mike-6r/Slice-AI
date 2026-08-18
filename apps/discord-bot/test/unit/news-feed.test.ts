import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { candidateFrom, canonicalNewsUrl, factualSummary, isPublicHostname, parseFeed, sourceAllowsUrl, type NewsSource } from '../../src/news-feed.js';
import { NewsFeedWorker, newsPayload } from '../../src/news-feed-worker.js';

const source: NewsSource = { id: 'pokemon-official', name: 'Pokémon', type: 'RSS', feedUrl: 'https://www.pokemon.com/feed.xml', domain: 'pokemon.com', enabled: true, category: 'POKEMON_OFFICIAL', priority: 'major' };
const official = parseFeed(readFileSync(new URL('../fixtures/news/official-rss.xml', import.meta.url), 'utf8'))[0]!;

describe('trusted news feed policy', () => {
  it('accepts only allowlisted HTTPS public source URLs and rejects SSRF targets', () => {
    expect(sourceAllowsUrl(source, official.url)).toBe(true);
    expect(sourceAllowsUrl(source, 'https://evil.example/article')).toBe(false);
    expect(canonicalNewsUrl('http://www.pokemon.com/article')).toBeNull();
    expect(isPublicHostname('127.0.0.1')).toBe(false); expect(isPublicHostname('10.0.0.2')).toBe(false); expect(isPublicHostname('localhost')).toBe(false);
  });
  it('parses RSS/Atom metadata, normalizes canonical URLs, and rejects malformed entries', () => {
    const atom = parseFeed(readFileSync(new URL('../fixtures/news/grading-atom.xml', import.meta.url), 'utf8'));
    expect(official.externalId).toBe('official-1'); expect(canonicalNewsUrl(official.url)).not.toContain('utm_source'); expect(atom[0]?.externalId).toBe('grading-1');
    expect(parseFeed(readFileSync(new URL('../fixtures/news/malformed.xml', import.meta.url), 'utf8'))).toEqual([]);
  });
  it('uses external ID, URL, then content hash paths without storing article bodies', () => {
    const first = candidateFrom(source, official)!; const titleChanged = candidateFrom(source, { ...official, title: 'Updated Pokémon TCG expansion announcement' })!;
    expect(first.dedupKey).toBe(titleChanged.dedupKey); expect(first.contentHash).not.toBe(titleChanged.contentHash); expect(first.summary.length).toBeLessThan(501);
  });
  it('accepts relevant factual Pokémon news and rejects unrelated material or investment language', () => {
    expect(candidateFrom(source, official)).not.toBeNull();
    expect(candidateFrom(source, { ...official, title: 'General corporate staffing note', snippet: 'Company news.' })).toBeNull();
    expect(factualSummary(source, { ...official, snippet: 'Buy now because this is bullish. Official product details are available.' })).not.toMatch(/buy now|bullish/i);
  });
});

describe('news worker delivery', () => {
  function fixture() {
    const feeds = { fetch: vi.fn(async () => ({ kind: 'SUCCESS', xml: readFileSync(new URL('../fixtures/news/official-rss.xml', import.meta.url), 'utf8') })) };
    const repository = { sourceState: vi.fn(async () => ({ sourceId: source.id, etag: null, lastModified: null, nextPollAt: null, consecutiveFailures: 0 })), sourceSuccess: vi.fn(), sourceFailure: vi.fn(), upsertCandidate: vi.fn(async () => ({ item: { id: 'news', sourceId: source.id, canonicalUrl: 'https://www.pokemon.com/article', title: 'Pokémon TCG announces a new expansion', publishedAt: new Date('2026-08-18T09:00:00Z'), category: 'POKEMON_OFFICIAL', priority: 'MAJOR', summary: 'Factual source summary.', status: 'DISCOVERED' }, created: true })), ensureDelivery: vi.fn(), pendingDeliveries: vi.fn(async () => []), claimDelivery: vi.fn(async () => true), delivered: vi.fn(), failed: vi.fn(), uncertain: vi.fn() };
    const setup = { listGuildConfigs: vi.fn(async () => [{ guildId: 'guild' }]), getResource: vi.fn(async (_guild: string, type: string, key: string) => type === 'CHANNEL' ? { discordId: key === 'announcements' ? 'announcements' : 'collecting' } : key === 'news' ? { discordId: 'news-role' } : null) };
    const send = vi.fn(async () => ({ id: 'message' })); const discord = { guilds: { fetch: vi.fn(async () => ({ channels: { fetch: vi.fn(async () => ({ isTextBased: () => true, send })) } })) } }; const report = vi.fn();
    const worker = new NewsFeedWorker(feeds as never, repository as never, setup as never, discord as never, { NEWS_FEED_ENABLED: true, NEWS_FEED_CONCURRENCY: 2, NEWS_FEED_BOOTSTRAP_HOURS: 24, NEWS_FEED_MENTION_OPT_IN_ROLE: true }, report); return { worker, feeds, repository, send, report };
  }
  it('routes major source items to announcements, suppresses duplicate scheduler discoveries, and never pings broadly', async () => {
    const state = fixture(); await state.worker.scan(new Date('2026-08-18T10:00:00Z')); expect(state.repository.ensureDelivery).toHaveBeenCalledWith('guild', 'announcements', 'news');
    state.repository.upsertCandidate.mockResolvedValueOnce({ item: { id: 'news' }, created: false }); await state.worker.scan(new Date('2026-08-18T10:00:00Z')); expect(state.repository.ensureDelivery).toHaveBeenCalledTimes(1);
  });
  it('continues when one source fails and sends only through the opted-in Slice News role', async () => {
    const state = fixture(); state.feeds.fetch.mockRejectedValueOnce(new Error('timeout')); await state.worker.scan(new Date('2026-08-18T10:00:00Z')); expect(state.repository.sourceFailure).toHaveBeenCalled();
    const delivery = { id: 'delivery', guildId: 'guild', channelId: 'collecting', attempts: 0, newsItem: { id: 'news', sourceId: 'pokemon-official', canonicalUrl: 'https://www.pokemon.com/article', title: 'Title', publishedAt: new Date(), category: 'POKEMON_OFFICIAL', priority: 'ROUTINE', summary: 'Facts.', status: 'DISCOVERED' } }; state.repository.pendingDeliveries.mockResolvedValueOnce([delivery]); await state.worker.scan(new Date('2026-08-18T10:00:00Z')); expect(state.send).toHaveBeenCalledWith(expect.objectContaining({ content: '<@&news-role>', allowedMentions: expect.objectContaining({ parse: [], roles: ['news-role'] }) }));
  });
  it('makes deterministic factual embeds with a canonical link and no investment prompt', () => {
    const payload = newsPayload({ id: 'delivery', guildId: 'guild', channelId: 'channel', attempts: 0, newsItem: { id: 'news', sourceId: 'pokemon-official', canonicalUrl: 'https://www.pokemon.com/article', title: 'Title', publishedAt: new Date(), category: 'POKEMON_OFFICIAL', priority: 'ROUTINE', summary: 'Factual source summary.', status: 'DISCOVERED' } }, null);
    expect(payload.allowedMentions).toEqual({ parse: [], users: [], roles: [], repliedUser: false }); expect(payload.embeds[0]!.toJSON().description).not.toMatch(/buy|sell|roi|bullish|bearish/i);
  });
});
