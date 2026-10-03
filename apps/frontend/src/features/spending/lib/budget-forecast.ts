// money-hub patch: the Monthly budget card's forecast, bills apart (owner, 2026-10-01, on "Day 1 / 31,
// $9,012.42 forecast, $5,012.42 over budget": "this needs a rework"). Wealthfolio forecasts spent so far
// plus the last 3 months' average day times the days left. That average has every bill in it (the
// mortgage is a third of it), so on the 1st, with the mortgage just paid, it was counted twice.
//
// Here: spent so far + each bill and subscription still due this month (Subscriptions & bills, on its
// own date, your part of a shared one) + an everyday day (the last 3 months' spending less the bills
// charged in them, per day) times the days left.
//
// Read the owner's way (10-01: "only take the 4000 minus the mortgate pay as the budget calculation for
// forcast and use other transactions to forcast toward this budget, but the budget show in the app should
// be still 4000"): the fixed bills already paid this month come off the budget, and everything else is
// forecast against what is left. The same sums, said that way on the card.
import { advancePeriodISO, type Stream } from "./subscriptions";

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
  /** Due before the month began and not charged yet (its date then): it comes this month, once, and
   *  counts from the month's first day. */
  late?: string;
}

/**
 * Its charges still to come between `monthStart` and `monthEnd`, from its next date on, its usual amount
 * (your part of a shared one). One late from an earlier month comes once, now; a stopped one, a hidden
 * one and one paid inside the mortgage (escrow) come never.
 */
export function dueInMonth(s: Stream, monthStart: string, monthEnd: string, opts: { later?: boolean } = {}): BillDue[] {
  if (s.hidden || s.escrow || s.status === "stopped" || !s.next || !(s.usual > 0)) return [];
  let date = s.next;
  if (date < monthStart) {
    // This month: late, it comes now. A later month (`later`, the bill calendar): where its rhythm lands.
    if (!opts.later) return [{ key: s.key, name: s.name, date: monthStart, amount: s.usual, late: s.next }];
    for (let i = 0; date < monthStart && i < 400; i += 1) date = advancePeriodISO(s.next, s.every, i + 1);
  }
  const out: BillDue[] = [];
  for (let i = 0; date <= monthEnd && i < 31; i += 1) {
    out.push({ key: s.key, name: s.name, date, amount: s.usual });
    date = advancePeriodISO(date, s.every, 1);
  }
  return out;
}

/**
 * Its charges between `monthStart` and `monthEnd` (a credit back counts against them), your part of a
 * shared one as Owly split it (the whole charge when it was not split). Hidden and escrow: none.
 */
export function paidInMonth(s: Stream, monthStart: string, monthEnd: string): BillDue[] {
  if (s.hidden || s.escrow) return [];
  const plan = new Map((s.shared?.plan ?? []).map((p) => [p.id, p]));
  return (s.charges ?? [])
    .filter((c) => c.date >= monthStart && c.date <= monthEnd)
    .map((c) => {
      const p = s.sharedOn ? plan.get(c.id) : undefined;
      return { key: s.key, name: s.name, date: c.date, amount: p?.ok ? p.mine : c.amount };
    });
}

export interface ForecastParts {
  /** The bills and subscriptions still to come this month, by date (not the fixed ones). */
  billsLeft: BillDue[];
  billsLeftTotal: number;
  /** An everyday day: the last 3 months' spending less their bills, per day, a one-off big day counted
   *  only up to `everydayCap` (owner, 10-01: two cash advances, an ATM pull and a $1,203 Apple buy had
   *  made the rate $105 a day). */
  everydayDaily: number;
  /** The most one day counts (Infinity: no day was far out); and how many days were over it. */
  everydayCap: number;
  cappedDays: number;
  /** The bills charged in those 3 months (taken out of the average). */
  billsInHistory: number;
  /** The bills switched to "Exclude from forecast": this month's charges paid and still due. They come
   *  off the budget as they are and are never forecast. */
  fixedPaid: BillDue[];
  fixedDue: BillDue[];
  fixedNames: string[];
  /** Their charges in the 3 months before: the budget's pace leaves them out of its usual month. */
  fixedHistory: BillDue[];
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
    /** Spending by day over the 3 months: with it, the everyday rate leaves one-off big days out. */
    historyByDay?: { date: string; outflow: number }[];
  },
): ForecastParts {
  const billsLeft: BillDue[] = [];
  const fixedPaid: BillDue[] = [];
  const fixedDue: BillDue[] = [];
  const fixedNames: string[] = [];
  const fixedHistory: BillDue[] = [];
  let billsInHistory = 0;
  for (const s of streams) {
    if (s.hidden || s.escrow) continue;
    const fixed = !!s.excludeFromForecast;
    if (fixed) fixedNames.push(s.name);
    for (const c of s.charges ?? []) {
      // Marked paid where the app cannot see it: in no transaction, so never in what was spent.
      if (c.outside) continue;
      if (c.date >= opts.histStart && c.date <= opts.histEnd) {
        billsInHistory += myPart(s, c.amount);
        if (fixed)
          fixedHistory.push({
            key: s.key,
            name: s.name,
            date: c.date,
            amount: myPart(s, c.amount),
          });
      }
      if (fixed && c.date >= opts.monthStart && c.date <= opts.monthEnd)
        fixedPaid.push({ key: s.key, name: s.name, date: c.date, amount: myPart(s, c.amount) });
    }
    // Still due: from its next date to the month's end; a late one comes this month, once (the
    // Subscriptions & Bills page counts "Left to pay" the same way).
    (fixed ? fixedDue : billsLeft).push(...dueInMonth(s, opts.monthStart, opts.monthEnd));
  }
  billsLeft.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
  const rate = everydayRate(streams, opts, billsInHistory);
  return {
    billsLeft,
    billsLeftTotal: round(sumOf(billsLeft)),
    ...rate,
    billsInHistory: round(billsInHistory),
    fixedPaid,
    fixedDue,
    fixedNames,
    fixedHistory,
  };
}

const round = (x: number) => Math.round(x * 100) / 100;
const sumOf = (xs: { amount: number }[]) => xs.reduce((sum, b) => sum + b.amount, 0);

/**
 * The month against the budget, the owner's way (10-01: "only take the 4000 minus the mortgate pay as
 * the budget calculation for forcast and use other transactions to forcast toward this budget, but the
 * budget show in the app should be still 4000"): the fixed bills (paid, never more than spent, and still
 * due) come off the budget; everything else is forecast against what is left: spent so far besides them,
 * the other bills still due, and an everyday day for each day left. `over` above zero = over budget.
 */
export function againstBudget(
  target: number,
  spent: number,
  parts: ForecastParts,
  daysRemaining: number,
) {
  const fixedPaid = Math.min(sumOf(parts.fixedPaid), Math.max(0, spent));
  const fixed = fixedPaid + sumOf(parts.fixedDue);
  const spentOthers = Math.max(0, spent - fixedPaid);
  const others = spentOthers + parts.billsLeftTotal + parts.everydayDaily * daysRemaining;
  const room = target - fixed;
  return { fixed, room, others, spentOthers, over: others - room };
}

/**
 * The budget's pace with fixed bills (owner, 10-01: "$866 over pace" on the 1st with only the mortgage
 * paid): each fixed bill counts on its own day, and the rest of the budget follows the usual month's
 * shape of everything else. `pctOthers[day]`: the share of the usual month's other spending done by
 * that day (null: an even spread).
 */
export function paceWithFixed(
  parts: ForecastParts,
  target: number,
  daysInMonth: number,
  pctOthers: number[] | null,
): (day: number) => number {
  const fixed = [...parts.fixedPaid, ...parts.fixedDue].map((b) => ({
    day: Number(b.date.slice(8, 10)),
    amount: b.amount,
  }));
  const room = Math.max(0, target - sumOf(fixed));
  return (day: number) => {
    const upTo = fixed.reduce((sum, f) => (f.day <= day ? sum + f.amount : sum), 0);
    const pct = pctOthers?.[day] ?? day / daysInMonth;
    return upTo + room * pct;
  };
}

/** Days of spending with the given charges taken off (never below zero). */
export function withoutCharges<T extends { date: string; outflow: number }>(
  days: T[],
  charges: BillDue[],
): T[] {
  if (!charges.length) return days;
  const off = new Map<string, number>();
  for (const c of charges) off.set(c.date, (off.get(c.date) ?? 0) + c.amount);
  return days.map((d) => {
    const x = off.get(d.date.slice(0, 10)) ?? 0;
    return x ? { ...d, outflow: Math.max(0, d.outflow - x) } : d;
  });
}

/** A quantile of sorted numbers, Python's statistics.quantiles "exclusive" way. */
function quantile(sorted: number[], q: number): number {
  const n = sorted.length;
  const h = (n + 1) * q;
  if (h <= 1) return sorted[0];
  if (h >= n) return sorted[n - 1];
  const lo = Math.floor(h);
  return sorted[lo - 1] + (h - lo) * (sorted[lo] - sorted[lo - 1]);
}

/**
 * The most one ordinary day of everyday spending comes to: far above the usual days (the upper quartile
 * plus 3 times the spread between the quartiles, Tukey's "far out" fence). From the days themselves, so
 * nothing is set by hand. Infinity with too few days to tell, or when most days are empty.
 */
export function oneOffLine(days: number[]): number {
  if (days.length < 28) return Infinity;
  const sorted = [...days].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const line = q3 + 3 * (q3 - q1);
  return line > 0 ? line : Infinity;
}

/** The everyday rate: each day's spending less that day's bills, a one-off big day counted up to the line. */
function everydayRate(
  streams: Stream[],
  opts: {
    histStart: string;
    histEnd: string;
    historyOutflow: number;
    historyDays: number;
    historyByDay?: { date: string; outflow: number }[];
  },
  billsInHistory: number,
): { everydayDaily: number; everydayCap: number; cappedDays: number } {
  if (!opts.historyByDay) {
    const everyday = Math.max(0, opts.historyOutflow - billsInHistory);
    return {
      everydayDaily: opts.historyDays > 0 ? everyday / opts.historyDays : 0,
      everydayCap: Infinity,
      cappedDays: 0,
    };
  }
  const bills = new Map<string, number>();
  for (const s of streams) {
    if (s.hidden || s.escrow) continue;
    for (const c of s.charges ?? []) {
      if (c.outside) continue;
      if (c.date >= opts.histStart && c.date <= opts.histEnd)
        bills.set(c.date, (bills.get(c.date) ?? 0) + myPart(s, c.amount));
    }
  }
  const spent = new Map<string, number>();
  for (const d of opts.historyByDay)
    spent.set(d.date.slice(0, 10), (spent.get(d.date.slice(0, 10)) ?? 0) + d.outflow);
  const days: number[] = [];
  for (
    let date = opts.histStart, i = 0;
    date <= opts.histEnd && i < 400;
    date = addDaysISO(date, 1), i += 1
  ) {
    days.push(Math.max(0, (spent.get(date) ?? 0) - (bills.get(date) ?? 0)));
  }
  if (!days.length) return { everydayDaily: 0, everydayCap: Infinity, cappedDays: 0 };
  const cap = oneOffLine(days);
  const total = days.reduce((sum, v) => sum + Math.min(v, cap), 0);
  return {
    everydayDaily: total / days.length,
    everydayCap: cap,
    cappedDays: days.filter((v) => v > cap).length,
  };
}

const addDaysISO = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
