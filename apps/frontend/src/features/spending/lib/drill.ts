// money-hub patch: a store's page and a category's page (owner, 2026-10-03, from the Monarch comparison:
// "store page + category page: spend chart over time + every charge + totals"). What a set of transactions
// adds up to, by month, quarter or year. The pages: pages/spending-drill-page.tsx.
import type { CashActivity } from "../types/cash-activity";

export type Grain = "month" | "quarter" | "year";

/** Money back (a refund, a deposit) counts against what was spent. */
const BACK = new Set(["CREDIT", "DEPOSIT", "TRANSFER_IN", "INTEREST", "DIVIDEND"]);

/** What one entry adds to the spending (pure): + out, - back. */
export function spendOf(a: Pick<CashActivity, "activityType" | "amount">): number {
  const amt = Math.abs(Number(a.amount) || 0);
  return BACK.has(String(a.activityType)) ? -amt : amt;
}

const keyOf = (iso: string, grain: Grain) => {
  const y = iso.slice(0, 4);
  if (grain === "year") return y;
  const m = Number(iso.slice(5, 7));
  return grain === "quarter" ? `${y}-Q${Math.ceil(m / 3)}` : iso.slice(0, 7);
};

/** The periods from `from` to `to` (YYYY-MM-DD), oldest first. */
export function periodsBetween(from: string, to: string, grain: Grain): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const end = keyOf(to, grain);
  for (let i = 0; i < 400; i += 1) {
    const k = keyOf(`${y}-${String(m).padStart(2, "0")}-01`, grain);
    if (!out.includes(k)) out.push(k);
    if (k === end) break;
    m += grain === "month" ? 1 : grain === "quarter" ? 3 : 12;
    while (m > 12) { m -= 12; y += 1; }
  }
  return out;
}

export interface Bucket { key: string; spent: number; count: number }

/** Spending per period (pure), every period from `from` to `to`, empty ones too. */
export function bucketsOf(rows: Pick<CashActivity, "activityDate" | "activityType" | "amount">[], { from, to, grain }: { from: string; to: string; grain: Grain }): Bucket[] {
  const map = new Map(periodsBetween(from, to, grain).map((k) => [k, { key: k, spent: 0, count: 0 }]));
  for (const r of rows) {
    const d = String(r.activityDate).slice(0, 10);
    const b = map.get(keyOf(d, grain));
    if (!b) continue;
    b.spent = Math.round((b.spent + spendOf(r)) * 100) / 100;
    b.count += 1;
  }
  return [...map.values()];
}

/** The numbers beside the chart (pure). */
export function summaryOf(rows: Pick<CashActivity, "activityDate" | "activityType" | "amount">[]) {
  const outs = rows.filter((r) => spendOf(r) > 0);
  const spent = Math.round(rows.reduce((s, r) => s + spendOf(r), 0) * 100) / 100;
  const back = Math.round(rows.filter((r) => spendOf(r) < 0).reduce((s, r) => s - spendOf(r), 0) * 100) / 100;
  const dates = rows.map((r) => String(r.activityDate).slice(0, 10)).sort();
  const largest = outs.reduce<null | (typeof outs)[number]>((m, r) => (!m || spendOf(r) > spendOf(m) ? r : m), null);
  return {
    spent, back, count: rows.length,
    average: outs.length ? Math.round((outs.reduce((s, r) => s + spendOf(r), 0) / outs.length) * 100) / 100 : 0,
    largest: largest ? spendOf(largest) : 0,
    first: dates[0] ?? null,
    last: dates[dates.length - 1] ?? null,
  };
}

/** A period's label: "Oct", "Q3 '26", "2026". */
export function periodLabel(key: string, grain: Grain, long = false): string {
  if (grain === "year") return key;
  if (grain === "quarter") return long ? key.replace("-", " ") : `${key.slice(5)} '${key.slice(2, 4)}`;
  const d = new Date(`${key}-15T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: long ? "long" : "short", ...(long ? { year: "numeric" } : {}), timeZone: "UTC" });
}

/** The period a date falls in. */
export const periodOf = (iso: string, grain: Grain) => keyOf(iso, grain);
