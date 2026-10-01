// money-hub patch: Subscriptions & bills, the charges that repeat (owner, 2026-10-01). The money-hub
// service finds them from the imported transactions (server/drive-backup/lib/subscriptions.js) and
// keeps the owner's choices; this file reads and changes them, and words the statuses.
import { useQuery, useQueryClient } from "@tanstack/react-query";

export type Every = "month" | "quarter" | "half-year" | "year";
export type StreamGroup = "subscriptions" | "bills";
export type StreamStatus = "active" | "price-up" | "price-down" | "stopped";
export type AlertKind = "newFound" | "priceChange" | "doubleCharge" | "stopped" | "cameBack" | "reminders";

export interface Stream {
  key: string;
  name: string;
  logoUrl: string | null;
  useBank: boolean;
  merchantId: string | null;
  group: StreamGroup;
  every: Every;
  everyLabel: string;
  /** The usual amount of one charge. */
  usual: number;
  /** Spread over a month and over a year (a yearly charge counts a twelfth each month). */
  monthly: number;
  yearly: number;
  count: number;
  first: string | null;
  last: { date: string; amount: number; id: string } | null;
  previousAmount: number | null;
  next: string;
  dueInDays: number;
  status: StreamStatus;
  doubleCharge: boolean;
  /** A bill that moves with use (utilities, phone): the amount shown is the usual one. */
  variable: boolean;
  /** Four charges or more, confirmed, or added by hand; otherwise "Not sure yet". */
  sure: boolean;
  categoryId: string | null;
  accountId: string | null;
  ids: string[];
  /** What the transactions search needs to find its charges: the word that matched the bank's text. */
  search?: string;
  manualId: string | null;
  confirmed?: boolean;
  hidden?: boolean;
  reminder?: string | null;
  /** How often was set by the owner (owner, 10-01: "set the frequency editable too"). */
  everySetByOwner?: boolean;
  /** Remind this many days before each charge (owner, 10-01: "remind me # days before the charge"). */
  remindBefore?: number | null;
  /** The next date was set by the owner, for the record (it never makes a transaction). */
  nextSetByOwner?: boolean;
  /** Stopped by its charges, but the owner reactivated it: active until a new charge comes in. */
  reactivated?: boolean;
  /** A service shared in Owly: each charge's friends' part and the owner's part. */
  shared?: SharedInfo;
  /** "Count only my part" is on: `usual`, `monthly` and `yearly` are the owner's part. */
  sharedOn?: boolean;
  /** With sharedOn: the usual whole bill. */
  billUsual?: number;
  /** Exclude from forecast (owner, 10-01: the mortgage): a fixed bill the Monthly budget takes off the
   *  budget as it is instead of forecasting it (lib/budget-forecast.ts). Spending still counts it. */
  excludeFromForecast?: boolean;
  /** "Send the bank's amount to Owly" is on (owner, 10-01). */
  sendTotal?: boolean;
  /** What was last sent to Owly as this bill's total, or why Owly refused. */
  owlyTotal?: { chargeId: string; amount: number | null; from: string | null; at: string; error: string | null } | null;
  /** Every charge in it. */
  /** `extra`: brought in by a rule but not this kind of charge (a fee, a credit): listed and counted, not
   *  in its rhythm or price. `credit`: money back. */
  charges?: { id: string; date: string; amount: number; notes?: string; accountId?: string | null; extra?: boolean; credit?: boolean }[];
  /** Charges the owner took out by hand: in no subscription, whatever words or rules say (owner, 10-01). */
  excluded?: ExcludedCharge[];
  /** The charges the owner put in it by hand (owner, 10-01). */
  linkedIds?: string[];
  /** The charges an owner's rule brought here (another card, other words). */
  ruledIds?: string[];
  /** The owner's rules that file its charges as a subscription or bill: what they match joins it, on any card. */
  rules?: { id: string; name: string; categoryId: string }[];
  /** The owner's merchant words that bring its charges here (Settings, Spending, Merchants). */
  merchantWords?: { id: string; name: string; words: string[] } | null;
  /** Paid from a mortgage's escrow (home insurance, property tax), from the Rental page: already in
   *  the mortgage payment, so the totals leave it out (owner, 10-01). */
  escrow?: EscrowInfo;
}

export interface EscrowInfo {
  /** The rental it belongs to (its Rental page: /addons/rental-tracker?rental=<id>). */
  rentalId: string;
  part: "insurance" | "tax";
  /** The company the owner picked for it (its logo is the stream's). */
  company: string | null;
  /** The mortgage payment it is part of, on this list. */
  mortgageKey: string | null;
  mortgageName: string | null;
  /** What escrow paid each year, from the Form 1098s, newest first. */
  years: { year: number; amount: number }[];
  /** What each mortgage payment puts aside for it now. */
  monthlyNow: number | null;
  /** That amount is a guess from a statement, not the lender's figure. */
  estimated: boolean;
}

export interface SharedCharge {
  id: string;
  date: string;
  amount: number;
  friends: number;
  mine: number;
  people: string[];
  ok: boolean;
  tooMuch: boolean;
}

export interface SharedInfo {
  service: string;
  plan: SharedCharge[];
  count: number;
  latest: SharedCharge | null;
  myUsual: number | null;
}

export interface ManualEntry {
  id: string;
  name: string;
  words: string[];
  amount: number;
  every: Every;
  nextDate: string | null;
  group: StreamGroup;
  merchantId: string | null;
}

export interface ExcludedCharge {
  id: string;
  date: string;
  amount: number;
  notes: string;
  accountId: string | null;
}

export interface SubscriptionsView {
  items: Stream[];
  hidden: Stream[];
  /** Escrow's bills are left out of these (they are in the mortgage); `inMortgageMonthly` is what they come to. */
  totals: { monthly: number; yearly: number; count: number; subscriptionsMonthly: number; billsMonthly: number; inMortgageMonthly?: number };
  manual: ManualEntry[];
  /** Taken out by hand from a subscription that is gone since: put back from the page. */
  leftOut?: (ExcludedCharge & { key: string })[];
  /** Each kind's switch, and `on` for the whole group (Settings, Alerts). */
  alerts: Record<AlertKind, boolean> & { on?: boolean };
  last: { at: string; scanned: number; found: number } | null;
  /** The money app's base currency, for the amounts. */
  currency: string;
}

export interface ManualInput {
  name: string;
  words: string[];
  amount: number;
  every: Every;
  nextDate?: string | null;
  group: StreamGroup;
  /** The company whose logo it shows (a bill with no charge to find one from). */
  merchantId?: string | null;
  /** Charges that are its own whatever their words (the one it was made from). */
  linkIds?: string[];
}

/** Which stream a charge is in, which it looks like, and a new one drafted from it. */
export interface WhichOne {
  member: string | null;
  likely: string | null;
  draft: { name: string; words: string[]; amount: number; every: Every; nextDate: string };
}

const BASE = "/api/money-hub/subscriptions";
export const SUBSCRIPTIONS_KEY = ["money-hub", "subscriptions"] as const;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `The money app helper said ${res.status}`);
  return data as T;
}

export const subscriptionsApi = {
  get: () => call<SubscriptionsView>("GET", ""),
  rescan: () => call<SubscriptionsView>("POST", "/rescan"),
  update: (
    key: string,
    patch: Partial<
      Pick<Stream, "hidden" | "confirmed" | "group" | "name" | "reminder" | "remindBefore" | "excludeFromForecast"> & {
        nextDate: string | null;
        every: Every | null;
        /** Reactivate a stopped one (true), or let its charges say again (false). */
        active: boolean;
        /** The company whose logo it shows (escrow's bills: no charge to find one from). */
        merchantId: string | null;
      }
    >,
  ) =>
    call<SubscriptionsView>("PUT", `/entries/${encodeURIComponent(key)}`, patch),
  /** "Count only my part" for a shared bill: splits its charges (on) or puts them back whole (off). */
  setShared: (key: string, on: boolean) =>
    call<SubscriptionsView & { changed: number }>("PUT", `/entries/${encodeURIComponent(key)}`, { shared: on }),
  /** "Send the bank's amount to Owly": each new charge becomes Owly's total for its next bill. */
  setSendTotal: (key: string, on: boolean) => call<SubscriptionsView>("PUT", `/entries/${encodeURIComponent(key)}`, { sendTotal: on }),
  addManual: (input: ManualInput) => call<SubscriptionsView>("POST", "/manual", input),
  updateManual: (id: string, input: ManualInput) => call<SubscriptionsView>("PUT", `/manual/${encodeURIComponent(id)}`, input),
  removeManual: (id: string) => call<SubscriptionsView>("DELETE", `/manual/${encodeURIComponent(id)}`),
  setAlerts: (alerts: Partial<Record<AlertKind | "on", boolean>>) => call<SubscriptionsView>("PUT", "/alerts", alerts),
  /** A sample of one kind of alert from the owner's own list, sent the way the real one goes. */
  testAlert: (kind: AlertKind) =>
    call<SubscriptionsView & { went: { discord: boolean; ntfy: boolean }; sample: string }>("POST", "/alerts/test", { kind }),
  /** For a charge just filed as a subscription or a bill: the one it is in or looks like. */
  which: (charge: { id: string; notes: string; amount: number; date: string }) => call<WhichOne>("POST", "/which", charge),
  /** Put a charge in a stream by hand (null: back to where its words put it). */
  link: (activityId: string, key: string | null) => call<SubscriptionsView>("PUT", `/links/${encodeURIComponent(activityId)}`, { key }),
  /** Take charges out of a subscription by hand (no word or rule brings them back), or put them back. */
  exclusions: (key: string, change: { exclude?: string[]; include?: string[] }) =>
    call<SubscriptionsView>("POST", "/exclusions", { key, ...change }),
};

export function useSubscriptions() {
  return useQuery({ queryKey: SUBSCRIPTIONS_KEY, queryFn: subscriptionsApi.get, staleTime: 60 * 1000 });
}

export function useSetSubscriptions() {
  const qc = useQueryClient();
  return (view: SubscriptionsView) => qc.setQueryData(SUBSCRIPTIONS_KEY, view);
}

export const EVERY_LABELS: Record<Every, string> = {
  month: "Every month",
  quarter: "Every 3 months",
  "half-year": "Every 6 months",
  year: "Every year",
};

export const ALERT_LABELS: Record<AlertKind, { title: string; text: string }> = {
  newFound: { title: "New subscription found", text: "A charge starts repeating." },
  priceChange: { title: "Price changed", text: "The latest charge is higher or lower than usual." },
  doubleCharge: { title: "Charged twice", text: "Two charges close together for the same amount." },
  stopped: { title: "Stopped", text: "No charge for two periods. Cancelled, or a card changed." },
  cameBack: { title: "Came back", text: "A stopped one is charged again." },
  reminders: { title: "Charge coming up", text: "A few days before each charge, on the rows where you set a reminder." },
};

/** The status in words. `tone` picks the colour: green for fine, amber for a look, muted for over. */
export function statusLabel(s: Pick<Stream, "status" | "sure" | "doubleCharge" | "confirmed">): {
  label: string;
  tone: "fine" | "look" | "over";
} {
  if (s.status === "stopped") return { label: "Stopped", tone: "over" };
  if (s.doubleCharge) return { label: "Charged twice", tone: "look" };
  if (s.status === "price-up") return { label: "Price went up", tone: "look" };
  if (s.status === "price-down") return { label: "Price went down", tone: "fine" };
  if (!s.sure && !s.confirmed) return { label: "Not sure yet", tone: "look" };
  return { label: "Active", tone: "fine" };
}

const day = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/** A date as "Oct 26", with the year when it is not this year ("May 19, 2027"). */
export function shortDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  const thisYear = d.getUTCFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(thisYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

/** When the next charge is expected, with its date (owner, 10-01: "display the date for
 *  subscriptions and bills"); a stopped one tells when it was last paid. */
export function dueLabel(s: Pick<Stream, "status" | "dueInDays" | "next" | "last">): string {
  if (s.status === "stopped") return s.last ? `Last paid ${day(s.last.date)}` : "Never charged";
  const date = shortDate(s.next);
  if (s.dueInDays === 0) return `Due today, ${date}`;
  if (s.dueInDays === 1) return `Due tomorrow, ${date}`;
  if (s.dueInDays > 1) return `Next ${date}, in ${s.dueInDays} days`;
  if (s.dueInDays === -1) return `Was due yesterday, ${date}`;
  return `Was due ${date}, ${-s.dueInDays} days ago`;
}

/** Its Rental page's Settings, where its 1098 years and escrow are kept. */
export const rentalSettingsHref = (e: Pick<EscrowInfo, "rentalId">) =>
  `/addons/rental-tracker?rental=${encodeURIComponent(e.rentalId)}&tab=settings`;

/** The transactions list filtered to this stream's charges: by the words in the bank's text (owner,
 *  10-01: City Sticker's link searched its name, the bank says CTYCHGO), else by its name. */
export function transactionsHref(s: Pick<Stream, "name" | "last" | "search">): string {
  const q = s.search || (s.last ? payeeSearch(s.name) : s.name);
  return `/activities?tab=spending&q=${encodeURIComponent(q)}`;
}
/** The first word of the name is what the bank text has in common ("Youtube" for "Youtube Premium Ca"). */
const payeeSearch = (name: string) => name.split(/\s+/).slice(0, 2).join(" ");

/** The live streams nearest their next charge, for the dashboard card. */
export function upcoming(items: Stream[], limit = 3): Stream[] {
  return items
    .filter((s) => s.status !== "stopped" && s.dueInDays >= -3)
    .sort((a, b) => a.dueInDays - b.dueInDays || b.monthly - a.monthly)
    .slice(0, limit);
}
