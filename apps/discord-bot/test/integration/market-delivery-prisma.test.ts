import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../generated/prisma/index.js';
import { PrismaDiscordDeliveryRepository } from '../../src/persistence/discord-delivery-repository.js';
import { testDatabaseUrl } from '../test-database-url.js';

const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl() } } });
const repository = new PrismaDiscordDeliveryRepository(prisma);
const prefix = `market-delivery-test-${Date.now()}`;

beforeAll(async () => { await prisma.$connect(); });
afterAll(async () => {
  await prisma.discordPriceAlertDelivery.deleteMany({ where: { alert: { guildId: { startsWith: prefix } } } });
  await prisma.discordPriceAlert.deleteMany({ where: { guildId: { startsWith: prefix } } });
  await prisma.discordMarketDigestRun.deleteMany({ where: { guildId: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('Prisma market delivery authority', () => {
  it('persists alert evaluation state and creates one private delivery for a true crossing', async () => {
    const guild = `${prefix}-alerts`; const asOf = new Date('2026-08-18T09:00:00.000Z');
    await repository.createAlert({ guildId: guild, discordUserId: 'member', assetId: 'asset-slug', condition: 'PRICE_ABOVE', thresholdMinor: 100n, currency: 'GBP', lastEvaluatedMinor: 95n, lastConditionMet: false, lastObservedAt: new Date(asOf.getTime() - 60_000), lastSource: 'SLICE_MARKET', lastDataStatus: 'LIVE' });
    const alert = (await repository.listAlerts(guild, 'member'))[0]!;
    expect(await repository.recordAlertEvaluation({ alertId: alert.id, assetTitle: 'Authoritative Asset', observedMinor: 101n, currency: 'GBP', source: 'SLICE_MARKET', dataStatus: 'LIVE', observedAt: asOf, conditionMet: true })).toBe('TRIGGERED');
    expect(await repository.recordAlertEvaluation({ alertId: alert.id, assetTitle: 'Authoritative Asset', observedMinor: 101n, currency: 'GBP', source: 'SLICE_MARKET', dataStatus: 'LIVE', observedAt: asOf, conditionMet: true })).toBe('STALE');
    expect(await repository.recordAlertEvaluation({ alertId: alert.id, assetTitle: 'Authoritative Asset', observedMinor: 102n, currency: 'GBP', source: 'SLICE_MARKET', dataStatus: 'LIVE', observedAt: new Date(asOf.getTime() + 60_000), conditionMet: true })).toBe('UPDATED');
    expect(await prisma.discordPriceAlertDelivery.count({ where: { alertId: alert.id } })).toBe(1);
    expect(await repository.recordAlertEvaluation({ alertId: alert.id, assetTitle: 'Authoritative Asset', observedMinor: 90n, currency: 'GBP', source: 'SLICE_MARKET', dataStatus: 'LIVE', observedAt: new Date(asOf.getTime() + 120_000), conditionMet: false })).toBe('UPDATED');
    expect(await repository.recordAlertEvaluation({ alertId: alert.id, assetTitle: 'Authoritative Asset', observedMinor: 103n, currency: 'GBP', source: 'SLICE_MARKET', dataStatus: 'LIVE', observedAt: new Date(asOf.getTime() + 180_000), conditionMet: true })).toBe('TRIGGERED');
    expect(await prisma.discordPriceAlertDelivery.count({ where: { alertId: alert.id } })).toBe(2);
  });

  it('claims a pending delivery once, permits a known failed-send retry, and suppresses disabled alerts', async () => {
    const guild = `${prefix}-retry`; const asOf = new Date('2026-08-18T09:00:00.000Z');
    await repository.createAlert({ guildId: guild, discordUserId: 'member', assetId: 'asset-slug', condition: 'PRICE_BELOW', thresholdMinor: 100n, currency: 'GBP', lastEvaluatedMinor: 105n, lastConditionMet: false, lastObservedAt: new Date(asOf.getTime() - 60_000), lastSource: 'SLICE_MARKET', lastDataStatus: 'LIVE' });
    const alert = (await repository.listAlerts(guild, 'member'))[0]!;
    await repository.recordAlertEvaluation({ alertId: alert.id, assetTitle: 'Asset', observedMinor: 99n, currency: 'GBP', source: 'SLICE_MARKET', dataStatus: 'LIVE', observedAt: asOf, conditionMet: true });
    const delivery = (await repository.pendingPriceAlertDeliveries(10)).find((row) => row.alertId === alert.id);
    expect(delivery).toBeDefined();
    expect(await repository.claimPriceAlertDelivery(delivery!.id)).toBe(true);
    expect(await repository.claimPriceAlertDelivery(delivery!.id)).toBe(false);
    await repository.completePriceAlertDelivery(delivery!.id, { status: 'RETRYABLE_FAILURE', failureCode: 'RETRYABLE_FAILURE' });
    expect(await repository.claimPriceAlertDelivery(delivery!.id)).toBe(true);
    await repository.completePriceAlertDelivery(delivery!.id, { status: 'DELIVERED', channelId: 'dm', messageId: 'message' });
    expect((await repository.pendingPriceAlertDeliveries(10)).some((row) => row.alertId === alert.id)).toBe(false);
    await repository.removeAlert(guild, 'member', alert.id);
    expect((await repository.pendingPriceAlertDeliveries(10)).some((row) => row.alertId === alert.id)).toBe(false);
  });

  it('keeps currency mismatches from changing alert state or producing delivery', async () => {
    const guild = `${prefix}-currency`; const asOf = new Date('2026-08-18T09:00:00.000Z');
    await repository.createAlert({ guildId: guild, discordUserId: 'member', assetId: 'asset-slug', condition: 'PRICE_ABOVE', thresholdMinor: 100n, currency: 'GBP', lastEvaluatedMinor: 95n, lastConditionMet: false, lastObservedAt: new Date(asOf.getTime() - 60_000), lastSource: 'SLICE_MARKET', lastDataStatus: 'LIVE' });
    const alert = (await repository.listAlerts(guild, 'member'))[0]!;
    expect(await repository.recordAlertEvaluation({ alertId: alert.id, assetTitle: 'Asset', observedMinor: 101n, currency: 'USD', source: 'SLICE_MARKET', dataStatus: 'LIVE', observedAt: asOf, conditionMet: true })).toBe('CURRENCY_MISMATCH');
    expect(await prisma.discordPriceAlertDelivery.count({ where: { alertId: alert.id } })).toBe(0);
  });

  it('claims each guild/date market digest exactly once and permits only an explicit failed-send retry', async () => {
    const guild = `${prefix}-digest`; const asOf = new Date('2026-08-18T09:00:00.000Z');
    const input = { guildId: guild, periodKey: '2026-08-18', source: 'SLICE_MARKET', dataStatus: 'LIVE', asOf };
    const claims = await Promise.all([repository.claimMarketDigest(input), repository.claimMarketDigest(input)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await repository.failMarketDigest(guild, input.periodKey, 'DISCORD_SEND_FAILED');
    expect(await repository.claimMarketDigest(input)).toBe(true);
    await repository.completeMarketDigest(guild, input.periodKey, 'market-channel', 'message');
    expect(await repository.claimMarketDigest(input)).toBe(false);
  });
});
