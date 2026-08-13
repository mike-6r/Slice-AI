import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } from 'discord.js';
import { SliceCustomerRouteBuilder } from './customer-routes.js';
import { SliceEmbed } from './embeds/slice-embed.js';
import type { BackendResult, CollectorAction, MySliceSummary } from './slice-backend-client.js';

export const sliceCommand = new SlashCommandBuilder()
  .setName('slice')
  .setDescription('Open your private Slice account summary');

export function mySlicePayload(result: BackendResult<MySliceSummary>, routes: SliceCustomerRouteBuilder) {
  if (!result.ok) return { embeds: [SliceEmbed.warning('My Slice unavailable', result.message)] };
  if (!result.value.linked) return connectPayload();
  const summary = result.value;
  const identity = summary.identity;
  const capabilities = [identity.capabilities.investor ? 'Investor' : null, identity.capabilities.collector ? 'Collector' : null].filter(Boolean).join(' · ');
  const lines = [
    identity.username ? `@${identity.username}` : identity.displayName ?? 'Connected Slice account',
    capabilities || 'Slice member',
    `Preferred currency: **${identity.preferredCurrency}**`,
    '',
    portfolioLine(summary),
    orderLine(summary),
  ];
  if (identity.capabilities.collector) lines.push('', collectorLine(summary));
  return {
    embeds: [SliceEmbed.info('My Slice', lines.join('\n'))],
    components: rows([
      link('Portfolio', routes.portfolioUrl()),
      link('Orders', routes.ordersUrl()),
      ...(identity.capabilities.collector ? [button('Your Actions', 'slice:my-slice:actions', ButtonStyle.Primary), link('Collector Workspace', routes.collectorWorkspaceUrl()), link('Membership', routes.membershipUrl())] : []),
      button('Notifications', 'slice:my-slice:notifications', ButtonStyle.Secondary),
      link('Account Settings', routes.accountUrl()),
      button('Refresh', 'slice:my-slice:refresh', ButtonStyle.Secondary),
    ]),
  };
}

export function mySliceActionsPayload(result: BackendResult<CollectorAction[]>, routes: SliceCustomerRouteBuilder) {
  if (!result.ok) return { embeds: [SliceEmbed.warning('Your Actions unavailable', result.message)] };
  if (!result.value.length) return { embeds: [SliceEmbed.success('Your Actions', "You're all caught up.")], components: rows([button('Back to My Slice', 'slice:my-slice:main', ButtonStyle.Secondary)]) };
  const actions = result.value.slice(0, 5);
  return {
    embeds: [SliceEmbed.info('Your Actions', actions.map((action, index) => `**${index + 1}. ${action.title}**${action.grade ? ` · ${action.grade}` : ''}\n${action.message}`).join('\n\n'))],
    components: rows([
      ...actions.map((action, index) => link(`Continue ${index + 1}`, routes.collectorActionUrl(action.actionUrl))),
      button('Refresh', 'slice:my-slice:actions', ButtonStyle.Secondary),
      button('Back', 'slice:my-slice:main', ButtonStyle.Secondary),
    ]),
  };
}

export function connectPayload() {
  return {
    embeds: [SliceEmbed.info('My Slice', 'Connect your Slice account to view your portfolio, orders, Collector activity, and membership.')],
    components: rows([button('Connect Slice Account', 'slice:onboarding:connect', ButtonStyle.Primary)]),
  };
}

function portfolioLine(summary: Exclude<MySliceSummary, { linked: false }>) {
  const portfolio = summary.portfolio;
  if (!portfolio) return '**Portfolio**\nTemporarily unavailable.';
  const source = portfolio.currency === summary.identity.preferredCurrency ? '' : ` · reported in ${portfolio.currency}`;
  return `**Portfolio${source}**\nValue: **${money(portfolio.estimatedPortfolioValueMinor, portfolio.currency)}** · Available cash: **${money(portfolio.availableCashMinor, portfolio.currency)}**\nHoldings: **${portfolio.holdings}** · Reserved: **${money(portfolio.reservedCashMinor, portfolio.currency)}**`;
}

function orderLine(summary: Exclude<MySliceSummary, { linked: false }>) {
  const orders = summary.orders;
  if (!orders) return '**Orders**\nTemporarily unavailable.';
  const recent = orders.recent.slice(0, 3).map((order) => `${order.side} · ${order.assetTitle} · ${order.remainingUnits} remaining`).join('\n');
  return `**Orders**\nOpen orders: **${orders.openCount}**${recent ? `\n${recent}` : "\nYou don't have any open orders."}`;
}

function collectorLine(summary: Exclude<MySliceSummary, { linked: false }>) {
  const collector = summary.collector;
  if (!collector) return '**Collector**\nTemporarily unavailable.';
  const membership = collector.membership;
  const usage = membership ? `${membership.planName} · ${label(membership.status)}\n${ratio(membership.activeCollectibles, membership.maxActiveCollectibles)} collectibles · ${ratio(membership.monthlySubmissions, membership.monthlyLimit)} monthly submissions · ${ratio(membership.concurrentIntake, membership.concurrentIntakeLimit)} intake` : 'No active Collector membership.';
  return `**Collector**\nCollectibles: **${collector.collectibles}** · In review: **${collector.inReview}** · Market Live: **${collector.marketLive}**\nYour Actions: **${collector.openActionCount}**${collector.openActionCount === 0 ? " · You're all caught up." : ''}\n${usage}${membership?.status === 'PAST_DUE' ? '\nBilling attention required.' : ''}`;
}

function money(minor: string, currency: string) {
  const value = BigInt(minor);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${currency} ${whole}.${(absolute % 100n).toString().padStart(2, '0')}`;
}
function ratio(value: number, limit: number | null) { return limit === null ? `${value}` : `${value} / ${limit}`; }
function label(value: string) { return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function button(label: string, customId: string, style: ButtonStyle) { return new ButtonBuilder().setLabel(label).setCustomId(customId).setStyle(style); }
function link(label: string, url: string | null) { return url ? new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url) : null; }
function rows(items: Array<ButtonBuilder | null>) { const buttons = items.filter((item): item is ButtonBuilder => item !== null); const result: Array<ActionRowBuilder<ButtonBuilder>> = []; for (let index = 0; index < buttons.length; index += 5) result.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(index, index + 5))); return result; }
