// money-hub patch: the Monthly budget card's forecast, bills apart (owner, 2026-10-01, on "Day 1 / 31,
// $9,012.42 forecast, $5,012.42 over budget": "this needs a rework"). Wealthfolio forecasts spent so far
// plus the last 3 months' average day times the days left. That average has every bill in it (the
// mortgage is a third of it), so on the 1st, with the mortgage just paid, it was counted twice.
//
// Here: spent so far + each bill and subscription still due this month (Subscriptions & bills, on its
// own date, your part of a shared one) + an everyday day (the last 3 months' spending less the bills
// charged in them, per day) times the days left.
import type { Stream } from "./subscriptions";

const MONTHS: Record<Stream["every"], number> = { month: 1, quarter: 3, "half-year": 6, year: 12 };

/** The date `months` on, the day kept (or the month's last). */
export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10);
}

/** Your part of a charge: a shared bill with "Count only my part" on counts only that in Spending. */
const myPart = (s: Stream, amount: number) =>
  s.sharedOn && s.billUsual && s.billUsual > 0 ? (amount * s.usual) / s.billUsual : amount;

export interface BillDue {
  key: string;
  name: string;
  date: string;
  amount: number;
}

export interface ForecastParts {
  /** The bills and subscriptions still to come this month, by date. */
  billsLeft: BillDue[];
  billsLeftTotal: number;
  /** An everyday day: the last 3 months' spending less their bills, per day. */
  everydayDaily: number;
  /** The bills charged in those 3 months (taken out of the average). */
  billsInHistory: number;
}

/**
 * `monthStart`/`monthEnd`: the budget month (YYYY-MM-DD); `histStart`/`histEnd`: the 3 months before
 * it; `historyOutflow`: what Spending counted in them; `historyDays`: their length. Hidden streams and
 * the ones paid inside the mortgage (escrow) are not Spending's charges, so they count nowhere; a
 * stopped one counts in the past, not in what is still due.
 */
export function forecastParts(
  streams: Stream[],
  opts: {
    monthStart: string;
    monthEnd: string;
    histStart: string;
    histEnd: string;
    historyOutflow: number;
    historyDays: number;
  },
): ForecastParts {
  const billsLeft: BillDue[] = [];
  let billsInHistory = 0;
  for (const s of streams) {
    if (s.hidden || s.escrow) continue;
    for (const c of s.charges ?? []) {
      if (c.date >= opts.histStart && c.date <= opts.histEnd) billsInHistory += myPart(s, c.amount);
    }
    if (s.status === "stopped" || !s.next || !(s.usual > 0)) continue;
    // Still due: from its next date (a late one that is still this month counts) to the month's end.
    let date = s.next;
    for (let i = 0; date <= opts.monthEnd && i < 31; i += 1) {
      if (date >= opts.monthStart)
        billsLeft.push({ key: s.key, name: s.name, date, amount: s.usual });
      date = addMonthsISO(date, MONTHS[s.every] ?? 1);
    }
  }
  billsLeft.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
  const round = (x: number) => Math.round(x * 100) / 100;
  const everyday = Math.max(0, opts.historyOutflow - billsInHistory);
  return {
    billsLeft,
    billsLeftTotal: round(billsLeft.reduce((sum, b) => sum + b.amount, 0)),
    everydayDaily: opts.historyDays > 0 ? everyday / opts.historyDays : 0,
    billsInHistory: round(billsInHistory),
  };
}

/** The month's forecast: spent so far, the bills still due, and the everyday days left. */
export const forecastFrom = (spent: number, parts: ForecastParts, daysRemaining: number) =>
  spent + parts.billsLeftTotal + parts.everydayDaily * daysRemaining;
