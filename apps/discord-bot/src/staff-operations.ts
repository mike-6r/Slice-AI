import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
} from 'discord.js';
import { SliceAdminRouteBuilder } from './admin-routes.js';
import { SliceEmbed } from './embeds/slice-embed.js';
import type { AdminOperationsSummary, BackendResult } from './slice-backend-client.js';

export type SliceStaffRole = 'ADMIN' | 'SUPPORT' | 'COMPLIANCE_ANALYST' | 'ASSET_REVIEWER' | 'VAULT_OPERATOR' | 'FINANCE_OPERATOR';
const staffRoles = new Set<SliceStaffRole>(['ADMIN', 'SUPPORT', 'COMPLIANCE_ANALYST', 'ASSET_REVIEWER', 'VAULT_OPERATOR', 'FINANCE_OPERATOR']);

export const opsCommand = new SlashCommandBuilder()
  .setName('ops')
  .setDescription('Open your authorised Slice operations shortcuts');

export function isSliceStaff(roles: string[]): boolean { return roles.some((role) => staffRoles.has(role as SliceStaffRole)); }

export function staffOperationsPayload(
  roles: string[],
  routes: SliceAdminRouteBuilder,
  summary?: BackendResult<AdminOperationsSummary>,
) {
  if (!isSliceStaff(roles)) {
    return { embeds: [SliceEmbed.warning('Staff access required', 'Link the Slice account that holds your staff role to open operations. Discord roles never grant Slice authorization.')] };
  }
  if (summary && !summary.ok && roles.includes('ADMIN')) {
    return { embeds: [SliceEmbed.warning('Operations unavailable', "Slice couldn't load the operations summary right now.")], components: rows(roles, routes) };
  }
  if (summary?.ok && roles.includes('ADMIN')) {
    const counts = summary.value.counts;
    const lines = [
      `Pending reviews: **${counts.pendingReviews}**`,
      `Receipt required: **${counts.deliveredAwaitingReceipt}**`,
      `Verification / valuation: **${counts.verificationQueue} / ${counts.valuationQueue}**`,
      `Market ready: **${counts.marketplaceReady}**`,
      `Membership past due: **${summary.value.memberships.pastDue}**`,
      `Trust / platform alerts: **${counts.compliance} / ${counts.alerts}**`,
    ];
    if (summary.value.support.available && summary.value.support.open !== undefined) lines.splice(5, 0, `Open support tickets: **${summary.value.support.open}**`);
    return { embeds: [SliceEmbed.staff('Operations center', lines.join('\n'))], components: rows(roles, routes) };
  }
  return { embeds: [SliceEmbed.staff('Staff operations', 'Open the Slice workspace that matches your current Slice role. Detailed queues and all actions remain authorized by Slice.')], components: rows(roles, routes) };
}

export function staffPanelPayload(action: string, routes: SliceAdminRouteBuilder) {
  const mapping: Record<string, { title: string; body: string; url: string | null; label: string }> = {
    'asset-operations': { title: 'Asset operations', body: 'Verification, valuation, custody, market readiness, and exceptions remain in Slice.', url: routes.adminAssetOperationsUrl(), label: 'Open Asset Operations' },
    'physical-intake': { title: 'Physical intake', body: 'Carrier delivery is not Slice receipt confirmation. Open Slice to review the current intake state.', url: routes.adminPhysicalIntakeUrl(), label: 'Open Physical Intake' },
    'support-queue': { title: 'Trust & support', body: 'Discord support tickets remain actionable here; account, compliance, and escalation details remain in Slice.', url: routes.adminTrustSupportUrl('tickets'), label: 'Open Trust & Support' },
    'system-alerts': { title: 'Platform operations', body: 'Platform health, jobs, webhooks, integrations, audit, and feature settings remain in Slice.', url: routes.adminPlatformOperationsUrl(), label: 'Open Platform Operations' },
  };
  const item = mapping[action];
  if (!item) return { embeds: [SliceEmbed.warning('Operations unavailable', 'This staff panel is no longer available. Run `/setup repair`.')] };
  return { embeds: [SliceEmbed.staff(item.title, item.body)], components: item.url ? [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setLabel(item.label).setStyle(ButtonStyle.Link).setURL(item.url))] : [] };
}

function rows(roles: string[], routes: SliceAdminRouteBuilder) {
  const buttons: ButtonBuilder[] = [];
  const add = (label: string, url: string | null) => { if (url) buttons.push(new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url)); };
  if (roles.includes('ADMIN') || roles.includes('ASSET_REVIEWER')) add('Review Queue', routes.adminReviewQueueUrl());
  if (roles.includes('ADMIN') || roles.includes('VAULT_OPERATOR')) add('Physical Intake', routes.adminPhysicalIntakeUrl());
  if (roles.includes('ADMIN') || roles.includes('ASSET_REVIEWER') || roles.includes('VAULT_OPERATOR') || roles.includes('COMPLIANCE_ANALYST')) add('Asset Operations', routes.adminAssetOperationsUrl());
  if (roles.includes('ADMIN')) add('Memberships', routes.adminMembershipsUrl());
  if (roles.includes('ADMIN') || roles.includes('SUPPORT') || roles.includes('COMPLIANCE_ANALYST')) add('Trust & Support', routes.adminTrustSupportUrl(roles.includes('SUPPORT') ? 'tickets' : 'compliance'));
  if (roles.includes('ADMIN')) { add('Finance & Trading', routes.adminFinanceUrl()); add('Platform Operations', routes.adminPlatformOperationsUrl()); }
  const rows: Array<ActionRowBuilder<ButtonBuilder>> = [];
  for (let index = 0; index < buttons.length; index += 5) rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(index, index + 5)));
  return rows;
}
