// money-hub patch: Returns (owner, 2026-10-01: "track a return purchase"): something bought and sent
// back, and the refund it is waiting for. The owner marks a purchase as returned from its menu; the
// money-hub service looks for the refund in the bank's money in every hour, takes the clear one,
// offers the rest ("Is this your refund?") and tells when one is late
// (server/drive-backup/lib/returns.js). This file reads and changes them, and words the statuses.
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export type ReturnStatus = "waiting" | "part" | "late" | "back" | "settled";
export type ReturnAlertKind = "arrived" | "possible" | "late";

/** Money in that is (or could be) a return's refund. */
export interface RefundRow {
  id: string;
  accountId: string | null;
  date: string;
  amount: number;
  notes: string;
}

export interface Refund extends RefundRow {
  /** Found by the service on its own (the same store, amount and card), not picked by the owner. */
  auto: boolean;
  at: string;
}

export interface RefundOffer extends RefundRow {
  /** The whole amount still to come. */
  exact: boolean;
  /** The same store as the purchase ("same"), words in common ("like"), or other words (null). */
  store: "same" | "like" | null;
}

export interface ReturnItem {
  id: string;
  purchaseId: string;
  name: string;
  logoUrl: string | null;
  useBank: boolean;
  accountId: string | null;
  purchase: { date: string; amount: number; notes: string };
  /** How much is coming back. */
  expected: number;
  returnedOn: string;
  /** The store's usual number of days. */
  within: number;
  dueOn: string;
  dueInDays: number;
  waitingDays: number;
  note: string;
  received: number;
  remaining: number;
  status: ReturnStatus;
  refunds: Refund[];
  /** Money in that could be it, for the owner's yes or no. */
  suggestions: RefundOffer[];
  closedAt: string | null;
  /** Days from the return to the last of the money. */
  tookDays: number | null;
  createdAt: string;
}

export interface ReturnsView {
  items: ReturnItem[];
  totals: { waiting: number; count: number; late: number; toConfirm: number; back: number; backCount: number };
  /** Each kind's switch, and `on` for the whole group (Settings, Alerts). */
  alerts: Record<ReturnAlertKind, boolean> & { on?: boolean };
  last: { at: string; scanned: number; open: number } | null;
  currency: string;
}

/** A purchase a return can be started from. */
export interface PurchaseOption {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  notes: string;
}

export interface ReturnTerms {
  expected: number;
  returnedOn: string;
  within: number;
  note: string;
}

const BASE = "/api/money-hub/returns";
export const RETURNS_KEY = ["money-hub", "returns"] as const;

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

const one = (id: string) => `/${encodeURIComponent(id)}`;
const which = (row: Pick<RefundRow, "id" | "accountId" | "date">) => ({ activityId: row.id, accountId: row.accountId, date: row.date });

export const returnsApi = {
  get: () => call<ReturnsView>("GET", ""),
  rescan: () => call<ReturnsView>("POST", "/rescan"),
  create: (purchase: PurchaseOption, terms: ReturnTerms) => call<ReturnsView>("POST", "", { ...which(purchase), ...terms }),
  update: (id: string, terms: Partial<ReturnTerms>) => call<ReturnsView>("PUT", one(id), terms),
  /** Settled without (all of) the money: store credit, an exchange. Or open it again. */
  setClosed: (id: string, closed: boolean) => call<ReturnsView>("PUT", one(id), { closed }),
  remove: (id: string) => call<ReturnsView>("DELETE", one(id)),
  /** "This is it". */
  linkRefund: (id: string, row: RefundRow) => call<ReturnsView>("POST", `${one(id)}/refunds`, which(row)),
  unlinkRefund: (id: string, activityId: string) => call<ReturnsView>("DELETE", `${one(id)}/refunds/${encodeURIComponent(activityId)}`),
  /** "Not it": never offered again for this return. */
  notIt: (id: string, activityId: string) => call<ReturnsView>("POST", `${one(id)}/not-it`, { activityId }),
  /** The money in since the purchase, the likeliest first, to pick the refund by hand. */
  candidates: (id: string) => call<RefundOffer[]>("GET", `${one(id)}/candidates`),
  /** Recent purchases, by the words typed. */
  purchases: (q: string) => call<PurchaseOption[]>("GET", `/purchases?q=${encodeURIComponent(q)}`),
  setAlerts: (alerts: Partial<Record<ReturnAlertKind | "on", boolean>>) => call<ReturnsView>("PUT", "/alerts", alerts),
  /** A sample of one kind of alert, sent the way the real one goes. */
  testAlert: (kind: ReturnAlertKind) =>
    call<ReturnsView & { went: { discord: boolean; ntfy: boolean }; sample: string }>("POST", "/alerts/test", { kind }),
};

export function useReturns() {
  return useQuery({ queryKey: RETURNS_KEY, queryFn: returnsApi.get, staleTime: 60 * 1000 });
}

export function useSetReturns() {
  const qc = useQueryClient();
  return (view: ReturnsView) => qc.setQueryData(RETURNS_KEY, view);
}

/** What a transaction has to do with a return: the purchase sent back, or the refund that came. */
export interface ReturnMark {
  item: ReturnItem;
  role: "purchase" | "refund";
}

/** Every transaction on a return, by its id (the transaction list's badge and menu). */
export function useReturnMarks(): Map<string, ReturnMark> {
  const { data } = useReturns();
  return useMemo(() => marksOf(data?.items ?? []), [data]);
}

export function marksOf(items: ReturnItem[]): Map<string, ReturnMark> {
  const out = new Map<string, ReturnMark>();
  // An open return wins the purchase's badge over an older closed one on the same purchase.
  for (const item of [...items].sort((a, b) => Number(!!b.closedAt) - Number(!!a.closedAt))) {
    out.set(item.purchaseId, { item, role: "purchase" });
    for (const f of item.refunds) out.set(f.id, { item, role: "refund" });
  }
  return out;
}

export const RETURN_ALERT_LABELS: Record<ReturnAlertKind, { title: string; text: string }> = {
  arrived: { title: "Refund landed", text: "The money for a return came back and was matched on its own." },
  possible: { title: "Is this your refund?", text: "Money came in that could be it, for you to say yes or no." },
  late: { title: "Refund is late", text: "Nothing by the day you expected it, then once a week until it comes." },
};

/** How long a store may take, for the picker. */
export const WITHIN_DAYS = [3, 5, 7, 10, 14, 21, 30, 45, 60, 90];

/** A date as "Oct 26", with the year when it is not this year ("May 19, 2027"). */
export function shortDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  const thisYear = d.getUTCFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(thisYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/** The status in words. `tone`: green for done, amber for a look, plain while it is just waiting. */
export function returnStatus(x: Pick<ReturnItem, "status" | "suggestions">): { label: string; tone: "fine" | "look" | "plain" | "over" } {
  if (x.status === "back") return { label: "Refunded", tone: "fine" };
  if (x.status === "settled") return { label: "Settled", tone: "over" };
  if (x.suggestions.length) return { label: "Is this it?", tone: "look" };
  if (x.status === "late") return { label: "Late", tone: "look" };
  if (x.status === "part") return { label: "Part back", tone: "plain" };
  return { label: "Waiting", tone: "plain" };
}

/** Why money in is offered, in a few words. */
export function offerHint(c: Pick<RefundOffer, "exact" | "store">): string {
  const store = c.store === "same" ? "Same store" : c.store === "like" ? "Similar name" : "Other words";
  return `${store}, ${c.exact ? "the exact amount" : "another amount"}`;
}

/** Where a return stands, in one line. */
export function returnLine(x: Pick<ReturnItem, "status" | "returnedOn" | "dueOn" | "dueInDays" | "tookDays" | "closedAt" | "refunds">): string {
  const sent = `Sent back ${shortDay(x.returnedOn)}`;
  if (x.status === "back") {
    const last = [...x.refunds].sort((a, b) => a.date.localeCompare(b.date)).pop();
    const took = x.tookDays == null ? "" : x.tookDays === 0 ? ", the same day" : `, ${days(x.tookDays)} later`;
    return last ? `${sent} · back ${shortDay(last.date)}${took}` : sent;
  }
  if (x.status === "settled") return `${sent} · settled ${x.closedAt ? shortDay(x.closedAt) : ""}`.trim();
  if (x.dueInDays < 0) return `${sent} · expected ${shortDay(x.dueOn)}, ${days(-x.dueInDays)} ago`;
  if (x.dueInDays === 0) return `${sent} · expected today`;
  return `${sent} · expected by ${shortDay(x.dueOn)}, in ${days(x.dueInDays)}`;
}

/** The open returns that need the owner first: one to confirm, then late, then the longest wait. */
export function openReturns(items: ReturnItem[]): ReturnItem[] {
  const rank = (x: ReturnItem) => (x.suggestions.length ? 0 : x.status === "late" ? 1 : 2);
  return items.filter((x) => !x.closedAt).sort((a, b) => rank(a) - rank(b) || a.dueOn.localeCompare(b.dueOn) || a.name.localeCompare(b.name));
}

/** The closed ones, the latest first. */
export function closedReturns(items: ReturnItem[]): ReturnItem[] {
  return items.filter((x) => x.closedAt).sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""));
}

/** The transactions list on one transaction's words. */
export const transactionsHref = (notes: string) => `/activities?tab=spending&q=${encodeURIComponent(notes.split(/\s+/).slice(0, 2).join(" "))}`;

// ---- The one open window (components/track-return-dialog.tsx, mounted once in App.tsx): a new
// return on a purchase, one already tracked, or neither (the page's Track a return: pick the purchase).
export interface TrackReturnTarget {
  purchase?: PurchaseOption;
  returnId?: string;
}

let current: TrackReturnTarget | null = null;
const listeners = new Set<() => void>();
export const trackReturnStore = {
  get: () => current,
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  open: (target: TrackReturnTarget) => {
    current = target;
    listeners.forEach((fn) => fn());
  },
  close: () => {
    current = null;
    listeners.forEach((fn) => fn());
  },
};

/** A transaction as the window needs it. */
export function purchaseOf(a: { id: string; accountId: string; activityDate: string | Date; amount?: string | number | null; notes?: string | null }): PurchaseOption {
  const date = a.activityDate instanceof Date ? a.activityDate.toISOString() : String(a.activityDate);
  return { id: a.id, accountId: a.accountId, date: date.slice(0, 10), amount: Math.abs(Number(a.amount) || 0), notes: a.notes ?? "" };
}
