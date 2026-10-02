// money-hub patch: Taxes (owner, 2026-10-02: "plan a new feature, taxes management"). One page per tax
// year from what the money app and WheelTradr already hold: the trading profit that is taxed, what was
// paid and for which year, the year's dates, the papers to expect, and gifts in and out (the two forms).
// The money-hub service works it all out (server/drive-backup/lib/taxes.js); this file reads it, sends
// the owner's picks, and words the small labels. It files nothing: an estimate to plan with.
import { useQuery, useQueryClient } from "@tanstack/react-query";

export type Treatment = "taxed" | "not_taxed" | "not_mine";
export type TaxAlertKind = "date" | "paper";

export interface TaxAccount {
  id: string;
  name: string;
  broker: string | null;
  logoUrl: string | null;
  /** The year's realized profit: trades closed, plus dividends, interest and fees. */
  realized: number;
  shortTerm: number;
  longTerm: number;
  /** Dividends, interest and fees. */
  other: number;
  closedTrades: number;
  treatment: Treatment;
  /** Read from the account's name, not picked by the owner. */
  guessed: boolean;
  /** What the open positions are up or down right now; null when WheelTradr did not say. */
  openPnl: number | null;
}

export interface TaxPayment {
  id: string;
  date: string;
  /** Paid out is positive; money the tax office sent back is negative. */
  amount: number;
  account: string | null;
  who: "federal" | "state" | "property" | "other";
  name: string;
  taxYear: number;
  /** False while the date fits two tax years and the owner has not said which. */
  sure: boolean;
  picked: boolean;
}

export interface TaxDate {
  key: string;
  kind: "pay" | "paper" | "file";
  date: string;
  label: string;
  days: number;
  past: boolean;
  /** For a payment date and the return's own date: what was sent by then. */
  sent: number | null;
}

export interface TaxPaper {
  key: string;
  form: string;
  from: string;
  expected: string;
  got: boolean;
  link: string | null;
  late: boolean;
  /** A form the owner fills in, not one that arrives. */
  fill?: boolean;
  /** Added by the owner. */
  own?: boolean;
}

export interface GiftIn {
  id: string;
  date: string;
  amount: number;
  account: string | null;
  from: string;
  counted: boolean;
}

export interface GiftOut {
  id: string;
  date: string;
  amount: number;
  account: string | null;
  /** A gift, the owner's own money moving (false), or not said yet (null). */
  gift: boolean | null;
  to: string;
  /** The person the app would name: the wire landed in their account. */
  offered: string;
  landedIn: string | null;
  picked: boolean;
}

export interface TaxLook {
  key: string;
  tone: "warn" | "plain";
  title: string;
  amount?: number;
  text: string;
}

export interface TaxesView {
  year: number;
  years: number[];
  today: string;
  currency: string;
  trading: {
    accounts: TaxAccount[];
    taxed: number;
    shortTerm: number;
    longTerm: number;
    other: number;
    notTaxed: number;
    notMine: number;
    asOf: string | null;
    /** "not-connected", "old" (WheelTradr has no yearly numbers yet), or its own words; null when fine. */
    error: string | null;
  };
  paid: { federal: number; state: number; total: number; rows: TaxPayment[] };
  dates: TaxDate[];
  papers: { rows: TaxPaper[]; got: number; count: number; late: number };
  gifts: {
    received: { total: number; count: number; limit: number; over: boolean; rows: GiftIn[] };
    sent: {
      total: number;
      limit: number;
      over: boolean;
      people: { name: string; total: number; count: number; over: boolean }[];
      rows: GiftOut[];
      unsorted: { count: number; total: number };
      /** False when even every wire still to sort could not push anyone past the yearly limit. */
      matters: boolean;
    };
  };
  looks: TaxLook[];
  driveFolder: string | null;
  /** Each kind's switch, and `on` for the whole group (Settings, Alerts). */
  alerts: Record<TaxAlertKind, boolean> & { on?: boolean };
}

const BASE = "/api/money-hub/taxes";
export const TAXES_KEY = ["money-hub", "taxes"] as const;
export const taxesKey = (year: number | null) => [...TAXES_KEY, year ?? "now"] as const;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      (data as { error?: string }).error || `The money app helper said ${res.status}`,
    );
  return data as T;
}

const seg = (s: string | number) => encodeURIComponent(String(s));
type Went = { went: { discord: boolean; ntfy: boolean }; sample: string };

export const taxesApi = {
  get: (year: number | null) => call<TaxesView>("GET", year ? `?year=${year}` : ""),
  /** How an account is taxed; null goes back to the reading of its name. */
  setAccount: (year: number, id: string, treatment: Treatment | null) =>
    call<TaxesView>("PUT", `/accounts/${seg(id)}`, { treatment, year }),
  /** Which tax year a payment was for; null goes back to the guess from its date. */
  setPayment: (year: number, id: string, taxYear: number | null) =>
    call<TaxesView>("PUT", `/payments/${seg(id)}`, { taxYear, year }),
  setPaper: (year: number, key: string, patch: { got?: boolean; link?: string | null }) =>
    call<TaxesView>("PUT", `/papers/${year}/${seg(key)}`, patch),
  addPaper: (year: number, paper: { form: string; from: string }) =>
    call<TaxesView>("POST", `/papers/${year}`, paper),
  removePaper: (year: number, key: string) =>
    call<TaxesView>("DELETE", `/papers/${year}/${seg(key)}`),
  /** Money in: counted as a gift from abroad or not. */
  setGiftIn: (year: number, id: string, counted: boolean) =>
    call<TaxesView>("PUT", `/gifts/in/${seg(id)}`, { counted, year }),
  /** A wire out: a gift to someone, or the owner's own money moving. */
  setGiftOut: (year: number, id: string, pick: { gift: boolean; to?: string }) =>
    call<TaxesView>("PUT", `/gifts/out/${seg(id)}`, { ...pick, year }),
  setDriveFolder: (year: number, url: string) =>
    call<TaxesView>("PUT", "/drive-folder", { url, year }),
  setAlerts: (alerts: Partial<Record<TaxAlertKind | "on", boolean>>) =>
    call<TaxesView>("PUT", "/alerts", alerts),
  /** A sample of one kind of alert, sent the way the real one goes. */
  testAlert: (kind: TaxAlertKind) => call<TaxesView & Went>("POST", "/alerts/test", { kind }),
};

export function useTaxes(year: number | null) {
  return useQuery({
    queryKey: taxesKey(year),
    queryFn: () => taxesApi.get(year),
    staleTime: 60 * 1000,
  });
}

/**
 * Puts a fresh view where the page reads it: under its own year, and as "now" when it is this year's.
 * The other years are read again when next shown: a payment moved to another tax year, or an account
 * marked not mine, changes them too.
 */
export function useSetTaxes() {
  const qc = useQueryClient();
  return (view: TaxesView) => {
    const current = view.year === Number(view.today.slice(0, 4));
    qc.setQueryData(taxesKey(view.year), view);
    if (current) qc.setQueryData(taxesKey(null), view);
    void qc.invalidateQueries({
      predicate: (q) =>
        q.queryKey[0] === TAXES_KEY[0] &&
        q.queryKey[1] === TAXES_KEY[1] &&
        q.queryKey[2] !== view.year &&
        !(current && q.queryKey[2] === "now"),
    });
  };
}

export const TREATMENT_LABELS: Record<Treatment, string> = {
  taxed: "taxed",
  not_taxed: "not taxed",
  not_mine: "not mine",
};
export const TREATMENT_HINTS: Record<Treatment, string> = {
  taxed: "Its profit is on your tax return",
  not_taxed: "A retirement or health account: nothing owed this year",
  not_mine: "Someone else's account: left out of your numbers",
};

export const TAX_ALERT_LABELS: Record<TaxAlertKind, { title: string; text: string }> = {
  date: {
    title: "A tax date is a week away",
    text: "Payment dates, the papers' arrival and the return's own date.",
  },
  paper: {
    title: "Papers still missing",
    text: "Ten days after a form was due to arrive and it is not ticked off.",
  },
};

/** "Jan 15", and with the year when asked ("Jan 15, 2027"). */
export function shortDay(iso: string, withYear = false): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** "105 days", "tomorrow", "today"; past dates say nothing here (the row words them). */
export function inDays(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `${days} days`;
}

/** The names of a list, in words: "A", "A and B", "A, B and C". */
export function listed(names: string[]): string {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The two tax years a payment's date can belong to (the one it was paid in, and the one before). */
export const yearChoices = (p: Pick<TaxPayment, "date">): number[] => {
  const y = Number(p.date.slice(0, 4));
  return [y - 1, y];
};

/** The hero's split bar: only what is above zero has a share. */
export function barParts(t: TaxesView["trading"]): { key: string; value: number; color: string }[] {
  return [
    { key: "short", value: t.shortTerm, color: "var(--m-forest)" },
    { key: "long", value: t.longTerm, color: "var(--m-forest-today)" },
    { key: "other", value: t.other, color: "var(--m-forest-soft)" },
    { key: "free", value: t.notTaxed, color: "var(--m-bills)" },
  ].filter((p) => p.value > 0);
}

/** Names already used for gifts, most money first, for quick picks when sorting a wire. */
export function knownPeople(rows: GiftOut[]): string[] {
  const seen = new Map<string, { name: string; total: number }>();
  for (const r of rows) {
    for (const name of [r.gift ? r.to : "", r.offered]) {
      const key = name.trim().toLowerCase();
      if (!key) continue;
      const hit = seen.get(key) ?? { name: name.trim(), total: 0 };
      hit.total += r.amount;
      seen.set(key, hit);
    }
  }
  return [...seen.values()].sort((a, b) => b.total - a.total).map((p) => p.name);
}
