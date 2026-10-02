// money-hub patch: free cash against the cards and the bills coming up (owner, 2026-10-01: "add a new
// section for free cash balance, add a lert if my free cash + buffer is lower than the credit card
// balance", then "include fidelity cash, projected bills and subscriptions as buffer, count pending;
// add the ability in settings to toggle an invesment account as cash ... nothing hardcoded"). The
// money-hub service adds it up (server/drive-backup/lib/freeCash.js); this file reads it, changes its
// settings, and holds the account switch's rule.
import { useQuery, type QueryClient } from "@tanstack/react-query";

export interface FreeCashAccount {
  id: string;
  name: string;
  accountType: string;
  /** The owner set the account's switch (otherwise it counts by default). */
  set: boolean;
  /** The money app's cash balance, what is pending on it (money out below zero), and the two together. */
  balance: number;
  pending: number;
  cash: number;
  asOf: string | null;
  /** False when the money app has no balance for it yet (counted as nothing). */
  known: boolean;
}

export interface FreeCashBill {
  key: string;
  name: string;
  group: "subscriptions" | "bills";
  amount: number;
  date: string;
  logoUrl: string | null;
  useBank: boolean;
  accountId: string | null;
  /** A shared bill: the whole of it, friends pay their part back later. */
  shared: boolean;
}

export type FreeCashAlertKind = "short" | "ok";

export interface FreeCashView {
  accounts: FreeCashAccount[];
  cards: { owed: number; pending: number; total: number; count: number };
  bills: {
    days: number;
    until: string;
    total: number;
    items: FreeCashBill[];
    /** Due, but already pending on a card (so in the cards). */
    skipped: (FreeCashBill & { why: "pending"; pendingAmount: number })[];
  };
  /** `cushion`: the amount the owner keeps aside on top (Settings, Alerts), 0 until set. */
  /** `taxes`: the April tax set-aside, while the switch on the Taxes page holds it back; 0 otherwise. */
  totals: { cash: number; cards: number; bills: number; cushion: number; taxes?: number; left: number };
  short: boolean;
  asOf: string | null;
  alerts: { on: boolean } & Record<FreeCashAlertKind, boolean>;
  shortSince: string | null;
  went?: { discord: boolean; ntfy: boolean };
  sample?: string;
}

const BASE = "/api/money-hub/free-cash";
export const FREE_CASH_KEY = ["money-hub", "free-cash"] as const;

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

export const freeCashApi = {
  get: () => call<FreeCashView>("GET", ""),
  setDays: (days: number) => call<FreeCashView>("PUT", "/days", { days }),
  setCushion: (amount: number) => call<FreeCashView>("PUT", "/cushion", { amount }),
  setAlerts: (patch: Partial<Record<FreeCashAlertKind | "on", boolean>>) =>
    call<FreeCashView>("PUT", "/alerts", patch),
  testAlert: (kind: FreeCashAlertKind) => call<FreeCashView>("POST", "/alerts/test", { kind }),
};

export function useFreeCash() {
  return useQuery({ queryKey: FREE_CASH_KEY, queryFn: freeCashApi.get, staleTime: 60 * 1000 });
}

export const refreshFreeCash = (qc: QueryClient) =>
  qc.invalidateQueries({ queryKey: FREE_CASH_KEY });

export const FREE_CASH_ALERT_LABELS: Record<FreeCashAlertKind, { title: string; text: string }> = {
  short: {
    title: "Cash is short",
    text: "Free cash no longer covers your cards, the bills coming up and your cushion, then once a week while it stays short.",
  },
  ok: { title: "Covered again", text: "Free cash covers your cards and bills again." },
};

/** How far ahead bills count, for the picker (31 = a full month, so each monthly bill is in). */
export const BILL_DAYS = [7, 14, 21, 31, 45, 62, 92];

// ------------------------------------------------------ the account's switch --

function parseMeta(meta?: string | null): Record<string, unknown> {
  if (!meta) return {};
  try {
    const parsed = JSON.parse(meta) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Whether an account's cash counts as free cash: its own switch (meta.freeCash), else a bank account
 *  linked through Plaid that is not a card. Never a card. The service's countsAsCash has the same rule. */
export function countsAsFreeCash(account: { accountType: string; meta?: string | null }): boolean {
  if (account.accountType === "CREDIT_CARD") return false;
  const meta = parseMeta(account.meta);
  if (typeof meta.freeCash === "boolean") return meta.freeCash;
  return account.accountType === "CASH" && meta.source === "plaid";
}

export function setFreeCashInMeta(meta: string | null | undefined, on: boolean): string {
  const parsed = parseMeta(meta);
  parsed.freeCash = on;
  return JSON.stringify(parsed);
}

/** "Nov 1". */
export const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
