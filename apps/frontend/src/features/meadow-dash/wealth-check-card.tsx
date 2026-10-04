// money-hub patch: the Wealth check card on the Net worth tab (owner, 10-03, after the mock). Net worth against
// age x pre-tax yearly income / 10 (lib/wealth-check.ts): a PAW holds double that, a UAW half or less.
// Age = the retirement goal's birth month, income = the last 12 months of income (the Spending page's own
// figure, so after tax); both can be typed over here. Accounts can be left out in their own settings.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { getGoalPlan } from "@/adapters";
import { DashboardCard } from "@/components/dashboard-card";
import { useSpendingReport } from "@/features/spending/hooks/use-spending-report";
import { ageFromBirthYearMonth, parseSettingsJson } from "@/features/goals/retirement-planner/lib/plan-adapter";
import { useGoals } from "@/features/goals/hooks/use-goals";
import { useAccounts } from "@/hooks/use-accounts";
import { useLatestValuations } from "@/hooks/use-latest-valuations";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { QueryKeys } from "@/lib/query-keys";
import type { GoalPlan } from "@/lib/types";
import {
  expectedNetWorth,
  isLeftOutOfWealthCheck,
  netWorthWithout,
  PAW_MULTIPLE,
  UAW_MULTIPLE,
  wealthRatio,
  wealthStatus,
  type WealthStatus,
} from "@/lib/wealth-check";
import { formatDateISO, parseLocalDate } from "@/lib/utils";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";

import { CompactAmount } from "@/pages/net-worth/components/compact-amount";

// The bar runs 0 to 2.5x the expected amount, so the UAW line sits at 20%, expected at 40%, PAW at 80%.
const BAR_MAX = 2.5;
const pct = (multiple: number) => `${(multiple / BAR_MAX) * 100}%`;

const PILL: Record<WealthStatus, { label: string; className: string }> = {
  paw: { label: "PAW", className: "bg-success/10 text-success" },
  middle: { label: "In the middle", className: "bg-muted text-muted-foreground" },
  uaw: { label: "UAW", className: "bg-destructive/10 text-destructive" },
};

const FIELD =
  "h-8 w-full rounded-md border border-[var(--m-line)] bg-transparent px-2 text-sm tabular-nums outline-none focus:border-[var(--m-muted)]";

interface WealthCheckCardProps {
  /** Net worth as the server counts it, base currency. */
  netWorth: number;
  currency: string;
  /** Today, YYYY-MM-DD, in the app's timezone. */
  asOf: string;
}

export function WealthCheckCard({ netWorth, currency, asOf }: WealthCheckCardProps) {
  const [editing, setEditing] = useState(false);
  const [birthTyped, setBirthTyped] = usePersistentState<string>("wealth-check-birth", "");
  const [incomeTyped, setIncomeTyped] = usePersistentState<number | null>("wealth-check-income", null);

  const { accounts } = useAccounts({ filterActive: false, includeArchived: false });
  const leftOut = useMemo(() => accounts.filter(isLeftOutOfWealthCheck), [accounts]);
  const { latestValuations, isLoading: valuationsLoading } = useLatestValuations(
    useMemo(() => leftOut.map((a) => a.id), [leftOut]),
  );
  const counted = useMemo(
    () => netWorthWithout(netWorth, leftOut, latestValuations ?? []),
    [netWorth, leftOut, latestValuations],
  );

  // Birth month from the retirement goal's plan.
  const { goals } = useGoals();
  const retirement = goals.find((g) => g.goalType === "retirement" && g.statusLifecycle !== "archived");
  const { data: plan } = useQuery<GoalPlan | null, Error>({
    queryKey: QueryKeys.goalPlan(retirement?.id ?? ""),
    queryFn: () => getGoalPlan(retirement!.id),
    enabled: !!retirement,
  });
  const today = useMemo(() => parseLocalDate(asOf), [asOf]);
  const planBirth =
    plan?.planKind === "retirement" && plan.settingsJson
      ? parseSettingsJson(plan.settingsJson, today).personal.birthYearMonth
      : undefined;
  const birth = birthTyped || planBirth || "";
  const age = birth ? ageFromBirthYearMonth(birth, today) : undefined;

  // The last 12 months of income.
  const range = useMemo(() => {
    const start = new Date(today);
    start.setFullYear(start.getFullYear() - 1);
    start.setDate(start.getDate() + 1);
    return { startDate: formatDateISO(start), endDate: formatDateISO(today) };
  }, [today]);
  const { data: report, isLoading: incomeLoading } = useSpendingReport(range);
  const reportIncome = report?.current.income ?? 0;
  const income = incomeTyped ?? (reportIncome > 0 ? reportIncome : null);

  const expected = age != null && income != null ? expectedNetWorth(age, income) : null;
  const ratio = expected != null ? wealthRatio(counted, expected) : null;
  const status = ratio != null ? wealthStatus(ratio) : null;
  const pill = status ? PILL[status] : null;

  const loading = incomeLoading || valuationsLoading;
  const message =
    ratio == null || expected == null
      ? null
      : status === "paw"
        ? `You hold ${ratio.toFixed(1)}x what is expected`
        : status === "uaw"
          ? "At or below half of what is expected"
          : null;

  return (
    <DashboardCard
      title="Wealth check"
      action={
        <div className="flex items-center gap-2">
          {pill ? (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${pill.className}`}>
              {pill.label}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setEditing((on) => !on)}
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
          >
            {editing ? "Done" : "Edit"}
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : ratio != null && expected != null && income != null && age != null ? (
        <>
          <div className="text-2xl font-bold tabular-nums max-md:text-xl">{ratio.toFixed(2)}x</div>
          <p className="text-muted-foreground mt-0.5 text-xs max-md:hidden">
            {message ??
              (expected * PAW_MULTIPLE - counted > 0 ? (
                <>
                  Needs <CompactAmount value={expected * PAW_MULTIPLE - counted} currency={currency} /> more to reach PAW
                </>
              ) : null)}
          </p>

          <div className="relative mb-1.5 mt-7 h-2.5 rounded-md max-md:mt-6" aria-hidden>
            <div
              className="absolute inset-0 rounded-md"
              style={{
                background: `linear-gradient(90deg, var(--destructive) 0 ${pct(UAW_MULTIPLE)}, var(--m-line) ${pct(UAW_MULTIPLE)} ${pct(PAW_MULTIPLE)}, var(--success) ${pct(PAW_MULTIPLE)} 100%)`,
                opacity: 0.85,
              }}
            />
            {[
              ["UAW line", UAW_MULTIPLE],
              ["Expected", 1],
              ["PAW line", PAW_MULTIPLE],
            ].map(([label, at]) => (
              <div
                key={label}
                className="bg-foreground/50 absolute -top-1.5 h-[22px] w-px"
                style={{ left: pct(at as number) }}
              >
                <span className="text-muted-foreground absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px]">
                  {label}
                </span>
              </div>
            ))}
            <div
              className="border-foreground bg-background absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-4"
              style={{ left: `${Math.min(Math.max(ratio, 0) / BAR_MAX, 1) * 100}%` }}
            />
          </div>
          <div className="text-muted-foreground mb-3.5 flex justify-between text-[11px]" aria-hidden>
            <span>UAW</span>
            <span>Middle</span>
            <span>PAW</span>
          </div>

          <dl className="border-[var(--m-line)] border-t text-[13px]">
            <Row label="Net worth" value={counted} currency={currency} />
            <Row label={`Expected (age ${age} x yearly income / 10)`} value={expected} currency={currency} />
            <Row label="PAW at" value={expected * PAW_MULTIPLE} currency={currency} />
            <Row label="UAW at or below" value={expected * UAW_MULTIPLE} currency={currency} last />
          </dl>
          <p className="text-muted-foreground mt-2.5 text-[11px] leading-snug max-md:hidden">
            Income is <CompactAmount value={income} currency={currency} /> a year
            {incomeTyped != null ? " (typed in)" : ", your last 12 months of income, after tax"}.
            {leftOut.length > 0
              ? ` ${leftOut.length} account${leftOut.length === 1 ? " is" : "s are"} left out.`
              : ""}
          </p>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          {age == null
            ? "Add your birth month to see where you stand."
            : "Add your yearly income to see where you stand."}
        </p>
      )}

      {editing ? (
        <div className="mt-3.5 grid gap-3 border-t border-[var(--m-line)] pt-3.5">
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Birth month</span>
            <input
              type="month"
              className={FIELD}
              value={birth}
              onChange={(e) => setBirthTyped(e.target.value)}
            />
            {planBirth && !birthTyped ? (
              <span className="text-muted-foreground/70">From your retirement goal</span>
            ) : null}
          </label>
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Yearly income before tax</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              className={FIELD}
              placeholder={reportIncome > 0 ? `${Math.round(reportIncome)} (last 12 months)` : "0"}
              value={incomeTyped ?? ""}
              onChange={(e) => setIncomeTyped(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))}
            />
          </label>
          <p className="text-muted-foreground text-xs">
            Leave an account out in its own settings, under Wealth check.{" "}
            <Link to="/settings/accounts" className="underline underline-offset-4">
              Open accounts
            </Link>
          </p>
        </div>
      ) : null}
    </DashboardCard>
  );
}

function Row({
  label,
  value,
  currency,
  last,
}: {
  label: string;
  value: number;
  currency: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-3 py-2 max-md:py-1.5 ${last ? "" : "border-b border-[var(--m-line)]"}`}
    >
      <dt className="text-muted-foreground min-w-0">{label}</dt>
      <dd className="font-semibold tabular-nums">
        <CompactAmount value={value} currency={currency} />
      </dd>
    </div>
  );
}
