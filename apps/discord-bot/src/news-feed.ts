import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { presentationConfig } from './presentation-config.js';

export type NewsCategory = 'POKEMON_OFFICIAL' | 'TCG_PRODUCT' | 'TOURNAMENT' | 'GRADING' | 'AUCTION' | 'INDUSTRY';
export type NewsPriority = 'major' | 'routine';
export type NewsSource = { id: string; name: string; type: 'RSS' | 'ATOM'; feedUrl: string; domain: string; enabled: boolean; category: NewsCategory; priority: NewsPriority };
export type FeedItem = { externalId: string | null; url: string; title: string; publishedAt: Date; snippet: string };
export type NewsCandidate = FeedItem & { source: NewsSource; canonicalUrl: string; canonicalUrlHash: string; contentHash: string; dedupKey: string; category: NewsCategory; priority: NewsPriority; summary: string };

const MAX_FEED_BYTES = 512_000; const MAX_REDIRECTS = 2; const BANNED = /\b(buy|sell|bullish|bearish|pump|undervalued|expected roi|investment advice|price target)\b/i;

export function approvedNewsSources(): NewsSource[] { return presentationConfig()['news-sources.yml'].sources.map((source) => ({ id: source.id, name: source.name, type: source.type, feedUrl: source.feed_url, domain: source.domain, enabled: source.enabled, category: source.category, priority: source.priority })); }
export function canonicalNewsUrl(value: string): string | null { try { const url = new URL(value); if (url.protocol !== 'https:' || !isPublicHostname(url.hostname)) return null; for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key); url.hash = ''; return url.toString(); } catch { return null; } }
export function isPublicHostname(hostname: string): boolean { const host = hostname.toLowerCase().replace(/\.$/, ''); if (!host || host === 'localhost' || host.endsWith('.localhost') || host === '::1') return false; if (/^127\.|^10\.|^0\.|^169\.254\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false; if (/^(fc|fd|fe80:)/i.test(host)) return false; return true; }
export function sourceAllowsUrl(source: NewsSource, value: string): boolean { const url = canonicalNewsUrl(value); if (!url) return false; const host = new URL(url).hostname.toLowerCase(); return host === source.domain || host.endsWith(`.${source.domain}`); }
export function parseFeed(xml: string): FeedItem[] { const blocks = [...xml.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)].map((match) => match[1]); return blocks.flatMap((block) => { const title = text(tag(block, 'title')).slice(0, 240); const externalId = text(tag(block, 'guid')) || text(tag(block, 'id')) || null; const link = linkValue(block); const date = new Date(text(tag(block, 'pubDate')) || text(tag(block, 'published')) || text(tag(block, 'updated'))); const snippet = text(tag(block, 'description') || tag(block, 'summary') || tag(block, 'content')).slice(0, 600); return title && link && !Number.isNaN(date.getTime()) ? [{ externalId: externalId?.slice(0, 512) ?? null, url: link, title, publishedAt: date, snippet }] : []; }); }
export function candidateFrom(source: NewsSource, item: FeedItem): NewsCandidate | null { const canonicalUrl = canonicalNewsUrl(item.url); if (!canonicalUrl || !sourceAllowsUrl(source, canonicalUrl) || !relevant(source.category, `${item.title} ${item.snippet}`)) return null; const canonicalUrlHash = hash(canonicalUrl); const contentHash = hash(`${normal(item.title)}|${normal(item.snippet)}`); const dedupKey = item.externalId ? `${source.id}:id:${hash(item.externalId)}` : `${source.id}:url:${canonicalUrlHash}`; return { ...item, source, canonicalUrl, canonicalUrlHash, contentHash, dedupKey, category: source.category, priority: classifyPriority(source, item), summary: factualSummary(source, item) }; }
export function factualSummary(source: NewsSource, item: FeedItem): string { const sentences = item.snippet.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter((sentence) => sentence && !BANNED.test(sentence)); const detail = sentences[0]?.slice(0, 260); return `${item.title}.${detail && !normal(detail).includes(normal(item.title)) ? ` ${detail}` : ''} Source: ${source.name}.`.slice(0, 500); }
export function relevant(category: NewsCategory, text: string): boolean { const value = text.toLowerCase(); const pokemon = /pok[ée]mon|pokémon|pokemon tcg|trading card|collectible card|tcg/.test(value); if (category === 'GRADING') return /grading|graded|psa|bgs|cgc|label|turnaround/.test(value) && (pokemon || /trading card|collectible/.test(value)); if (category === 'AUCTION') return /auction|sold|sale|collectible|trading card/.test(value) && (pokemon || /card/.test(value)); if (category === 'TOURNAMENT') return pokemon && /tournament|championship|regional|worlds|competitive/.test(value); return pokemon || /trading card|collectible card|card game/.test(value); }
export function classifyPriority(source: NewsSource, item: FeedItem): NewsPriority { if (source.priority === 'major' && /announce|new set|expansion|release|policy|championship|worlds|milestone/i.test(`${item.title} ${item.snippet}`)) return 'major'; if (source.category === 'GRADING' && /policy|service|label|process/i.test(item.title)) return 'major'; if (source.category === 'AUCTION' && /record|milestone/i.test(item.title)) return 'major'; return 'routine'; }

export class SafeNewsFeedClient {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  async fetch(source: NewsSource, state: { etag: string | null; lastModified: string | null }): Promise<{ kind: 'NOT_MODIFIED' | 'SUCCESS'; xml?: string; etag?: string | null; lastModified?: string | null; retryAfterMs?: number }> {
    if (!sourceAllowsUrl(source, source.feedUrl)) throw new Error('SOURCE_URL_REJECTED');
    let url = source.feedUrl;
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
      await publicDns(url); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8_000);
      try {
        const response = await this.fetcher(url, { redirect: 'manual', signal: controller.signal, headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9', 'user-agent': 'SliceDiscordNews/1.0 (+https://slice.ai)' , ...(state.etag ? { 'if-none-match': state.etag } : {}), ...(state.lastModified ? { 'if-modified-since': state.lastModified } : {}) } });
        if (response.status === 304) return { kind: 'NOT_MODIFIED', etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified') };
        if ([301, 302, 303, 307, 308].includes(response.status)) { const location = response.headers.get('location'); if (!location) throw new Error('REDIRECT_INVALID'); url = new URL(location, url).toString(); if (!sourceAllowsUrl(source, url)) throw new Error('REDIRECT_HOST_REJECTED'); continue; }
        if (response.status === 429) return { kind: 'NOT_MODIFIED', retryAfterMs: retryAfter(response.headers.get('retry-after')) };
        if (!response.ok) throw new Error(response.status >= 500 ? 'SOURCE_5XX' : 'SOURCE_HTTP_ERROR'); const length = Number(response.headers.get('content-length') ?? 0); if (length > MAX_FEED_BYTES) throw new Error('RESPONSE_TOO_LARGE'); const xml = await boundedText(response, MAX_FEED_BYTES); return { kind: 'SUCCESS', xml, etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified') };
      } finally { clearTimeout(timeout); }
    }
    throw new Error('TOO_MANY_REDIRECTS');
  }
}

async function publicDns(value: string): Promise<void> { const host = new URL(value).hostname; if (!isPublicHostname(host)) throw new Error('PRIVATE_HOST_REJECTED'); const records = await lookup(host, { all: true }); if (!records.length || records.some((record) => !isPublicHostname(record.address))) throw new Error('PRIVATE_ADDRESS_REJECTED'); }
async function boundedText(response: Response, limit: number): Promise<string> { const reader = response.body?.getReader(); if (!reader) throw new Error('EMPTY_RESPONSE'); let size = 0; const chunks: Uint8Array[] = []; while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > limit) { await reader.cancel(); throw new Error('RESPONSE_TOO_LARGE'); } chunks.push(part.value); } return new TextDecoder().decode(concat(chunks, size)); }
function concat(chunks: Uint8Array[], size: number): Uint8Array { const result = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; } return result; }
function tag(block: string, name: string): string { return new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i').exec(block)?.[1] ?? ''; }
function linkValue(block: string): string | null { const atom = /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i.exec(block)?.[1]; return atom ?? (text(tag(block, 'link')) || null); }
function text(value: string): string { return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&(?:amp|#38);/g, '&').replace(/&(?:quot|#34);/g, '"').replace(/&(?:apos|#39);/g, "'").replace(/\s+/g, ' ').trim(); }
function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function normal(value: string): string { return value.toLowerCase().replace(/\s+/g, ' ').trim(); }
function retryAfter(value: string | null): number { const seconds = Number(value); return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1_000, 6 * 60 * 60_000) : 30 * 60_000; }
