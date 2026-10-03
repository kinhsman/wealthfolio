// money-hub patch: the cash forecast (owner, 2026-10-02/03, from the Monarch comparison): the free cash
// accounts' balance day by day ahead, from what repeats on them (paychecks, rent, the mortgage, the phone)
// and each card's payment on its due date. Worked out by the money-hub service
// (/api/money-hub/cash-forecast, server/drive-backup/lib/cashForecast.js).
import { useQuery } from "@tanstack/react-query";

export interface ForecastEvent {
  date: string;
  name: string;
  amount: number;
  /** in / out: a repeating payment; statement / next / usual / owed: a card payment. */
  why: "in" | "out" | "statement" | "next" | "usual" | "owed";
  estimated: boolean;
  every?: "biweekly" | "monthly";
  /** One payment split over several deposits (a paycheck in three accounts). */
  parts?: number;
  card?: string;
}

export interface CashForecast {
  horizon: number;
  now: string;
  until: string;
  start: number;
  cushion: number;
  days: { date: string; balance: number }[];
  events: ForecastEvent[];
  low: { date: string; balance: number };
  end: number;
  /** The first day under the cushion, or null. */
  under: string | null;
}

export const FORECAST_HORIZONS = [30, 60, 90] as const;

export function useCashForecast(days: number) {
  return useQuery({
    queryKey: ["money-hub", "cash-forecast", days],
    queryFn: async (): Promise<CashForecast> => {
      const res = await fetch(`/api/money-hub/cash-forecast?days=${days}`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || `The money app helper said ${res.status}`);
      return data as CashForecast;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** "Oct 9". */
export const shortDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** A payment's name without the bank's words: the owner's label before a colon ("Rent received: Zelle
 *  payment from…" -> "Rent received"), else the payee as the bank wrote it, shortened. */
const BANK_PREFIX = /^(DEBIT CARD PURCHASE|POS PURCHASE|PURCHASE AUTHORIZED ON \S+|ACH ELECTRONIC CREDIT|ACH CREDIT|ACH DEBIT|ELECTRONIC CREDIT|DIRECT DEPOSIT|DIRECT DEBIT|ONLINE PAYMENT|RECURRING PAYMENT)\s+/i;
const titleCase = (s: string) => s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());

export function plainName(name: string): string {
  const t = String(name || "").trim();
  const head = t.split(":")[0].trim();
  // The owner's labels are written in lower case; a bank's "PPD ID:" is not one.
  if (head && head !== t && head.length >= 4 && /\p{Ll}/u.test(head)) return head.replace(/\s*\(on the Rental page\)/i, "");
  // The bank's line: its filler in front, the store number after a star, ids and phone numbers go.
  let n = t.replace(BANK_PREFIX, "").replace(/\*.*$/, "").replace(/\b(PPD|WEB|CO)?\s*ID:?.*$/i, "").replace(/[\d-]{6,}.*$/, "").trim() || t;
  const letters = n.replace(/[^\p{L}]/gu, "");
  if (letters && letters.replace(/[^\p{Lu}]/gu, "").length / letters.length > 0.7) n = titleCase(n);
  return n.length > 36 ? `${n.slice(0, 35).trim()}…` : n;
}

/** What a card payment is, in a few words. */
export function cardWhy(why: ForecastEvent["why"]): string {
  if (why === "statement") return "statement due";
  if (why === "next") return "next statement, estimated";
  if (why === "usual") return "usual payment, estimated";
  if (why === "owed") return "balance, estimated";
  return "";
}

/** The step path of the balance through the days, in a `w` by `h` box between `min` and `max`. */
export function stepPath(balances: number[], { w, h, min, max }: { w: number; h: number; min: number; max: number }): string {
  if (!balances.length) return "";
  const span = max - min || 1;
  const y = (v: number) => h - ((v - min) / span) * h;
  const x = (i: number) => (balances.length === 1 ? 0 : (i / (balances.length - 1)) * w);
  let d = `M ${x(0).toFixed(2)} ${y(balances[0]).toFixed(2)}`;
  for (let i = 1; i < balances.length; i += 1) {
    d += ` H ${x(i).toFixed(2)}`;
    if (balances[i] !== balances[i - 1]) d += ` V ${y(balances[i]).toFixed(2)}`;
  }
  return d;
}

/** A scale that ends on round numbers: `lo` and `hi` widened to steps of 1, 2 or 5 times a power of ten. */
export function niceScale(lo: number, hi: number): { min: number; max: number } {
  const range = Math.max(hi - lo, 1);
  const mag = 10 ** Math.floor(Math.log10(range));
  const r = range / mag;
  const step = r < 2 ? mag / 5 : r < 5 ? mag / 2 : mag;
  return { min: Math.max(0, Math.floor(lo / step) * step), max: Math.ceil(hi / step) * step };
}
