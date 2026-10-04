// money-hub patch: four more alerts (owner, 2026-10-02, from the Monarch comparison): big money moves,
// budget, bank connections and the weekly recap. Each is switched and tested on Settings, Alerts like
// the others; the money-hub service checks and sends them (server/drive-backup/lib/moneyAlerts.js).
import { useQuery } from "@tanstack/react-query";

export type BigAlertKind = "out" | "in";
export type BudgetAlertKind = "near" | "over";
export type ConnectionAlertKind = "signIn" | "broken" | "back";
export type RecapAlertKind = "weekly";
export type CardAlertKind = "dueSoon" | "overdue";
export type LoanAlertKind = "renewSoon" | "renewToday";
export type ReceiptAlertKind = "filed";

type Switches<K extends string> = { on: boolean } & Record<K, boolean>;

export interface MoneyAlertsView {
  big: { alerts: Switches<BigAlertKind>; outMin: number; inMin: number };
  budget: { alerts: Switches<BudgetAlertKind>; nearPct: number };
  connections: { alerts: Switches<ConnectionAlertKind>; down: number };
  recap: { alerts: Switches<RecapAlertKind> };
  /** Optional: a service from before the card reminders sends none. */
  cards?: { alerts: Switches<CardAlertKind>; daysBefore: number };
  /** Optional: a service from before the loan renewal reminders sends none. */
  loans?: { alerts: Switches<LoanAlertKind>; daysBefore: number };
  /** Optional: a service from before the receipt alert sends none. */
  receipts?: { alerts: Switches<ReceiptAlertKind> };
  went?: { discord: boolean; ntfy: boolean };
  sample?: string;
}

export type MoneyAlertGroup = "big" | "budget" | "connections" | "recap" | "cards" | "loans" | "receipts";

const BASE = "/api/money-hub/money-alerts";
export const MONEY_ALERTS_KEY = ["money-hub", "money-alerts"] as const;

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

export const moneyAlertsApi = {
  get: () => call<MoneyAlertsView>("GET", ""),
  /** A group's switches, plus its own setting: `outMin` / `inMin` (big), `nearPct` (budget). */
  set: (group: MoneyAlertGroup, patch: Record<string, boolean | number>) =>
    call<MoneyAlertsView>("PUT", `/${group}`, patch),
  test: (group: MoneyAlertGroup, kind: string) =>
    call<MoneyAlertsView>("POST", `/${group}/test`, { kind }),
};

export function useMoneyAlerts() {
  return useQuery({ queryKey: MONEY_ALERTS_KEY, queryFn: moneyAlertsApi.get, staleTime: 60 * 1000 });
}

export const BIG_ALERT_LABELS: Record<BigAlertKind, { title: string; text: string }> = {
  out: {
    title: "Money out",
    text: "A charge or payment at or over the amount above; a card charge as soon as it is pending.",
  },
  in: { title: "Money in", text: "A deposit at or over the amount above: a paycheck, a wire, money from someone." },
};

export const BUDGET_ALERT_LABELS: Record<BudgetAlertKind, { title: string; text: string }> = {
  near: { title: "Nearly used up", text: "The month's budget, a group or a category passes the share above." },
  over: { title: "Over budget", text: "A budget is spent past its amount." },
};

export const CONNECTION_ALERT_LABELS: Record<ConnectionAlertKind, { title: string; text: string }> = {
  signIn: {
    title: "Wants a sign-in",
    text: "A bank or a Gmail stops until you sign in again; again each week until it is fixed.",
  },
  broken: { title: "Keeps failing", text: "A bank has not synced for 12 hours for another reason." },
  back: { title: "Back again", text: "Once it works again, after one of the alerts above." },
};

export const RECAP_ALERT_LABELS: Record<RecapAlertKind, { title: string; text: string }> = {
  weekly: {
    title: "Every Monday at 9 AM",
    text: "Last week's spending, where it went, the biggest charge, money in, the budget and the bills of the next 7 days.",
  },
};

/** How much of a budget is spent before the warning, for the picker. */
export const NEAR_STEPS = [50, 75, 80, 90];

export const CARD_ALERT_LABELS: Record<CardAlertKind, { title: string; text: string }> = {
  dueSoon: { title: "Payment coming up", text: "A card's statement is due within the days above and not paid yet." },
  overdue: { title: "Payment overdue", text: "A card's due date passed and its statement is not paid." },
};

/** How many days before a card's due date the reminder comes, for the picker. */
export const DUE_STEPS = [1, 2, 3, 5, 7];

// Owner, 10-03: "add the renewal reminders, X day before" (a loan drawn in lines, each renewed with the
// bank when its term ends; Holdings, the loan, Edit details, Lines).
// money-hub patch: a receipt that waited for its card charge and filed it (owner, 10-03: "add the bell
// notice/alert when a waiting receipt gets filed").
export const RECEIPT_ALERT_LABELS: Record<ReceiptAlertKind, { title: string; text: string }> = {
  filed: { title: "Receipt filed", text: "A receipt that waited for its card charge found it, or one was found in your Gmail, and the charge is filed or split to match." },
};

export const LOAN_ALERT_LABELS: Record<LoanAlertKind, { title: string; text: string }> = {
  renewSoon: { title: "Renewal coming up", text: "A loan's lines whose term ends within the days above, with the renewal fee." },
  renewToday: { title: "Term ends today", text: "On the day a line's term ends, to renew it with the bank." },
};

/** How many days before a line's term ends the reminder comes, for the picker. */
export const RENEW_STEPS = [3, 5, 7, 10, 14, 30];
