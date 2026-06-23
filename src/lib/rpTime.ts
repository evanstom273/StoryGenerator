import type { RpCalendarConfig, RpConfig, RpRecurringEvent, RpRecurringFrequency, RpTimeState } from "../types/models";

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
  const dow = getDayOfWeek(t, cal).slice(0, 3);
  return `${dow} · Day ${t.storyDay} · ${formatHourMinute(t)}`;
}

/** Ultra-compact format for the story toolbar chip: "D7 · 3pm" */
export function formatTimeCompact(t: RpTimeState): string {
  const h = t.hour % 12 || 12;
  const ampm = t.hour < 12 ? "am" : "pm";
  return `D${t.storyDay} · ${h}${ampm}`;
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

const FREQUENCY_ADVANCE_DAYS: Record<RpRecurringFrequency, number> = {
  weekly: 7,
  monthly: 30,
  annually: 365,
};

/** Advance nextDue to the next occurrence after it triggered. */
function advanceEventNextDue(event: RpRecurringEvent): RpTimeState {
  const from = event.nextDue;

  if (event.frequency === "monthly" && event.dayOfMonth != null) {
    const target = Math.max(1, Math.min(31, event.dayOfMonth));
    let month = from.month + 1;
    let year = from.year;
    if (month > 12) { month = 1; year++; }
    const day = Math.min(target, daysInMonth(month, year));
    const daysAdvanced = Math.round(
      (new Date(year, month - 1, day).getTime() - new Date(from.year, from.month - 1, from.day).getTime()) / 86400000,
    );
    return { ...from, year, month, day, storyDay: from.storyDay + Math.max(1, daysAdvanced) };
  }

  if (event.frequency === "annually") {
    const targetDay = event.dayOfMonth != null ? Math.max(1, Math.min(31, event.dayOfMonth)) : from.day;
    const targetMonth = event.month ?? from.month;
    const year = from.year + 1;
    const day = Math.min(targetDay, daysInMonth(targetMonth, year));
    const daysAdvanced = Math.round(
      (new Date(year, targetMonth - 1, day).getTime() - new Date(from.year, from.month - 1, from.day).getTime()) / 86400000,
    );
    return { ...from, year, month: targetMonth, day, storyDay: from.storyDay + Math.max(1, daysAdvanced) };
  }

  // weekly and fallback
  const days = FREQUENCY_ADVANCE_DAYS[event.frequency] ?? 7;
  return advanceTime(from, days * 1440);
}

/** Compute the initial nextDue for a new recurring event. */
export function computeInitialNextDue(from: RpTimeState, frequency: RpRecurringFrequency, dayOfWeek?: number, dayOfMonth?: number): RpTimeState {
  if (frequency === "weekly" && dayOfWeek != null) {
    const d = new Date(from.year, from.month - 1, from.day);
    const currentDow = d.getDay();
    let daysUntil = (dayOfWeek - currentDow + 7) % 7;
    if (daysUntil === 0) daysUntil = 7; // same day → schedule for next week
    return advanceTime(from, daysUntil * 1440);
  }
  if (frequency === "monthly" && dayOfMonth != null) {
    const target = Math.max(1, Math.min(31, dayOfMonth));
    let year = from.year, month = from.month;
    // If the target day is still in the future this month, use this month; otherwise next
    if (from.day >= target) { month++; if (month > 12) { month = 1; year++; } }
    const actualDay = Math.min(target, daysInMonth(month, year));
    const daysUntil = Math.max(1, (new Date(year, month - 1, actualDay).getTime() - new Date(from.year, from.month - 1, from.day).getTime()) / 86400000);
    return advanceTime(from, Math.round(daysUntil) * 1440);
  }
  // annually or fallback: advance by frequency interval
  const days = FREQUENCY_ADVANCE_DAYS[frequency] ?? 7;
  return advanceTime(from, days * 1440);
}

export function checkRecurringEvents(
  prev: RpTimeState,
  next: RpTimeState,
  events: RpRecurringEvent[],
): { triggered: RpRecurringEvent[]; updated: RpRecurringEvent[] } {
  const triggered: RpRecurringEvent[] = [];
  // Use storyDay for comparison; fall back to 0 if storyDay missing to avoid false triggers
  const prevMins = Math.max(0, (prev.storyDay - 1)) * 1440 + prev.hour * 60 + prev.minute;
  const nextMins = Math.max(0, (next.storyDay - 1)) * 1440 + next.hour * 60 + next.minute;
  const updated = events.map((event) => {
    let current = event;
    let dueMins = Math.max(0, (current.nextDue.storyDay - 1)) * 1440 + current.nextDue.hour * 60 + current.nextDue.minute;
    // Self-heal stale nextDue: advance until it's after prev
    while (dueMins <= prevMins) {
      current = { ...current, nextDue: advanceEventNextDue(current) };
      dueMins = Math.max(0, (current.nextDue.storyDay - 1)) * 1440 + current.nextDue.hour * 60 + current.nextDue.minute;
    }
    if (nextMins > prevMins && dueMins <= nextMins) {
      triggered.push(event);
      return { ...current, nextDue: advanceEventNextDue(current) };
    }
    return current;
  });
  return { triggered, updated };
}

export function formatRecurringAmount(event: RpRecurringEvent, currencyName: string): string {
  if (event.amountMin != null && event.amountMax != null) {
    const lo = event.amountMin >= 0 ? `+${event.amountMin}` : String(event.amountMin);
    const hi = event.amountMax >= 0 ? `+${event.amountMax}` : String(event.amountMax);
    return `${lo}–${hi} ${currencyName}`;
  }
  const sign = event.amount >= 0 ? "+" : "";
  return `${sign}${event.amount} ${currencyName}`;
}
