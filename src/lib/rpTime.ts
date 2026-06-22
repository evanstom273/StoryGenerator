import type { RpCalendarConfig, RpConfig, RpRecurringEvent, RpTimeState } from "../types/models";

const DEFAULT_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DEFAULT_WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonth(month: number /* 1-12 */, _year: number): number {
  return DAYS_IN_MONTH[(month - 1) % 12] ?? 30;
}

export function advanceTime(t: RpTimeState, minutes: number): RpTimeState {
  if (minutes === 0) return t;

  let totalMin = t.minute + minutes;
  let hour = t.hour + Math.floor(totalMin / 60);
  let newMinute = ((totalMin % 60) + 60) % 60;
  if (totalMin % 60 < 0) hour -= 1;

  let daysDelta = Math.floor(hour / 24);
  let newHour = ((hour % 24) + 24) % 24;
  if (hour % 24 < 0) daysDelta -= 1;

  let day = t.day - 1 + daysDelta; // 0-indexed
  let month = t.month; // 1-indexed
  let year = t.year;

  while (day >= daysInMonth(month, year)) {
    day -= daysInMonth(month, year);
    month++;
    if (month > 12) { month = 1; year++; }
  }
  while (day < 0) {
    month--;
    if (month < 1) { month = 12; year--; }
    day += daysInMonth(month, year);
  }

  const storyDayDelta = Math.floor((t.hour * 60 + t.minute + minutes) / 1440) - Math.floor((t.hour * 60 + t.minute) / 1440);

  return {
    year,
    month,
    day: day + 1,
    hour: newHour,
    minute: newMinute,
    storyDay: t.storyDay + Math.max(0, storyDayDelta),
  };
}

export function getDayOfWeek(t: RpTimeState, cal?: RpCalendarConfig): string {
  const names = cal?.weekdayNames ?? DEFAULT_WEEKDAY_NAMES;
  // Use Date API for day-of-week calculation (Gregorian mapping)
  const d = new Date(t.year, t.month - 1, t.day);
  return names[d.getDay() % names.length] ?? names[0] ?? "Sunday";
}

function getMonthName(t: RpTimeState, cal?: RpCalendarConfig): string {
  const names = cal?.monthNames ?? DEFAULT_MONTH_NAMES;
  return names[(t.month - 1) % names.length] ?? String(t.month);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatHourMinute(t: RpTimeState): string {
  const h = t.hour % 12 || 12;
  const ampm = t.hour < 12 ? "am" : "pm";
  return `${h}:${pad2(t.minute)}${ampm}`;
}

export function formatTime(t: RpTimeState, config: RpConfig): string {
  const cal = config.calendarConfig;
  const dow = getDayOfWeek(t, cal);
  const month = getMonthName(t, cal);
  const suffix = cal?.yearSuffix ? ` ${cal.yearSuffix}` : "";
  return `${dow}, ${t.day} ${month} ${t.year}${suffix} · Day ${t.storyDay} · ${formatHourMinute(t)}`;
}

export function formatTimeShort(t: RpTimeState, config: RpConfig): string {
  const cal = config.calendarConfig;
  const dow = getDayOfWeek(t, cal).slice(0, 3); // Mon, Tue, etc.
  return `${dow} · Day ${t.storyDay} · ${formatHourMinute(t)}`;
}

export function timesDiffer(a: RpTimeState, b: RpTimeState): boolean {
  return a.year !== b.year || a.month !== b.month || a.day !== b.day
    || a.hour !== b.hour || a.minute !== b.minute;
}

export function minutesBetween(a: RpTimeState, b: RpTimeState): number {
  // Approximate using storyDay + hour + minute
  const aTotal = (a.storyDay - 1) * 1440 + a.hour * 60 + a.minute;
  const bTotal = (b.storyDay - 1) * 1440 + b.hour * 60 + b.minute;
  return bTotal - aTotal;
}

export function checkRecurringEvents(
  prev: RpTimeState,
  next: RpTimeState,
  events: RpRecurringEvent[],
): { triggered: RpRecurringEvent[]; updated: RpRecurringEvent[] } {
  const triggered: RpRecurringEvent[] = [];
  const updated = events.map((event) => {
    const dueMins = (event.nextDue.storyDay - 1) * 1440 + event.nextDue.hour * 60 + event.nextDue.minute;
    const prevMins = (prev.storyDay - 1) * 1440 + prev.hour * 60 + prev.minute;
    const nextMins = (next.storyDay - 1) * 1440 + next.hour * 60 + next.minute;
    if (dueMins > prevMins && dueMins <= nextMins) {
      triggered.push(event);
      // Advance nextDue by intervalDays
      return { ...event, nextDue: advanceTime(event.nextDue, event.intervalDays * 1440) };
    }
    return event;
  });
  return { triggered, updated };
}

export function formatRecurringAmount(event: RpRecurringEvent, currencyName: string): string {
  const sign = event.amount >= 0 ? "+" : "";
  return `${sign}${event.amount} ${currencyName}`;
}
