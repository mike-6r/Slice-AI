import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { SliceEmbed } from './embeds/slice-embed.js';
import type { MarketAsset, MarketSummary } from './slice-backend-client.js';

export type AuthoritativeMarketDigest = { summary: MarketSummary; gainers: MarketAsset[]; losers: MarketAsset[] };

export function digestIsPublishable(summary: MarketSummary): summary is MarketSummary & { asOf: string } {
  return summary.dataStatus !== 'UNAVAILABLE' && Boolean(summary.asOf) && summary.source !== 'NO_MARKET_DATA';
}

export function marketDigestPayload(digest: AuthoritativeMarketDigest, maxItems: number, marketplaceUrl?: string | null) {
  const sections = [
    digest.gainers.filter(hasMovement).slice(0, maxItems),
    digest.losers.filter(hasMovement).slice(0, maxItems),
  ].flatMap((items, index) => items.length ? [{ name: index === 0 ? 'Biggest gainers' : 'Biggest losers', value: items.map(moverLine).join('\n'), inline: false }] : []);
  const summary = digest.summary;
  const totals = [
    summary.totalEstimatedMarketValue ? `Estimated market value: **${money(summary.totalEstimatedMarketValue.minor, summary.totalEstimatedMarketValue.currency)}**` : null,
    summary.volume24h ? `24h volume: **${money(summary.volume24h.minor, summary.volume24h.currency)}**` : null,
    `Published assets: **${summary.activeAssetCount}** · Collectors: **${summary.collectorCount}**`,
    `As of: <t:${Math.floor(new Date(summary.asOf!).getTime() / 1000)}:F>`,
    `Source: **${summary.source}** · Data status: **${summary.dataStatus}**`,
  ].filter((line): line is string => Boolean(line)).join('\n');
  const embed = SliceEmbed.info(summary.dataStatus === 'DEMO' ? 'Market Brief · DEMO DATA' : summary.dataStatus === 'DELAYED' ? 'Market Brief · DELAYED DATA' : 'Market Brief', totals).addFields(sections);
  return { embeds: [embed], components: marketplaceUrl ? [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setLabel('View Slice').setStyle(ButtonStyle.Link).setURL(marketplaceUrl))] : [], allowedMentions: { parse: [], users: [], roles: [], repliedUser: false } };
}

function hasMovement(asset: MarketAsset): asset is MarketAsset & { change24hBps: number; source: string; asOf: string; dataStatus: string } { return typeof asset.change24hBps === 'number' && typeof asset.source === 'string' && typeof asset.asOf === 'string' && typeof asset.dataStatus === 'string'; }
function moverLine(asset: MarketAsset & { change24hBps: number; source: string; asOf: string; dataStatus: string }) { const change = `${asset.change24hBps >= 0 ? '+' : ''}${(asset.change24hBps / 100).toFixed(2)}%`; return `**${asset.title}** — **${change}**\nSource: ${asset.source} · ${asset.dataStatus} · <t:${Math.floor(new Date(asset.asOf).getTime() / 1000)}:R>`; }
export function money(minor: string | bigint, currency: string) { const value = BigInt(minor); const whole = value / 100n; const fraction = (value < 0n ? -value : value) % 100n; return `${currency} ${whole.toString()}.${fraction.toString().padStart(2, '0')}`; }
