// money-hub patch: Pending vs posted (owner, 2026-10-01: "track what changed between pending and
// after its posted. that way i can track tips for restaurants or other suspicious charge from a
// merchant"). The money-hub service writes down each pending bank entry at every sync and puts it
// beside what it posted as (server/drive-backup/lib/pendingChanges.js); the page, the tag on a
// changed entry in the list, and the alert on Settings, Alerts read it here.
import { useQuery, type QueryClient } from "@tanstack/react-query";

const BASE = "/api/money-hub/plaid/pending-changes";
export const PENDING_CHANGES_KEY = ["money-hub", "plaid", "pending-changes"];

export type PendingChangeStatus = "pending" | "posted" | "dropped";
export type PendingAlertKind = "up" | "down" | "dropped";

/** Amounts are the bank's: positive = money out (a charge). `diff` = posted minus the first pending amount. */
export interface PendingChange {
  id: string;
  status: PendingChangeStatus;
  /** "bank": the bank named the pending entry; "match": same card, merchant and day. */
  how: "bank" | "match" | null;
  name: string;
  bankText: string;
  postedBankText: string | null;
  accountId: string;
  account: string | null;
  currency: string;
  /** The day it was pending from. */
  date: string;
  firstPending: number;
  lastPending: number;
  /** Every amount it had while pending, in order (one entry when it never changed). */
  pendingHistory: number[];
  posted: number | null;
  postedDate: string | null;
  diff: number | null;
  /** The posted entry in the money app, for the list's tag. */
  activityId: string | null;
  seenAt: string;
  settledAt: string | null;
  goneAt: string | null;
}

export interface PendingAlerts {
  on: boolean;
  minDollars: number;
  lower: boolean;
  dropped: boolean;
}

export interface PendingChangesView {
  since: string | null;
  alerts: PendingAlerts;
  items: PendingChange[];
  went?: { discord: boolean; ntfy: boolean };
  sample?: string;
}

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

export const pendingChangesApi = {
  view: () => call<PendingChangesView>("GET", ""),
  setAlerts: (patch: Partial<PendingAlerts>) => call<PendingChangesView>("PUT", "/alerts", patch),
  test: (kind: PendingAlertKind) => call<PendingChangesView>("POST", "/alerts/test", { kind }),
};

async function fetchView(): Promise<PendingChangesView | null> {
  const res = await fetch(BASE, { credentials: "include" });
  if (!res.ok) return null;
  return res.json();
}

export function usePendingChanges() {
  return useQuery({
    queryKey: PENDING_CHANGES_KEY,
    queryFn: fetchView,
    staleTime: 5 * 60 * 1000,
  });
}

/** Posted entries that changed, by entry id; one map shared by every row (react-query keeps `select`'s result while the data stays the same). */
export function useChangedByActivity() {
  return useQuery({
    queryKey: PENDING_CHANGES_KEY,
    queryFn: fetchView,
    staleTime: 5 * 60 * 1000,
    select: changedByActivity,
  });
}

export const setPendingChanges = (qc: QueryClient, v: PendingChangesView) => qc.setQueryData(PENDING_CHANGES_KEY, v);

/** A change worth showing: posted at another amount (to the cent). */
export const isChanged = (c: PendingChange) => c.status === "posted" && c.diff != null && Math.abs(c.diff) >= 0.01;

/** Posted entries that changed, by their money app entry id (the list's tag). */
export function changedByActivity(v: PendingChangesView | null | undefined): Map<string, PendingChange> {
  const m = new Map<string, PendingChange>();
  for (const c of v?.items ?? []) if (c.activityId && isChanged(c)) m.set(c.activityId, c);
  return m;
}

/** The share the posted amount moved from the first pending one, rounded, or null. */
export const changePct = (c: PendingChange) =>
  c.diff != null && c.firstPending ? Math.round((Math.abs(c.diff) / Math.abs(c.firstPending)) * 100) : null;

export const ALERT_STEPS = [0.01, 1, 2, 5, 10, 20];
