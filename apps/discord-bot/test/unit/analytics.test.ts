import { describe, expect, it } from 'vitest';
import { ANALYTICS_DAILY_RETENTION_DAYS, ANALYTICS_HEARTBEAT_RETENTION_DAYS, analyticsDay, analyticsPeriodStart, analyticsRetentionStart, heartbeatStatus } from '../../src/analytics.js';

describe('analytics boundaries', () => {
  it('uses a canonical UTC day bucket and bounded periods', () => {
    expect(analyticsDay(new Date('2026-08-19T23:59:59-04:00')).toISOString()).toBe('2026-08-20T00:00:00.000Z');
    expect(analyticsPeriodStart('24h', new Date('2026-08-20T12:00:00Z')).toISOString()).toBe('2026-08-19T12:00:00.000Z');
    expect(analyticsPeriodStart('30d', new Date('2026-08-20T12:00:00Z')).toISOString()).toBe('2026-07-21T12:00:00.000Z');
  });
  it('classifies heartbeat freshness without exposing infrastructure details', () => {
    const now = new Date('2026-08-20T12:00:00Z');
    expect(heartbeatStatus(new Date('2026-08-20T11:58:00Z'), now, 'HEALTHY')).toBe('HEALTHY');
    expect(heartbeatStatus(new Date('2026-08-20T11:50:00Z'), now, 'HEALTHY')).toBe('DEGRADED');
    expect(heartbeatStatus(new Date('2026-08-20T11:00:00Z'), now, 'HEALTHY')).toBe('UNHEALTHY');
  });
  it('uses bounded aggregate and heartbeat retention windows', () => {
    const now = new Date('2026-08-20T12:00:00Z');
    expect(ANALYTICS_DAILY_RETENTION_DAYS).toBe(400);
    expect(ANALYTICS_HEARTBEAT_RETENTION_DAYS).toBe(90);
    expect(analyticsRetentionStart(1, now).toISOString()).toBe('2026-08-19T00:00:00.000Z');
    expect(analyticsRetentionStart(ANALYTICS_DAILY_RETENTION_DAYS, now).getUTCHours()).toBe(0);
  });
});
