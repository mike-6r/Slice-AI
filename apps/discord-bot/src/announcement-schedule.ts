import { DateTime, type WeekdayNumbers } from 'luxon';

export const SCHEDULE_TYPES = ['ONE_TIME', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM_WEEKDAYS'] as const;
export const PAYLOAD_MODES = ['SNAPSHOT', 'LIVE_DRAFT'] as const;
export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
export type ScheduleType = typeof SCHEDULE_TYPES[number];
export type PayloadMode = typeof PAYLOAD_MODES[number];
export type Weekday = typeof WEEKDAYS[number];
export type ScheduleTiming = { type: ScheduleType; timezone: string; localTime: string; date?: string; weekdays?: Weekday[]; dayOfMonth?: number };

const weekdayNumbers: Record<Weekday, WeekdayNumbers> = { MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6, SUN: 7 };

export function isIanaTimezone(value: string): boolean { return DateTime.now().setZone(value).isValid; }
export function parseLocalTime(value: string): { hour: number; minute: number } | null {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(value);
  return match ? { hour: Number(match[0].slice(0, 2)), minute: Number(match[0].slice(3, 5)) } : null;
}
export function validateTiming(timing: ScheduleTiming): string[] {
  const errors: string[] = [];
  if (!SCHEDULE_TYPES.includes(timing.type)) errors.push('Choose a supported schedule type.');
  if (!isIanaTimezone(timing.timezone)) errors.push('Use a valid IANA timezone, such as America/New_York.');
  if (!parseLocalTime(timing.localTime)) errors.push('Time must use 24-hour HH:mm format.');
  if (timing.type === 'ONE_TIME' && (!timing.date || !/^\d{4}-\d{2}-\d{2}$/.test(timing.date))) errors.push('One-time schedules need a YYYY-MM-DD date.');
  if (timing.type === 'WEEKLY' && (!timing.weekdays || timing.weekdays.length !== 1)) errors.push('Weekly schedules need exactly one weekday.');
  if (timing.type === 'CUSTOM_WEEKDAYS' && (!timing.weekdays?.length || timing.weekdays.some((day) => !WEEKDAYS.includes(day)))) errors.push('Custom weekdays need one or more valid weekdays.');
  if (timing.type === 'MONTHLY' && (!timing.dayOfMonth || timing.dayOfMonth < 1 || timing.dayOfMonth > 31)) errors.push('Monthly schedules need a day from 1 to 31.');
  return errors;
}

/** Converts a local intent to UTC. Luxon advances a spring-forward gap to the
 * first valid local time; ambiguous fall-back times choose the earlier instant. */
export function localIntentToUtc(date: string, localTime: string, timezone: string): Date | null {
  const time = parseLocalTime(localTime); if (!time || !isIanaTimezone(timezone)) return null;
  const local = DateTime.fromISO(`${date}T${localTime}`, { zone: timezone });
  if (!local.isValid) return null;
  const choices = local.getPossibleOffsets();
  return (choices.length > 1 ? choices.sort((a, b) => a.toMillis() - b.toMillis())[0] : local).toUTC().toJSDate();
}

export function nextOccurrence(timing: ScheduleTiming, after = new Date()): Date | null {
  if (validateTiming(timing).length) return null;
  if (timing.type === 'ONE_TIME') return localIntentToUtc(timing.date!, timing.localTime, timing.timezone);
  const time = parseLocalTime(timing.localTime)!;
  const afterLocal = DateTime.fromJSDate(after, { zone: timing.timezone });
  const candidateAt = (day: DateTime) => localIntentToUtc(day.toISODate()!, timing.localTime, timing.timezone);
  for (let offset = 0; offset < 370; offset += 1) {
    const day = afterLocal.startOf('day').plus({ days: offset });
    const weekday = day.weekday as WeekdayNumbers;
    const isDay = timing.type === 'DAILY'
      || (timing.type === 'WEEKLY' && weekday === weekdayNumbers[timing.weekdays![0]!])
      || (timing.type === 'CUSTOM_WEEKDAYS' && timing.weekdays!.some((value) => weekday === weekdayNumbers[value]))
      || (timing.type === 'MONTHLY' && day.day === timing.dayOfMonth);
    if (!isDay) continue;
    const candidate = candidateAt(day); if (candidate && candidate.getTime() > after.getTime()) return candidate;
  }
  void time;
  return null;
}

export function scheduleLabel(timing: ScheduleTiming): string {
  const day = timing.weekdays?.join('/') ?? (timing.dayOfMonth ? `day ${timing.dayOfMonth}` : timing.date ?? '');
  return `${timing.type.replaceAll('_', ' ')}${day ? ` · ${day}` : ''} · ${timing.localTime} ${timing.timezone}`;
}

export function parseWeekdays(value: string | null): Weekday[] | undefined {
  if (!value) return undefined;
  const days = [...new Set(value.split(/[ ,/]+/).map((item) => item.trim().toUpperCase()).filter(Boolean))] as Weekday[];
  return days.length && days.every((day) => WEEKDAYS.includes(day)) ? days : undefined;
}
