// money-hub patch: Subscriptions & bills, the charges that repeat (owner, 2026-10-01). The money-hub
// service finds them from the imported transactions (server/drive-backup/lib/subscriptions.js) and
// keeps the owner's choices; this file reads and changes them, and words the statuses.
import { useQuery, useQueryClient } from "@tanstack/react-query";

export type Every = "month" | "quarter" | "half-year" | "year";
export type StreamGroup = "subscriptions" | "bills";
export type StreamStatus = "active" | "price-up" | "price-down" | "stopped";
export type AlertKind = "newFound" | "priceChange" | "doubleCharge" | "stopped" | "reminders";

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
  manualId: string | null;
  confirmed?: boolean;
  hidden?: boolean;
  reminder?: string | null;
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

export interface SubscriptionsView {
  items: Stream[];
  hidden: Stream[];
  totals: { monthly: number; yearly: number; count: number; subscriptionsMonthly: number; billsMonthly: number };
  manual: ManualEntry[];
  alerts: Record<AlertKind, boolean>;
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
  update: (key: string, patch: Partial<Pick<Stream, "hidden" | "confirmed" | "group" | "name" | "reminder">>) =>
    call<SubscriptionsView>("PUT", `/entries/${encodeURIComponent(key)}`, patch),
  addManual: (input: ManualInput) => call<SubscriptionsView>("POST", "/manual", input),
  updateManual: (id: string, input: ManualInput) => call<SubscriptionsView>("PUT", `/manual/${encodeURIComponent(id)}`, input),
  removeManual: (id: string) => call<SubscriptionsView>("DELETE", `/manual/${encodeURIComponent(id)}`),
  setAlerts: (alerts: Partial<Record<AlertKind, boolean>>) => call<SubscriptionsView>("PUT", "/alerts", alerts),
  /** A sample of one kind of alert from the owner's own list, sent the way the real one goes. */
  testAlert: (kind: AlertKind) =>
    call<SubscriptionsView & { went: { discord: boolean; ntfy: boolean }; sample: string }>("POST", "/alerts/test", { kind }),
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
  reminders: { title: "Cancel reminders", text: "The dates you set on a row." },
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

/** When the next charge is expected, in words; a stopped one tells when it was last paid. */
export function dueLabel(s: Pick<Stream, "status" | "dueInDays" | "next" | "last">): string {
  if (s.status === "stopped") return s.last ? `Last paid ${day(s.last.date)}` : "Never charged";
  if (s.dueInDays === 0) return "Due today";
  if (s.dueInDays === 1) return "Due tomorrow";
  if (s.dueInDays > 1) return `Due in ${s.dueInDays} days`;
  if (s.dueInDays === -1) return "Was due yesterday";
  return `Was due ${-s.dueInDays} days ago`;
}

/** The transactions list filtered to this stream's payee. */
export function transactionsHref(s: Pick<Stream, "name" | "last">): string {
  const q = s.last ? payeeSearch(s.name) : s.name;
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
