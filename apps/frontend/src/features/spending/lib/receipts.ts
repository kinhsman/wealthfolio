// money-hub patch: receipts (owner, 2026-10-03: "build an auto category for costco (default is groceries
// but some items i bought for the house so its an expense for the rental)", "the only way is to snap the
// receipt"). A photo of a store receipt goes to the money-hub service (server/drive-backup/lib/receipts.js):
// the AI reads its lines, each gets a category, and the card charge of the same total takes them: one
// category, or a split (groceries + the house part, which the Rental page then counts).
import { useQuery, type QueryClient } from "@tanstack/react-query";

import { invalidateSpendingCaches } from "./invalidation";

export interface ReceiptItem {
  n: number;
  name: string;
  what: string;
  code: string | null;
  price: number;
  taxable: boolean;
  categoryId: string;
  /** The owner picked it, here or on an earlier receipt from the store. */
  byOwner?: boolean;
}

export interface ReceiptLine {
  categoryId: string;
  amount: string;
}

/** reading: the AI is on it; failed: it could not; waiting: no charge yet; unmatched: none came in 30 days;
 *  held: the charge was split by hand (or could not be saved); filed: done. */
export type ReceiptStatus = "reading" | "read" | "failed" | "waiting" | "unmatched" | "held" | "filed";

/** The email a receipt was found in (owner, 10-04: receipts found in Gmail). */
export interface ReceiptMail {
  email: string | null;
  from: string;
  subject: string;
  date: string;
  /** Opens it in its Gmail. */
  link: string | null;
}

export interface Receipt {
  id: string;
  at: string;
  photos: number;
  /** photo: snapped or pasted; gmail: found in an email by the money-hub service. */
  source?: "photo" | "gmail";
  mail?: ReceiptMail | null;
  status: ReceiptStatus;
  error: string | null;
  held: string | null;
  /** The lines don't add up to the total. */
  check: string | null;
  store: string | null;
  date: string | null;
  /** The time printed on it, "HH:MM". */
  time?: string | null;
  total: number | null;
  tax: number | null;
  cardLast4: string | null;
  items: ReceiptItem[];
  activityId: string | null;
  /** The owner checked what the AI read and pressed Looks good. */
  reviewed: boolean;
  /** The charge's day, once there is one. */
  chargeDate: string | null;
  chosen: boolean;
  filed: { how: "category" | "split"; lines: ReceiptLine[]; charge: number; at: string } | null;
}

export interface ReceiptCategory {
  id: string;
  name: string;
}

export interface ReceiptsView {
  ready: boolean;
  categories: ReceiptCategory[];
  receipts: Receipt[];
}

const BASE = "/api/money-hub/receipts";
export const RECEIPTS_KEY = ["money-hub", "receipts"] as const;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: body === undefined || isForm ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `The money app helper said ${res.status}`);
  return data as T;
}

export function useReceipts() {
  return useQuery({
    queryKey: RECEIPTS_KEY,
    queryFn: () => call<ReceiptsView>("GET", ""),
    staleTime: 60 * 1000,
  });
}

export function useReceiptFor(activityId: string | null | undefined) {
  return useQuery({
    queryKey: [...RECEIPTS_KEY, "activity", activityId],
    queryFn: () => call<{ ready: boolean; categories: ReceiptCategory[]; receipt: Receipt | null }>("GET", `/by-activity/${encodeURIComponent(activityId!)}`),
    enabled: !!activityId,
    staleTime: 60 * 1000,
  });
}

/** `duplicate`: the photo was a receipt already kept; this is that one, and nothing new was added. */
export type ReceiptAnswer = Receipt & { categories: ReceiptCategory[]; duplicate?: boolean };

/** A charge the owner may pick for a receipt that found none itself. */
export interface ChargeChoice {
  id: string;
  date: string;
  amount: number;
  name: string;
  account: string;
  /** Its total is the receipt's. */
  sameTotal: boolean;
  /** The store's name is in the bank text. */
  store: boolean;
}

export function useChargeChoices(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...RECEIPTS_KEY, "candidates", id],
    queryFn: () => call<{ from: string; to: string; items: ChargeChoice[] }>("GET", `/${id}/candidates`),
    enabled,
    staleTime: 60 * 1000,
  });
}

export const receiptsApi = {
  /** Photos of one receipt; for one transaction when `activityId` is given. */
  add: (files: File[], opts: { activityId?: string; activityDate?: string } = {}) => {
    const form = new FormData();
    for (const f of files) form.append("photo", f);
    if (opts.activityId) form.append("activityId", opts.activityId);
    if (opts.activityDate) form.append("activityDate", opts.activityDate);
    return call<ReceiptAnswer>("POST", "", form);
  },
  setCategory: (id: string, n: number, categoryId: string) => call<ReceiptAnswer>("PUT", `/${id}`, { items: [{ n, categoryId }] }),
  /** Looks good (false puts it back under To review). */
  setReviewed: (id: string, reviewed = true) => call<ReceiptAnswer>("PUT", `/${id}/reviewed`, { reviewed }),
  /** The owner's corrections: store, date, total, tax and every line. */
  edit: (id: string, body: ReceiptEdit) => call<ReceiptAnswer>("PUT", `/${id}/edit`, body),
  /** File it over the owner's own split. */
  fileAnyway: (id: string) => call<ReceiptAnswer>("PUT", `/${id}`, { file: true }),
  setCharge: (id: string, activityId: string | null, activityDate?: string) => call<ReceiptAnswer>("PUT", `/${id}`, { activityId, activityDate }),
  readAgain: (id: string) => call<ReceiptAnswer>("POST", `/${id}/read`),
  remove: (id: string) => call<{ ok: true }>("DELETE", `/${id}`),
};

export interface ReceiptEdit {
  store: string;
  date: string;
  total: string | number;
  tax: string | number | null;
  items: {
    name: string;
    what: string;
    code: string | null;
    price: string | number;
    taxable: boolean;
    categoryId: string;
    byOwner: boolean;
    pinned: boolean;
  }[];
}

/** How many receipts wait for the owner's look (the Receipts button on Transactions). */
export function useReceiptsToReview() {
  return useQuery({
    queryKey: [...RECEIPTS_KEY, "summary"],
    queryFn: () => call<{ toReview: number }>("GET", "/summary"),
    staleTime: 60 * 1000,
  });
}

/** Read by the AI and not yet marked good (a failed read has nothing to check). */
export const toReview = (r: Pick<Receipt, "reviewed" | "status">) => !r.reviewed && r.status !== "failed" && r.status !== "reading";

export const photoUrl = (id: string, n = 0) => `${BASE}/${id}/photo/${n}`;

/** The charge in Transactions: that day, that amount. */
export function chargeLink(r: Pick<Receipt, "chargeDate" | "filed" | "total">): string | null {
  const amount = r.filed?.charge ?? r.total;
  if (!r.chargeDate || amount == null) return null;
  const q = new URLSearchParams({ tab: "spending", from: r.chargeDate, to: r.chargeDate, amountMin: amount.toFixed(2), amountMax: amount.toFixed(2) });
  return `/activities?${q.toString()}`;
}

/** After any change: the receipts, and the transactions their charges changed. */
export function refreshAfterReceipt(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: RECEIPTS_KEY });
  invalidateSpendingCaches(qc);
}

/** Where a receipt stands, in a few words (`short` on a phone), and whether it needs a look. */
export function receiptState(r: Pick<Receipt, "status" | "filed">): { text: string; short: string; tone: "fine" | "look" | "plain" } {
  switch (r.status) {
    case "filed":
      return r.filed?.how === "split"
        ? { text: `Split ${r.filed.lines.length} ways`, short: "Split", tone: "fine" }
        : { text: "Filed", short: "Filed", tone: "fine" };
    case "waiting":
      return { text: "Waiting for the charge", short: "Waiting", tone: "plain" };
    case "unmatched":
      return { text: "No charge found", short: "No charge", tone: "look" };
    case "held":
      return { text: "Needs a look", short: "Look", tone: "look" };
    case "failed":
      return { text: "Couldn't read it", short: "Unreadable", tone: "look" };
    default:
      return { text: "Reading", short: "Reading", tone: "plain" };
  }
}

/** Each category's share of the receipt, biggest first (pure): what was filed, else what the lines say. */
export function receiptSplit(r: Pick<Receipt, "filed" | "items">): { categoryId: string; amount: number }[] {
  if (r.filed?.lines.length) return r.filed.lines.map((l) => ({ categoryId: l.categoryId, amount: Number(l.amount) }));
  const by = new Map<string, number>();
  for (const it of r.items) by.set(it.categoryId, Math.round(((by.get(it.categoryId) ?? 0) + it.price) * 100) / 100);
  return [...by.entries()].map(([categoryId, amount]) => ({ categoryId, amount })).filter((l) => l.amount > 0).sort((a, b) => b.amount - a.amount);
}

/** A category's short name: the part after "Parent > ". */
export const shortCategory = (cats: ReceiptCategory[], id: string) => {
  const name = cats.find((c) => c.id === id)?.name ?? id;
  return name.includes(" > ") ? name.split(" > ").pop()! : name;
};

/** "Costco Wholesale" from "COSTCO WHOLESALE". */
export function storeName(store: string | null): string {
  if (!store) return "Receipt";
  const letters = store.replace(/[^\p{L}]/gu, "");
  const shouty = letters && letters.replace(/[^\p{Lu}]/gu, "").length / letters.length > 0.7;
  return shouty ? store.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : store;
}
