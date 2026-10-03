// money-hub patch: Returns (owner, 2026-10-01: "track a return purchase"): something bought and sent
// back, and the refund it is waiting for. The owner marks a purchase as returned from its menu; the
// money-hub service looks for the refund in the bank's money in every hour, takes the clear one,
// offers the rest ("Is this your refund?") and tells when one is late
// (server/drive-backup/lib/returns.js). This file reads and changes them, and words the statuses.
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export type ReturnStatus = "waiting" | "part" | "late" | "back" | "settled";
/** The refund's three, then the store's emails (owner, 10-03): a step it moved, and the drop-off reminder. */
export type ReturnAlertKind = "arrived" | "possible" | "late" | "step" | "dropoff";

/** Money in that is (or could be) a return's refund. */
export interface RefundRow {
  id: string;
  accountId: string | null;
  date: string;
  amount: number;
  /** Not the base currency (owner, 10-03: ACB and MB are in dong): the amount is in this one. */
  currency?: string;
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

/** The timeline's steps (owner, 2026-10-03: "Return initiated > Vendor accepted > vendor received item >
 *  payment returned"; then the store's "refund issued" and the money on the card as two: "no status showing
 *  that the refunded amount is recored in the card"). */
export type ReturnStepKey = "started" | "accepted" | "received" | "refunded" | "oncard";
/** done: with its day. passed: a later step came, this one sent no email. now: the one waited on. declined:
 *  the store said no. The card step also: part, late, settled. */
export type ReturnStepState = "done" | "passed" | "now" | "todo" | "declined" | "part" | "late" | "settled";

/** The store's word on a step: one of its emails (Settings, Google, Return emails), or Amazon's. */
export interface ReturnEmail {
  key: string;
  source: "email" | "amazon";
  kind: "accepted" | "declined" | "dropped" | "received" | "refunded";
  date: string;
  subject: string;
  from: string;
  /** The email in Gmail, or the order on Amazon. */
  url: string;
  /** A day the store gave: drop it off by, the refund by. */
  by?: string | null;
  /** How the email was tied to this return: the sender is the store, an order number, or the amount. */
  how?: "store" | "order" | "amount";
}

export interface ReturnStep {
  key: ReturnStepKey;
  state: ReturnStepState;
  date: string | null;
  /** Who told it: the day typed on the return, the store's email, Amazon, or the refund in the bank. */
  via: "you" | "email" | "amazon" | "bank" | null;
  event: ReturnEmail | null;
  note: { kind: "dropOffBy" | "dropped" | "due"; date: string } | null;
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
  /** Paid in another currency than the base one (dong from ACB or MB): its amounts and refunds are in
   *  it; `inBase` is one unit's worth in dollars now (the totals count it so). */
  currency?: string;
  inBase?: number | null;
  /** The store's emails about it, oldest first. */
  emails?: ReturnEmail[];
  /** Where it stands, step by step (the timeline). */
  steps?: ReturnStep[];
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
  /** Not the base currency: the amount is in this one. */
  currency?: string;
  notes: string;
}

/** How many decimals a currency's amounts have: 2 for dollars, none for dong. */
export function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
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
  /** "Not this one": a store email that is not about this return. */
  notEmail: (id: string, key: string) => call<ReturnsView>("POST", `${one(id)}/not-email`, { key }),
  setAlerts: (alerts: Partial<Record<ReturnAlertKind | "on", boolean>>) => call<ReturnsView>("PUT", "/alerts", alerts),
  /** A sample of one kind of alert, sent the way the real one goes. */
  testAlert: (kind: ReturnAlertKind) =>
    call<ReturnsView & { went: { discord: boolean; ntfy: boolean }; sample: string }>("POST", "/alerts/test", { kind }),
};

/** Settings, Google, Return emails: whether the store's emails are read for the timeline. */
export interface ReturnEmailsStatus {
  on: boolean;
  busy: boolean;
  mailboxId: string | null;
  mailboxes: { id: string; email: string }[];
  last: { at: string; read: number; emails: number; matched: number; returns: number; errors: string[] } | null;
}
export const RETURN_EMAILS_KEY = ["money-hub", "return-emails"] as const;
export const returnEmailsApi = {
  get: () => fetch("/api/money-hub/return-emails", { credentials: "include" }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error || `The money app helper said ${res.status}`);
    return data as ReturnEmailsStatus;
  }),
};
export function useReturnEmails() {
  return useQuery({ queryKey: RETURN_EMAILS_KEY, queryFn: returnEmailsApi.get, staleTime: 60 * 1000, retry: false });
}

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
  step: { title: "Return updates", text: "The store accepted it, it is on its way back, the store got it, or sent the refund." },
  dropoff: { title: "Drop-off reminder", text: "3 days before the store's last day to drop it off, if it has not seen it yet." },
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
export function returnStatus(x: Pick<ReturnItem, "status" | "suggestions" | "steps">): { label: string; tone: "fine" | "look" | "plain" | "over" } {
  if (x.status === "back") return { label: "Refunded", tone: "fine" };
  if (x.status === "settled") return { label: "Settled", tone: "over" };
  if (x.suggestions.length) return { label: "Is this it?", tone: "look" };
  // The store's email said no (the timeline's Accepted step).
  if (x.steps?.some((s) => s.state === "declined")) return { label: "Declined", tone: "look" };
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

/** A step's name, in a word or two. */
export function stepLabel(step: Pick<ReturnStep, "key" | "state">): string {
  if (step.key === "started") return "Started";
  if (step.key === "accepted") return step.state === "declined" ? "Declined" : "Accepted";
  if (step.key === "received") return "Received";
  if (step.key === "refunded") return "Refunded";
  if (step.state === "settled") return "Settled";
  if (step.state === "part") return "Part back";
  return "On card";
}

/** Under a step: its day, or what it waits on ("Drop by Oct 21", "By Oct 17"). Short: a phone shows five
 *  of these side by side. */
export function stepCaption(step: ReturnStep): string {
  const day = step.date ? shortDay(step.date) : "";
  switch (step.state) {
    case "done":
    case "declined":
    case "settled":
    case "part":
      return day;
    case "passed":
      return "";
    case "late":
      return step.note ? `Due ${shortDay(step.note.date)}` : "Late";
    default:
      if (step.note?.kind === "dropOffBy") return `Drop by ${shortDay(step.note.date)}`;
      if (step.note?.kind === "dropped") return `Dropped ${shortDay(step.note.date)}`;
      if (step.note?.kind === "due" && step.state === "now") return `By ${shortDay(step.note.date)}`;
      return step.state === "now" ? "Waiting" : "";
  }
}

/** Who said so, for the window's timeline. `card`: the card's name, for the money on it. */
export function stepSource(step: ReturnStep, card?: string): string {
  if (step.via === "you") return "the day you set";
  if (step.via === "bank") return card ? `on ${card}` : "on your card";
  if (step.key === "oncard" && (step.state === "now" || step.state === "late")) return card ? `checking ${card} every hour` : "checking your card every hour";
  if (step.via === "amazon") return "Amazon's email";
  if (step.via === "email") return step.event?.from ? `${step.event.from}'s email` : "the store's email";
  if (step.state === "passed") return "no email";
  return "";
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
export function purchaseOf(a: { id: string; accountId: string; activityDate: string | Date; amount?: string | number | null; currency?: string | null; notes?: string | null }): PurchaseOption {
  const date = a.activityDate instanceof Date ? a.activityDate.toISOString() : String(a.activityDate);
  return { id: a.id, accountId: a.accountId, date: date.slice(0, 10), amount: Math.abs(Number(a.amount) || 0), ...(a.currency ? { currency: a.currency } : {}), notes: a.notes ?? "" };
}
