// money-hub patch: a loan's schedule on its Holdings page (owner, 2026-10-03: a loan in Vietnam, "what if
// i also want to track the loan amount term and the interest rate?"). The money-hub service works it out
// from the liability's original amount, rate, start date, term and how it is paid back (lib/loans.js):
// the payoff date, this month's payment and the interest still to come; with "Balance follows the
// schedule" on, it also steps the balance down on each payment day.
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { AmountDisplay } from "@wealthfolio/ui";
import { Separator } from "@wealthfolio/ui/components/ui/separator";

import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { QueryKeys } from "@/lib/query-keys";

export interface LoanRow {
  n: number;
  date: string;
  principal: number;
  interest: number;
  payment: number;
  balance: number;
}

export interface LoanView {
  id: string;
  name: string;
  currency: string;
  terms: {
    original: number | null;
    rate: number | null;
    termMonths: number | null;
    start: string | null;
    /** The due date: payments fall on its day each month. */
    maturity: string | null;
    method: "annuity" | "equal_principal" | "interest_only";
    follow: boolean;
  };
  missing: string[];
  /** No start date: counted from the first balance typed, the term from then. */
  countedFrom?: { date: string; balance: number } | null;
  /** The Rental page keeps this one's balance (its mortgage). */
  keptBy: "rental" | null;
  schedule?: {
    anchor: { date: string; balance: number; typed: boolean };
    rows: LoanRow[];
    /** What is paid each month (interest only: the interest; the principal comes with `finalPayment`). */
    regular: number | null;
    finalPayment: number | null;
    paidCount: number;
    balanceToday: number;
    next: LoanRow | null;
    payoff: string | null;
    monthsLeft: number;
    interestLeft: number;
  };
}

const BASE = "/api/money-hub/loans";
export const LOAN_KEY = (id: string) => ["money-hub", "loan", id] as const;

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

export function useLoan(id: string, enabled = true) {
  return useQuery({ queryKey: LOAN_KEY(id), queryFn: () => call<LoanView>("GET", `/${encodeURIComponent(id)}`), enabled, staleTime: 60 * 1000 });
}

/** After the loan's details are saved: its balance brought up to its schedule now, then the page reread. */
export async function syncLoanAfterSave(id: string, qc: QueryClient) {
  await call("POST", "/sync", { id }).catch(() => null);
  await Promise.all([
    qc.invalidateQueries({ queryKey: LOAN_KEY(id) }),
    qc.invalidateQueries({ queryKey: [QueryKeys.ALTERNATIVE_HOLDINGS] }),
    qc.invalidateQueries({ queryKey: [QueryKeys.QUOTE_HISTORY] }),
  ]);
}

/** "240 months" as people say it: 20 years, 2 years 6 months, 9 months. */
export function termLabel(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const part = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  return [y ? part(y, "year") : null, m ? part(m, "month") : null].filter(Boolean).join(" ") || part(0, "month");
}

const monthYear = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
const shortDay = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const fullDay = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const STYLE = {
  annuity: "Same payment every month",
  equal_principal: "Payment goes down each month",
  interest_only: "Interest only, principal at the end",
} as const;

/** The rows under the loan's details: term, payoff, the next payment, interest to come. */
export function LoanScheduleSection({ id, currency }: { id: string; currency: string }) {
  const { isBalanceHidden } = useBalancePrivacy();
  const { data } = useLoan(id);
  if (!data || data.keptBy) return null;
  const s = data.schedule;
  const t = data.terms;
  const amount = (v: number) => <AmountDisplay value={v} currency={currency} isHidden={isBalanceHidden} />;
  const row = (label: string, value: React.ReactNode, foot?: React.ReactNode) => (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="min-w-0 text-right font-medium">
        {value}
        {foot ? <span className="text-muted-foreground block text-xs font-normal">{foot}</span> : null}
      </span>
    </div>
  );

  return (
    <>
      <Separator className="my-4" />
      <div className="space-y-4 text-sm">
        {!s ? (
          <p className="text-muted-foreground text-sm">
            Add the {data.missing.join(", ")} in Edit details to see the payoff date and each payment.
          </p>
        ) : (
          <>
            {t.termMonths && !t.maturity ? row("Term", termLabel(t.termMonths), STYLE[t.method] ?? STYLE.annuity) : null}
            {/* A due date is a day: shown in full, with how it is paid back. */}
            {s.payoff && t.maturity
              ? row("Due", fullDay(s.payoff), `${STYLE[t.method] ?? STYLE.annuity}, ${s.monthsLeft} payment${s.monthsLeft === 1 ? "" : "s"} left`)
              : s.payoff
                ? row("Pays off", monthYear(s.payoff), `${s.monthsLeft} payment${s.monthsLeft === 1 ? "" : "s"} left`)
                : null}
            {s.next && s.regular != null
              ? row(
                  "Monthly payment",
                  amount(s.regular),
                  t.method === "interest_only" ? (
                    <>Interest only, next {shortDay(s.next.date)}</>
                  ) : (
                    <>
                      {shortDay(s.next.date)}: {amount(s.next.principal)} principal, {amount(s.next.interest)} interest
                    </>
                  ),
                )
              : null}
            {/* Interest only: the principal comes back in one payment at the end. */}
            {t.method === "interest_only" && s.payoff && s.finalPayment != null && s.monthsLeft > 0
              ? row("Last payment", amount(s.finalPayment), `${fullDay(s.payoff)}: the principal plus that month's interest`)
              : null}
            {s.monthsLeft > 0 ? row("Interest still to pay", amount(s.interestLeft)) : null}
            {data.countedFrom && !t.maturity ? (
              <p className="text-muted-foreground text-xs leading-snug">
                Counted from your balance on {fullDay(data.countedFrom.date)}. Add the start date and original amount in Edit details to
                count from when the loan began.
              </p>
            ) : null}
            <p className="text-muted-foreground text-xs leading-snug">
              {t.follow
                ? `The balance steps down on each payment day. Type the balance your bank shows (Update value) and it carries on from there.`
                : `The balance stays as you type it. Turn on "Balance follows the schedule" in Edit details to step it down each month.`}
            </p>
          </>
        )}
      </div>
    </>
  );
}
