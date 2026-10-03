// money-hub patch: a loan's schedule on its Holdings page (owner, 2026-10-03: a loan in Vietnam, "what if
// i also want to track the loan amount term and the interest rate?"). The money-hub service works it out
// from the liability's original amount, rate, start date, term and how it is paid back (lib/loans.js):
// the payoff date, this month's payment and the interest still to come; with "Balance follows the
// schedule" on, it also steps the balance down on each payment day.
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AmountDisplay } from "@wealthfolio/ui";
import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { Switch } from "@wealthfolio/ui/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@wealthfolio/ui/components/ui/table";

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
    autoBills: boolean;
    paymentDay: number | null;
    renewalFeePct: number | null;
  };
  /** One loan drawn in lines: each its number, amount and the day its term ends, soonest first. */
  lines: {
    id: string;
    number: string;
    amount: number;
    end: string | null;
    daysLeft: number | null;
    /** Its amount times the renewal fee percent, due when its term ends; null with no percent set. */
    fee: number | null;
    /** Its share of the month's interest. */
    monthlyInterest: number | null;
  }[];
  linesTotal: number;
  feesTotal: number | null;
  /** The next day lines end, how many, their amount and the fee due then. */
  nextRenewal: { date: string; daysLeft: number; count: number; amount: number; fee: number | null } | null;
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
    /** Interest only with no term or due date: the interest goes on, no last payment. */
    openEnded: boolean;
    finalPayment: number | null;
    paidCount: number;
    balanceToday: number;
    next: LoanRow | null;
    payoff: string | null;
    monthsLeft: number | null;
    interestLeft: number | null;
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

/** Lines to renew within this many days are marked (amber: needs a look). */
const RENEW_SOON_DAYS = 14;

function renewLabel(days: number): string {
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} past`;
  if (days === 0) return "today";
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

/** The loan's lines in short, for its details card: how many and their total, and the next renewal
 *  (owner, 10-03: each line is renewed with the bank when its term ends; the full table is below). */
function LoanLinesSummary({ data, amount }: { data: LoanView; amount: (v: number) => React.ReactNode }) {
  if (!data.lines.length) return null;
  const n = data.nextRenewal;
  const soon = !!n && n.daysLeft <= RENEW_SOON_DAYS;
  return (
    <>
      <div className="flex justify-between gap-3">
        <span className="text-muted-foreground shrink-0">Lines</span>
        {/* How many (owner, 10-03: "for lines show the # of lines"); their total is the balance above. */}
        <span className="min-w-0 text-right font-medium">
          {data.lines.length}
          <span className="text-muted-foreground block text-xs font-normal">Table below</span>
        </span>
      </div>
      {n ? (
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground shrink-0">Next renewal</span>
          <span className="min-w-0 text-right font-medium">
            {fullDay(n.date)}
            <span className="block text-xs font-normal">
              <span className={soon ? "rounded-full bg-[var(--m-warn-soft,#fbe9d2)] px-1.5 py-px text-[var(--m-warn,#7a4300)]" : "text-muted-foreground"}>
                {renewLabel(n.daysLeft)}
              </span>
              <span className="text-muted-foreground">
                {" "}
                {n.count} line{n.count === 1 ? "" : "s"}
                {n.fee != null ? (
                  <>
                    , fee {amount(n.fee)}
                  </>
                ) : null}
              </span>
            </span>
          </span>
        </div>
      ) : null}
    </>
  );
}

/** Every line of the loan, like the bank's sheet (owner, 10-03: "add a table of those lines to the bottom
 *  ... similar to the excel screenshot"): its number, amount, share of the monthly interest, the day its
 *  term ends and the days left, and the renewal fee due then. On a phone: number and amount, the rest
 *  under them. */
export function LoanLinesTable({ id, currency }: { id: string; currency: string }) {
  const { isBalanceHidden } = useBalancePrivacy();
  const { data } = useLoan(id);
  if (!data || data.keptBy || !data.lines.length) return null;
  const amount = (v: number | null) => (v == null ? <span className="text-muted-foreground">-</span> : <AmountDisplay value={v} currency={currency} isHidden={isBalanceHidden} />);
  const pct = data.terms.renewalFeePct;
  const totalInterest = data.lines.reduce((sum, l) => sum + (l.monthlyInterest ?? 0), 0);
  const head = "text-muted-foreground h-9 px-3 text-[11px] font-normal";
  const cell = "px-3 py-2.5 tabular-nums";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-lg font-bold">Lines</h3>
        <span className="text-muted-foreground text-xs">
          {pct != null ? `Renewal fee ${pct}% of each line, due when its term ends` : "Set a renewal fee % in Edit details to see each fee"}
        </span>
      </div>
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={head}>Loan number</TableHead>
              <TableHead className={`${head} text-right`}>Amount</TableHead>
              <TableHead className={`${head} hidden text-right md:table-cell`}>Interest a month</TableHead>
              <TableHead className={`${head} hidden sm:table-cell`}>Term ends</TableHead>
              <TableHead className={`${head} hidden text-right sm:table-cell`}>Renewal fee</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.lines.map((l, i) => {
              const soon = l.daysLeft != null && l.daysLeft <= RENEW_SOON_DAYS;
              const when = l.end ? (
                <>
                  {fullDay(l.end)}{" "}
                  <span className={soon ? "rounded-full bg-[var(--m-warn-soft,#fbe9d2)] px-1.5 py-px text-[11px] text-[var(--m-warn,#7a4300)]" : "text-muted-foreground text-xs"}>
                    {l.daysLeft != null ? renewLabel(l.daysLeft) : ""}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">No end date</span>
              );
              return (
                <TableRow key={l.id}>
                  <TableCell className={cell}>
                    <span className="font-medium">{l.number || `Line ${i + 1}`}</span>
                    {/* A phone: when it ends, under its number. */}
                    <span className="block text-xs sm:hidden">{when}</span>
                  </TableCell>
                  <TableCell className={`${cell} text-right`}>
                    <span className="font-medium">{amount(l.amount)}</span>
                    {l.fee != null ? (
                      <span className="text-muted-foreground block text-xs sm:hidden">fee {amount(l.fee)}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className={`${cell} hidden text-right md:table-cell`}>{amount(l.monthlyInterest)}</TableCell>
                  <TableCell className={`${cell} hidden sm:table-cell`}>{when}</TableCell>
                  <TableCell className={`${cell} hidden text-right sm:table-cell`}>{amount(l.fee)}</TableCell>
                </TableRow>
              );
            })}
            <TableRow className="hover:bg-transparent">
              <TableCell className={`${cell} text-muted-foreground`}>
                Total, {data.lines.length} line{data.lines.length === 1 ? "" : "s"}
              </TableCell>
              <TableCell className={`${cell} text-right font-medium`}>
                {amount(data.linesTotal)}
                {data.feesTotal != null ? <span className="text-muted-foreground block text-xs font-normal sm:hidden">fees {amount(data.feesTotal)}</span> : null}
              </TableCell>
              <TableCell className={`${cell} hidden text-right font-medium md:table-cell`}>{amount(totalInterest)}</TableCell>
              <TableCell className={`${cell} hidden sm:table-cell`} />
              <TableCell className={`${cell} hidden text-right font-medium sm:table-cell`}>{amount(data.feesTotal)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** The rows under the loan's details: term, payoff, the next payment, interest to come. */
export function LoanScheduleSection({ id, currency }: { id: string; currency: string }) {
  const { isBalanceHidden } = useBalancePrivacy();
  const qc = useQueryClient();
  const { data } = useLoan(id);
  const [toggling, setToggling] = useState(false);
  if (!data || data.keptBy) return null;
  const s = data.schedule;
  const t = data.terms;

  const handleToggleAutoBills = async (enabled: boolean) => {
    setToggling(true);
    try {
      await call("POST", `/${encodeURIComponent(id)}/auto-bills`, { enabled });
      await Promise.all([
        qc.invalidateQueries({ queryKey: LOAN_KEY(id) }),
        qc.invalidateQueries({ queryKey: [QueryKeys.ALTERNATIVE_HOLDINGS] }),
        qc.invalidateQueries({ queryKey: ["money-hub", "subscriptions"] }),
      ]);
      toast.success(
        enabled
          ? `${data.name} imported to bills tracking.`
          : `${data.name} removed from bills tracking.`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update bills tracking");
    } finally {
      setToggling(false);
    }
  };

  // A loan in lines (owner, 10-03): renewed line by line, never paid off in one last payment.
  const lined = data.lines.length > 0;
  const feesMonthly = lined && data.feesTotal != null && t.termMonths ? data.feesTotal / t.termMonths : null;
  const withFees =
    s?.regular != null && feesMonthly != null && data.linesTotal > 0
      ? {
          monthly: Math.round((s.regular + feesMonthly) * 100) / 100,
          fees: Math.round(feesMonthly),
          rate: (((s.regular + feesMonthly) * 12 * 100) / data.linesTotal).toFixed(2),
        }
      : null;
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
            {t.termMonths && (!t.maturity || lined) ? row("Term", termLabel(t.termMonths), lined ? "Each line, when it starts or renews" : (STYLE[t.method] ?? STYLE.annuity)) : null}
            {/* A due date is a day: shown in full, with how it is paid back. */}
            {lined && t.maturity ? row("Due", fullDay(t.maturity)) : null}
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
            {/* The month with the renewal fees spread over each line's term (owner, 10-03: "add a new line
                monthly adjusted including the renewal fee"): every line renews each term, so the fees come
                round once a term. */}
            {withFees
              ? row(
                  "Monthly with fees",
                  amount(withFees.monthly),
                  <>
                    Fees {amount(withFees.fees)} a month, {withFees.rate}% a year
                  </>,
                )
              : null}
            {/* Interest only: the principal comes back in one payment at the end. */}
            {!lined && t.method === "interest_only" && s.payoff && s.finalPayment != null && (s.monthsLeft ?? 0) > 0
              ? row("Last payment", amount(s.finalPayment), `${fullDay(s.payoff)}: the principal plus that month's interest`)
              : null}
            {!lined && (s.monthsLeft ?? 0) > 0 && s.interestLeft != null ? row("Interest still to pay", amount(s.interestLeft)) : null}
            {s.openEnded && s.regular != null ? row("Interest a year", amount(s.regular * 12)) : null}
            {data.countedFrom && !t.maturity && !s.openEnded ? (
              <p className="text-muted-foreground text-xs leading-snug">
                Counted from your balance on {fullDay(data.countedFrom.date)}. Add the start date and original amount in Edit details to
                count from when the loan began.
              </p>
            ) : null}
            {data.lines.length || s.openEnded ? null : (
              <p className="text-muted-foreground text-xs leading-snug">
                {t.follow
                  ? `The balance steps down on each payment day. Type the balance your bank shows (Update value) and it carries on from there.`
                  : `The balance stays as you type it. Turn on "Balance follows the schedule" in Edit details to step it down each month.`}
              </p>
            )}
          </>
        )}
        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="space-y-0.5">
            <span className="font-medium text-sm">Import to bills tracking</span>
            <span className="text-muted-foreground block text-xs leading-snug">
              Monthly interest and {t.termMonths ? `${t.termMonths}-month ` : ""}renewal fee automatically imported into bills
            </span>
          </div>
          <Switch
            checked={!!t.autoBills}
            disabled={toggling}
            onCheckedChange={handleToggleAutoBills}
            aria-label="Import to bills tracking"
          />
        </div>
        {/* The lines show whatever else is still missing. */}
        <LoanLinesSummary data={data} amount={amount} />
      </div>
    </>
  );
}
