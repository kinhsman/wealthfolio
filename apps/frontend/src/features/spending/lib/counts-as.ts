// money-hub patch: "Counts as" on a bank entry (owner, 2026-09-30: a Wise transfer showed as Set
// aside and "I want to be able to do it myself in the UI"). The owner picks Spending, Income,
// Saving or Not counted from the row's menu; the money-hub service remembers it per bank
// transaction (/api/money-hub/plaid/counts-as, server/drive-backup/lib/plaidSync.js setCountsAs)
// so no bank sync undoes it, and rewrites the entry now. Only bank-imported entries (PLAID).
import type { CashActivity } from "../types/cash-activity";

export type CountsAs = "spending" | "income" | "saving" | "neutral" | "auto";

export interface CountsAsTarget {
  activity: CashActivity;
}

export const canSetCountsAs = (a: CashActivity) => a.sourceSystem === "PLAID";

// The one open picker, for the dialog host (mounted once in App.tsx).
let current: CountsAsTarget | null = null;
const listeners = new Set<() => void>();
export const countsAsStore = {
  get: () => current,
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  open: (target: CountsAsTarget) => {
    current = target;
    listeners.forEach((fn) => fn());
  },
  close: () => {
    current = null;
    listeners.forEach((fn) => fn());
  },
};

export async function setCountsAs(activityId: string, choice: CountsAs): Promise<{ pending?: boolean }> {
  const res = await fetch("/api/money-hub/plaid/counts-as", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ activityId, choice }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `The money app helper said ${res.status}`);
  return data as { pending?: boolean };
}
