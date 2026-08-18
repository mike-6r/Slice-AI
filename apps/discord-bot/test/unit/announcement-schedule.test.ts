import { describe, expect, it } from 'vitest';
import { localIntentToUtc, nextOccurrence, parseWeekdays, validateTiming } from '../../src/announcement-schedule.js';

describe('announcement schedule wall-clock rules', () => {
  it('converts a one-time local date to UTC', () => expect(localIntentToUtc('2026-08-21', '09:00', 'America/New_York')?.toISOString()).toBe('2026-08-21T13:00:00.000Z'));
  it('validates IANA timezones and structured local time', () => { expect(validateTiming({ type: 'DAILY', timezone: 'America/New_York', localTime: '09:30' })).toEqual([]); expect(validateTiming({ type: 'DAILY', timezone: 'UTC+5', localTime: '9:30' }).length).toBeGreaterThan(0); });
  it('keeps daily schedules at the same local wall time', () => expect(nextOccurrence({ type: 'DAILY', timezone: 'America/New_York', localTime: '09:00' }, new Date('2026-03-08T12:30:00Z'))?.toISOString()).toBe('2026-03-08T13:00:00.000Z'));
  it('computes weekly recurrence from a selected weekday', () => expect(nextOccurrence({ type: 'WEEKLY', timezone: 'America/New_York', localTime: '10:00', weekdays: ['MON'] }, new Date('2026-08-18T14:01:00Z'))?.toISOString()).toBe('2026-08-24T14:00:00.000Z'));
  it('computes custom weekday recurrence', () => expect(nextOccurrence({ type: 'CUSTOM_WEEKDAYS', timezone: 'America/New_York', localTime: '09:30', weekdays: ['MON', 'WED', 'FRI'] }, new Date('2026-08-18T14:00:00Z'))?.toISOString()).toBe('2026-08-19T13:30:00.000Z'));
  it('skips invalid monthly dates instead of moving them', () => expect(nextOccurrence({ type: 'MONTHLY', timezone: 'America/New_York', localTime: '09:00', dayOfMonth: 31 }, new Date('2026-02-01T00:00:00Z'))?.toISOString()).toBe('2026-03-31T13:00:00.000Z'));
  it('advances spring-forward nonexistent local time deterministically', () => expect(localIntentToUtc('2026-03-08', '02:30', 'America/New_York')?.toISOString()).toBe('2026-03-08T07:30:00.000Z'));
  it('uses the earlier fall-back occurrence deterministically', () => expect(localIntentToUtc('2026-11-01', '01:30', 'America/New_York')?.toISOString()).toBe('2026-11-01T05:30:00.000Z'));
  it('requires one date for a one-time schedule', () => expect(validateTiming({ type: 'ONE_TIME', timezone: 'America/New_York', localTime: '09:00' }).length).toBeGreaterThan(0));
  it('requires one weekday for weekly scheduling', () => expect(validateTiming({ type: 'WEEKLY', timezone: 'America/New_York', localTime: '09:00', weekdays: ['MON', 'WED'] }).length).toBeGreaterThan(0));
  it('requires at least one custom weekday', () => expect(validateTiming({ type: 'CUSTOM_WEEKDAYS', timezone: 'America/New_York', localTime: '09:00' }).length).toBeGreaterThan(0));
  it('limits monthly day to valid configured range', () => expect(validateTiming({ type: 'MONTHLY', timezone: 'America/New_York', localTime: '09:00', dayOfMonth: 32 }).length).toBeGreaterThan(0));
  it('parses normalized weekday selections', () => expect(parseWeekdays('mon, wed / fri')).toEqual(['MON', 'WED', 'FRI']));
  it('rejects unstructured weekday selections', () => expect(parseWeekdays('MON, FUNDAY')).toBeUndefined());
});
