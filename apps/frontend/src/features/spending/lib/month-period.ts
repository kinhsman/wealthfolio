import type { DateRange } from "@/lib/types";
import type { FormattingApi } from "@wealthfolio/ui";

import type { ReportsRange } from "./reports-period";
import {
  addCalendarMonths,
  calendarDaysBetweenInclusive,
  calendarMonthsBetweenInclusive,
  daysInCalendarMonth,
  getZonedDateParts,
  zonedCalendarDateBoundaryToDate,
  type ZonedCalendarDate,
} from "./timezone";

export const SPENDING_MONTH_PARAM = "spendingMonth";
export const SPENDING_MONTH_STORAGE_KEY = "spending-month";

// money-hub patch (owner, 10-03: "Monthly budget always stuck at July 2026"): a month picked once was
// saved for good, so every visit reopened on it. The saved value now carries the pick time
// ("2026-07@1759500000000") and is only restored for a while; a plain "2026-07" from before this
// change has no time, so it counts as expired.
export const PERSISTED_MONTH_TTL_MS = 12 * 60 * 60 * 1000;

export function encodePersistedMonth(monthKey: string | null, now = Date.now()): string | null {
  return monthKey && parseMonthKey(monthKey) ? `${monthKey}@${now}` : null;
}

export function decodePersistedMonth(
  stored: string | null | undefined,
  now = Date.now(),
): string | null {
  if (!stored) return null;
  const [monthKey, pickedAt] = stored.split("@");
  const picked = Number(pickedAt);
  if (!parseMonthKey(monthKey) || !pickedAt || !Number.isFinite(picked)) return null;
  const age = now - picked;
  return age >= 0 && age < PERSISTED_MONTH_TTL_MS ? monthKey : null;
}

export function localDateFromParts(date: ZonedCalendarDate): Date {
  return new Date(date.year, date.month - 1, date.day);
}

export function monthKeyFromParts(date: Pick<ZonedCalendarDate, "year" | "month">): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}`;
}

export function parseMonthKey(
  value: string | null | undefined,
): { year: number; month: number } | null {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  return { year, month };
}

export function currentMonthKey(timezone?: string | null): string {
  return monthKeyFromParts(getZonedDateParts(new Date(), timezone));
}

export function addMonthsToMonthKey(monthKey: string, months: number): string {
  const parts = parseMonthKey(monthKey);
  if (!parts) return monthKey;
  return monthKeyFromParts(addCalendarMonths({ ...parts, day: 1 }, months));
}

export function monthRange(monthKey: string): DateRange {
  const parts = parseMonthKey(monthKey) ?? parseMonthKey(currentMonthKey());
  const month = parts ?? getZonedDateParts(new Date());
  const start = { ...month, day: 1 };
  const end = { ...month, day: daysInCalendarMonth(month.year, month.month) };
  return { from: localDateFromParts(start), to: localDateFromParts(end) };
}

export function monthReportsRange(monthKey: string, timezone?: string | null): ReportsRange | null {
  const month = parseMonthKey(monthKey);
  if (!month) return null;
  const start = { ...month, day: 1 };
  const end = { ...month, day: daysInCalendarMonth(month.year, month.month) };
  return {
    start: zonedCalendarDateBoundaryToDate(start, "start", timezone),
    end: zonedCalendarDateBoundaryToDate(end, "end", timezone),
    days: calendarDaysBetweenInclusive(start, end),
    months: calendarMonthsBetweenInclusive(start, end),
  };
}

export function monthLabel(
  monthKey: string,
  formatting: Pick<FormattingApi, "formatCalendarDate">,
  format: "long" | "short" = "long",
): string {
  const parts = parseMonthKey(monthKey);
  if (!parts) return "";
  return formatting.formatCalendarDate(
    { year: parts.year, month: parts.month, day: 1 },
    {
      calendar: "gregory",
      month: format,
      year: "numeric",
    },
  );
}

export function compactMonthLabel(
  monthKey: string,
  formatting: Pick<FormattingApi, "formatCalendarDate">,
): string {
  const parts = parseMonthKey(monthKey);
  if (!parts) return "";
  const month = formatting.formatCalendarDate(
    { year: parts.year, month: parts.month, day: 1 },
    {
      calendar: "gregory",
      month: "short",
    },
  );
  const year = formatting.formatCalendarDate(
    { year: parts.year, month: parts.month, day: 1 },
    {
      calendar: "gregory",
      year: "2-digit",
    },
  );
  return `${month} '${year}`;
}
