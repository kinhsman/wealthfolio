// money-hub patch: a month of subscriptions and bills (owner, 2026-10-02: "add the paid / left line to
// the dashboard card too ... also add a small calendar for projected bill dates"). Paid = the month's
// charges; left to pay = what is still to come by the month's end; a month ahead = where each one's
// rhythm lands. Counted like the Monthly budget card (lib/budget-forecast.ts): your part of a shared
// bill, nothing paid inside the mortgage (escrow), a stopped one never due.
import { dueInMonth, paidInMonth, type BillDue } from "./budget-forecast";
import type { Stream } from "./subscriptions";

export interface BillMonth {
  /** YYYY-MM-DD, the month's first and last day. */
  start: string;
  end: string;
  /** "October"; with the year when it is not this year. */
  label: string;
  /** 0 = Sunday: where the 1st sits in the week. */
  firstWeekday: number;
  days: number;
  paid: BillDue[];
  left: BillDue[];
  paidTotal: number;
  leftTotal: number;
  /** How many subscriptions and bills have a charge in it, and how many it has in all. */
  paidCount: number;
  count: number;
  /** Each day's bills, paid or still to come; a late one shows on today. */
  byDay: Map<string, (BillDue & { paid: boolean })[]>;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sumOf = (xs: BillDue[]) => Math.round(xs.reduce((a, b) => a + b.amount, 0) * 100) / 100;

export interface BillSpan {
  paidTotal: number;
  leftTotal: number;
  /** How many subscriptions and bills have a charge in the span, and how many it has in all (with what is still to pay). */
  paidCount: number;
  count: number;
}

/**
 * The same sums over the Spending page's range (owner, 10-04: "changing the time on top doesnt move the
 * subscription and bills widget numbers"): what was charged from `from` to `to` (YYYY-MM-DD), counted the way a
 * month is, and what is still to pay only when the range reaches this month. Last month is September's
 * charges and nothing left; this month and 3M/6M/YTD/1Y end today, so they carry this month's left to pay.
 */
export function billSpan(items: Stream[], today: string, from: string, to: string): BillSpan {
  const thisMonth = today.slice(0, 7);
  const lastMonth = (to < today ? to : today).slice(0, 7);
  const paid: BillDue[] = [];
  const [fy, fm] = from.split("-").map(Number);
  // Month by month from the range's first month to its last (never past this month, 10 years at most).
  for (let i = 0; i < 120; i += 1) {
    const first = new Date(fy, fm - 1 + i, 1);
    const start = ymd(first);
    if (start.slice(0, 7) > lastMonth) break;
    const end = ymd(new Date(first.getFullYear(), first.getMonth() + 1, 0));
    items.forEach((s) =>
      paidInMonth(s, start, end).forEach((b) => {
        if (b.date >= from && b.date <= to) paid.push(b);
      }),
    );
  }
  let left: BillDue[] = [];
  if (from.slice(0, 7) <= thisMonth && to.slice(0, 7) >= thisMonth) {
    const [ty, tm] = today.split("-").map(Number);
    const start = ymd(new Date(ty, tm - 1, 1));
    const end = ymd(new Date(ty, tm, 0));
    left = items.flatMap((s) => dueInMonth(s, start, end));
  }
  const paidKeys = new Set(paid.map((b) => b.key));
  return {
    paidTotal: sumOf(paid),
    leftTotal: sumOf(left),
    paidCount: paidKeys.size,
    count: new Set([...paidKeys, ...left.map((b) => b.key)]).size,
  };
}

/** `offset` months from `today`'s month (0 = this month). */
export function billMonth(items: Stream[], today: string, offset = 0): BillMonth {
  const [y, m] = today.split("-").map(Number);
  const first = new Date(y, m - 1 + offset, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const start = ymd(first);
  const end = ymd(last);
  const paid = offset > 0 ? [] : items.flatMap((s) => paidInMonth(s, start, end)).sort((a, b) => a.date.localeCompare(b.date));
  const left =
    offset < 0
      ? []
      : items
          .flatMap((s) => dueInMonth(s, start, end, { later: offset > 0 }))
          .sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
  const byDay: BillMonth["byDay"] = new Map();
  const put = (b: BillDue, isPaid: boolean) => {
    const day = b.late ? today : b.date;
    byDay.set(day, [...(byDay.get(day) ?? []), { ...b, paid: isPaid }]);
  };
  paid.forEach((b) => put(b, true));
  left.forEach((b) => put(b, false));
  const paidKeys = new Set(paid.map((b) => b.key));
  const thisYear = first.getFullYear() === new Date(`${today}T12:00:00`).getFullYear();
  return {
    start,
    end,
    label: first.toLocaleDateString(undefined, { month: "long", ...(thisYear ? {} : { year: "numeric" }) }),
    firstWeekday: first.getDay(),
    days: last.getDate(),
    paid,
    left,
    paidTotal: sumOf(paid),
    leftTotal: sumOf(left),
    paidCount: paidKeys.size,
    count: new Set([...paidKeys, ...left.map((b) => b.key)]).size,
    byDay,
  };
}
