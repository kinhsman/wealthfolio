import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { DashboardCard } from "@/components/dashboard-card";
import { cn } from "@/lib/utils";
import {
  Icons,
  PrivacyAmount,
  useAmountFormatting,
  useBalancePrivacy,
  useDateFormatting,
} from "@wealthfolio/ui";

import {
  againstBudget,
  paceWithFixed,
  withoutCharges,
  type ForecastParts,
} from "../lib/budget-forecast";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { topCategoryId } from "../lib/category-rollup";
import type { BudgetCategoryRow } from "../types/budget";
import type { DayBucket } from "../types/report";
import { type CategoryMetaMap } from "./category-chips";

type Status = "ok" | "warn" | "over";
interface PacePoint {
  day: number;
  value: number;
}
interface BudgetToday {
  year: number;
  month: number;
  day: number;
}

const MIN_HISTORICAL_PACE_MONTHS = 2;

function parseMonthKey(value: string | null | undefined): { year: number; month: number } | null {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  return { year, month };
}

const STATUS_ACCENTS: Record<
  Status,
  {
    lineColor: string;
    pillBg: string;
    accent: string;
    Icon: typeof Icons.AlertCircle;
    labelKey: string;
  }
> = {
  over: {
    lineColor: "var(--m-bad, #B85544)",
    pillBg: "var(--destructive)",
    accent: "var(--destructive)",
    Icon: Icons.AlertTriangle,
    labelKey: "spending:budgetChart.overBudget",
  },
  warn: {
    lineColor: "var(--m-warn-line, #C28B47)",
    pillBg: "#C28B47",
    accent: "var(--m-warn, #C28B47)",
    Icon: Icons.AlertCircle,
    labelKey: "spending:budgetChart.trendingHigh",
  },
  ok: {
    lineColor: "var(--m-forest, hsl(73 84% 27%))",
    pillBg: "hsl(73 84% 27%)",
    accent: "var(--success)",
    Icon: Icons.CheckCircle ?? Icons.AlertCircle,
    labelKey: "spending:budgetChart.onTrack",
  },
};

export function BudgetLineChartCard({
  monthKey,
  today,
  isCurrentMonth,
  onPreviousMonth,
  onNextMonth,
  canGoNextMonth,
  activityRange,
  target,
  spent,
  currency,
  historicalDailyAvg,
  forecastParts,
  forecastPending,
  allocations,
  spendingBreakdown,
  categoriesMeta,
  monthByDay,
  historicalByDay,
  fill = false,
}: {
  monthKey: string;
  today: BudgetToday;
  isCurrentMonth: boolean;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  canGoNextMonth: boolean;
  activityRange: { from: string; to: string };
  target: number;
  spent: number;
  currency: string;
  historicalDailyAvg: number;
  /** money-hub patch: the bills apart (lib/budget-forecast.ts); without it, Wealthfolio's own forecast. */
  forecastParts?: ForecastParts | null;
  /** money-hub patch: what the forecast needs is still loading; show a placeholder, not a passing number. */
  forecastPending?: boolean;
  allocations: BudgetCategoryRow[];
  spendingBreakdown: { categoryId: string; amount: number; count: number }[];
  categoriesMeta: CategoryMetaMap;
  monthByDay: DayBucket[];
  historicalByDay: DayBucket[];
  /** money-hub patch (owner, 10-02: "scale the monthly budget to match"): as tall as the Subscriptions &
   *  Bills card beside it, the chart taking the extra height. */
  fill?: boolean;
}) {
  const dateFormatting = useDateFormatting();

  const { t } = useTranslation();
  // All hooks must run unconditionally — the `target <= 0` early return below
  // sits between hooks otherwise, which trips "Rendered more hooks than during
  // the previous render" when a target is added or cleared.
  const monthMeta = useMemo(() => {
    const parts = parseMonthKey(monthKey) ?? today;
    const year = parts.year;
    const month = parts.month;
    const daysInMonth = new Date(year, month, 0).getDate();
    const dayOfMonth = isCurrentMonth ? Math.min(today.day, daysInMonth) : daysInMonth;
    return {
      dayOfMonth,
      daysInMonth,
      daysRemaining: isCurrentMonth ? Math.max(0, daysInMonth - dayOfMonth) : 0,
      monthLabel: dateFormatting
        .formatCalendarDate(
          { year, month, day: 1 },
          { calendar: "gregory", month: "long", year: "numeric" },
        ),
      shortLabel: dateFormatting
        .formatCalendarDate(
          { year, month, day: 1 },
          { calendar: "gregory", month: "short", year: "numeric" },
        ),
    };
  }, [monthKey, isCurrentMonth, dateFormatting, today]);
  const { dayOfMonth, daysInMonth, daysRemaining, monthLabel } = monthMeta;

  const cumulative = useMemo(() => {
    const byDay = new Map<number, number>();
    for (const b of monthByDay) {
      const d = parseInt(b.date.split("-")[2], 10);
      if (Number.isFinite(d)) byDay.set(d, (byDay.get(d) ?? 0) + b.outflow);
    }
    let running = 0;
    const out: { day: number; value: number }[] = [];
    for (let d = 1; d <= dayOfMonth; d++) {
      running += byDay.get(d) ?? 0;
      out.push({ day: d, value: running });
    }
    return out;
  }, [monthByDay, dayOfMonth]);

  const rings = useMemo(() => {
    const spentByTop = new Map<string, number>();
    for (const row of spendingBreakdown) {
      const topId = topCategoryId(row.categoryId, categoriesMeta);
      spentByTop.set(topId, (spentByTop.get(topId) ?? 0) + row.amount);
    }
    return allocations
      .map((al) => {
        const t = al.target || 0;
        if (t <= 0) return null;
        const meta = categoriesMeta.get(al.categoryId);
        const s = spentByTop.get(al.categoryId) ?? 0;
        return {
          id: al.categoryId,
          categoryId: al.categoryId,
          name: meta?.name ?? al.categoryId,
          color: meta?.color ?? null,
          icon: meta?.icon ?? null,
          target: t,
          spent: Math.max(0, s),
          pct: Math.max(0, s) / t,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((x, y) => y.pct - x.pct);
  }, [allocations, spendingBreakdown, categoriesMeta]);

  // Chart geometry derived from target — captured here so actualPath useMemo
  // can depend on stable primitives instead of recomputing each render.
  const chartW = 320;
  const chartH = 110;
  const padL = 0;
  const padR = 0;
  const padT = 24;
  const padB = 14;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;
  const yMax = Math.max(target, spent) * 1.05;

  const actualPath = useMemo(() => {
    if (!cumulative.length) return "";
    const xForDay = (day: number) => padL + ((day - 1) / Math.max(1, daysInMonth - 1)) * innerW;
    const yForVal = (v: number) => padT + (1 - v / yMax) * innerH;
    return (
      "M " +
      cumulative
        .map((p) => `${xForDay(p.day).toFixed(2)} ${yForVal(p.value).toFixed(2)}`)
        .join(" L ")
    );
  }, [cumulative, daysInMonth, innerW, innerH, padL, padT, yMax]);

  // money-hub patch: fixed bills (Exclude from forecast) are left out of the usual month's shape; they
  // count on their own day (paceWithFixed).
  const fixedParts =
    forecastParts &&
    isCurrentMonth &&
    forecastParts.fixedPaid.length + forecastParts.fixedDue.length > 0
      ? forecastParts
      : null;
  const paceHistory = useMemo(
    () => (fixedParts ? withoutCharges(historicalByDay, fixedParts.fixedHistory) : historicalByDay),
    [historicalByDay, fixedParts],
  );
  const historicalPace = useMemo(
    () => buildHistoricalPaceCurve(paceHistory, daysInMonth),
    [paceHistory, daysInMonth],
  );
  const paceAt = useMemo(
    () =>
      fixedParts
        ? paceWithFixed(fixedParts, target, daysInMonth, historicalPace?.pctByDay ?? null)
        : null,
    [fixedParts, target, daysInMonth, historicalPace],
  );

  const targetPacePath = useMemo(() => {
    if (paceAt && target > 0) {
      const xForDay = (day: number) => padL + ((day - 1) / Math.max(1, daysInMonth - 1)) * innerW;
      const yForVal = (v: number) => padT + (1 - v / yMax) * innerH;
      const points = Array.from({ length: daysInMonth }, (_, i) => ({
        day: i + 1,
        value: paceAt(i + 1),
      }));
      return toSvgPath(points, xForDay, yForVal);
    }
    if (!historicalPace || target <= 0) return "";
    const xForDay = (day: number) => padL + ((day - 1) / Math.max(1, daysInMonth - 1)) * innerW;
    const yForVal = (v: number) => padT + (1 - v / yMax) * innerH;
    return toSvgPath(
      historicalPace.points.map((p) => ({
        day: p.day,
        value: p.value * target,
      })),
      xForDay,
      yForVal,
    );
  }, [historicalPace, paceAt, target, daysInMonth, innerW, innerH, padL, padT, yMax]);

  const haveHistory = historicalDailyAvg > 0;
  // money-hub patch: with the bills apart (lib/budget-forecast.ts), the forecast is everything but the
  // bills switched to "Exclude from forecast", set against the budget less those (`fixed`).
  const sums =
    forecastParts && haveHistory && isCurrentMonth && target > 0
      ? againstBudget(target, spent, forecastParts, daysRemaining)
      : null;
  const forecast =
    target > 0 && isCurrentMonth
      ? haveHistory
        ? sums
          ? sums.others
          : spent + historicalDailyAvg * daysRemaining
        : dayOfMonth > 0
          ? (spent / dayOfMonth) * daysInMonth
          : 0
      : 0;
  const headerAction = (
    <BudgetCardHeaderActions
      monthLabel={monthMeta.shortLabel}
      monthKey={monthKey}
      onPreviousMonth={onPreviousMonth}
      onNextMonth={onNextMonth}
      canGoNextMonth={canGoNextMonth}
    />
  );

  if (target <= 0) {
    return (
      <DashboardCard
        title={t("spending:budgetChart.monthlyBudget")}
        subtitle={monthMeta.shortLabel}
        action={headerAction}
        className="text-center"
      >
        <p className="text-muted-foreground text-sm">{t("spending:budgetChart.noTarget")}</p>
        <Link
          to={`/spending/budget?month=${monthKey}`}
          className="text-foreground mt-2 inline-flex text-xs underline-offset-4 hover:underline"
        >
          {t("spending:budgetChart.setBudget")}
        </Link>
      </DashboardCard>
    );
  }

  // money-hub patch: on a reload the bills arrive after the spending; wait for them rather than show a
  // number that changes a moment later (owner, 10-01: "briefly show me the 9k value").
  if (isCurrentMonth && forecastPending) {
    return (
      <DashboardCard
        title={t("spending:budgetChart.monthlyBudget")}
        subtitle={monthLabel}
        action={headerAction}
      >
        <div className="space-y-3" aria-busy>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-[150px] w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      </DashboardCard>
    );
  }

  const remaining = Math.max(0, target - spent);
  const overBy = spent - target;
  const isOver = overBy > 0;
  const forecastReliable = isCurrentMonth && (haveHistory || dayOfMonth >= 7);
  const forecastDelta = sums ? sums.over : forecast - target;
  const willOverspend = forecastReliable && forecastDelta > 0;

  const historicalPaceAtToday = historicalPace?.pctByDay[dayOfMonth];
  const paceAtToday = paceAt
    ? paceAt(dayOfMonth)
    : target *
      (historicalPaceAtToday !== undefined ? historicalPaceAtToday : dayOfMonth / daysInMonth);
  const gapVsPace = spent - paceAtToday;
  const aheadOfPace = gapVsPace < 0;

  // money-hub patch: ONE verdict, the month's end (owner, 10-01: "one said on track, one said under
  // budget, one said over budget, i am totally lost"). With the bills apart, the status, the headline and
  // the chart's bubble all follow the forecast; today's pace is no longer a second opinion.
  // `perDay`: what everyday spending can be each day left and still land on budget.
  const perDay =
    sums && daysRemaining > 0 && forecastParts
      ? (sums.room - sums.spentOthers - forecastParts.billsLeftTotal) / daysRemaining
      : null;
  const planStatus: Status | null = sums
    ? sums.spentOthers + (forecastParts?.billsLeftTotal ?? 0) > sums.room
      ? "over"
      : sums.over > 0
        ? "warn"
        : "ok"
    : null;
  const status: Status =
    planStatus ?? (isOver ? "over" : isCurrentMonth && !aheadOfPace ? "warn" : "ok");
  const a = STATUS_ACCENTS[status];
  const statusLabel = planStatus
    ? planStatus === "over"
      ? "Over budget"
      : planStatus === "warn"
        ? "Heading over budget"
        : "On track"
    : !isCurrentMonth && !isOver
      ? t("spending:budgetChart.underBudget")
      : t(a.labelKey);

  const xForDay = (day: number) => padL + ((day - 1) / Math.max(1, daysInMonth - 1)) * innerW;
  const yForVal = (v: number) => padT + (1 - v / yMax) * innerH;

  const paceX1 = xForDay(1);
  const paceY1 = yForVal(0);
  const paceX2 = xForDay(daysInMonth);
  const paceY2 = yForVal(target);

  const endX = cumulative.length ? xForDay(cumulative[cumulative.length - 1].day) : padL;
  const endY = cumulative.length ? yForVal(cumulative[cumulative.length - 1].value) : padT + innerH;

  const pillLeftPctRaw = (endX / chartW) * 100;
  const statusChip = (
    <StatusChip status={status} label={statusLabel} />
  );
  const mainHeaderAction = (
    <BudgetCardHeaderActions
      monthLabel={monthMeta.shortLabel}
      monthKey={monthKey}
      onPreviousMonth={onPreviousMonth}
      onNextMonth={onNextMonth}
      canGoNextMonth={canGoNextMonth}
      status={statusChip}
      dayLabel={
        isCurrentMonth
          ? t("spending:budgetChart.dayOf", { day: dayOfMonth, total: daysInMonth })
          : t("spending:budgetChart.closed")
      }
    />
  );

  return (
    <DashboardCard
      title={t("spending:budgetChart.monthlyBudget")}
      subtitle={monthLabel}
      action={mainHeaderAction}
      fill={fill}
      className={fill ? "flex flex-col" : undefined}
    >
      <div className={cn("grid gap-x-6 gap-y-3 lg:grid-cols-[1.15fr_1fr]", fill && "flex-1")}>
      <div className="flex min-w-0 flex-col">
      <div>
        {sums && forecastParts ? (
          <>
            <div className="text-foreground text-[28px] font-medium leading-tight tabular-nums tracking-tight">
              <PrivacyAmount value={Math.abs(sums.over)} currency={currency} />{" "}
              <span className="text-muted-foreground/70 text-base font-medium">
                {sums.over > 0 ? "over" : "to spare"} by{" "}
                {((m) => m.charAt(0) + m.slice(1).toLowerCase())(
                  monthMeta.shortLabel.split(" ")[0],
                )}{" "}
                {daysInMonth}
              </span>
            </div>
            <div className="text-muted-foreground/80 mt-0.5 text-xs tabular-nums">
              if you keep spending like your usual days
            </div>
            <div
              className="mt-1.5 self-start rounded-full px-2.5 py-1 text-xs tabular-nums"
              style={{ color: a.accent, background: "var(--m-warn-panel, transparent)" }}
            >
              {perDay === null ? null : perDay > 0 ? (
                <>
                  To land on budget: <PrivacyAmount value={perDay} currency={currency} /> a day or
                  less on everyday spending (usually{" "}
                  <PrivacyAmount value={forecastParts.everydayDaily} currency={currency} />)
                </>
              ) : (
                <>Nothing left for everyday spending this month</>
              )}
            </div>
          </>
        ) : isCurrentMonth && willOverspend && forecastDelta > target * 0.05 ? (
          <>
            <div className="text-foreground text-[28px] font-medium leading-tight tabular-nums tracking-tight">
              <PrivacyAmount value={forecast} currency={currency} />{" "}
              <span className="text-muted-foreground/70 text-base font-medium">
                {t("spending:budgetChart.forecastLower")}
              </span>
            </div>
            <div className="text-destructive mt-0.5 inline-flex items-center gap-1 text-xs font-semibold tabular-nums">
              <Icons.ArrowUp className="h-3 w-3" />
              <PrivacyAmount value={forecastDelta} currency={currency} />{" "}
              {t("spending:budgetChart.overBudgetLower")}
            </div>
            <div className="text-muted-foreground/80 mt-0.5 text-xs tabular-nums">
              <PrivacyAmount value={remaining} currency={currency} />{" "}
              {t("spending:budgetChart.leftTodayOf")}{" "}
              <PrivacyAmount value={target} currency={currency} />{" "}
              {t("spending:budgetChart.budgetedThisMonth")}
            </div>
          </>
        ) : !isCurrentMonth ? (
          <>
            <div className="text-foreground text-[28px] font-medium leading-tight tabular-nums tracking-tight">
              <PrivacyAmount value={spent} currency={currency} />{" "}
              <span className="text-muted-foreground/70 text-base font-medium">
                {t("spending:budgetChart.spentLower")}
              </span>
            </div>
            <div
              className={cn(
                "mt-0.5 inline-flex items-center gap-1 text-xs font-semibold tabular-nums",
                isOver ? "text-destructive" : "text-success",
              )}
            >
              <PrivacyAmount value={isOver ? overBy : remaining} currency={currency} />{" "}
              {isOver
                ? t("spending:budgetChart.overBudgetLower")
                : t("spending:budgetChart.leftLower")}
            </div>
            <div className="text-muted-foreground/80 mt-0.5 text-xs tabular-nums">
              {t("spending:budgetChart.ofLower")}{" "}
              <PrivacyAmount value={target} currency={currency} />{" "}
              {t("spending:budgetChart.budgetedLower")}
            </div>
          </>
        ) : (
          <>
            <div className="text-foreground text-[28px] font-medium leading-tight tabular-nums tracking-tight">
              <PrivacyAmount value={isOver ? overBy : remaining} currency={currency} />{" "}
              <span className="text-muted-foreground/70 text-base font-medium">
                {isOver ? t("spending:budgetChart.overLower") : t("spending:budgetChart.leftLower")}
              </span>
            </div>
            <div className="text-muted-foreground/80 text-xs tabular-nums">
              {t("spending:budgetChart.ofLower")}{" "}
              <PrivacyAmount value={target} currency={currency} />{" "}
              {t("spending:budgetChart.budgetedThisMonth")}
            </div>
          </>
        )}
      </div>

      <div className={cn("relative mt-4 w-full", fill && "min-h-[110px] flex-1")}>
        <svg
          viewBox={`0 0 ${chartW} ${chartH}`}
          preserveAspectRatio="none"
          className={fill ? "absolute inset-0 block h-full w-full" : "block h-[110px] w-full"}
        >
          {targetPacePath ? (
            <path
              d={targetPacePath}
              fill="none"
              stroke="var(--muted-foreground)"
              strokeOpacity={0.35}
              strokeDasharray="3 4"
              strokeWidth={1.25}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : (
            <line
              x1={paceX1}
              y1={paceY1}
              x2={paceX2}
              y2={paceY2}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.35}
              strokeDasharray="3 4"
              strokeWidth={1.25}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {actualPath && (
            <path
              d={actualPath}
              fill="none"
              stroke={a.lineColor}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {cumulative.length > 0 && (
          // Rendered as HTML rather than an SVG <circle> so it stays round: the
          // SVG uses preserveAspectRatio="none", which would stretch a circle
          // into an ellipse.
          <div
            className="absolute h-[10px] w-[10px] rounded-full bg-[var(--m-surface,white)]"
            style={{
              left: `${pillLeftPctRaw}%`,
              top: `${(endY / chartH) * 100}%`,
              transform: "translate(-50%, -50%)",
              border: `2.5px solid ${a.lineColor}`,
            }}
          />
        )}
      </div>
      <div className="text-muted-foreground mt-1 flex justify-between text-[11px] tabular-nums">
        <span>{t("spending:budgetChart.dayN", { day: 1 })}</span>
        <span className="flex items-center gap-1.5">
          <span className="border-muted-foreground w-3.5 border-t-[1.5px] border-dashed" aria-hidden />
          Usual pace
        </span>
        <span>{t("spending:budgetChart.dayN", { day: daysInMonth })}</span>
      </div>
      </div>
      <div className="flex min-w-0 flex-col gap-2">

      {isCurrentMonth && haveHistory && forecastParts ? (
        // money-hub patch: what the forecast is made of, the owner's way (lib/budget-forecast.ts): the
        // fixed bills paid come off the budget, everything else is forecast against what is left.
        <ForecastSums
          parts={forecastParts}
          sums={sums ?? againstBudget(target, spent, forecastParts, daysRemaining)}
          target={target}
          daysRemaining={daysRemaining}
          currency={currency}
        />
      ) : null}
      {sums ? (
        // money-hub patch: what is left to spend this month once the fixed bills are paid (one verdict:
        // no second forecast number down here). Stretched to the card beside it, it sits at the bottom,
        // level with the chart's day labels.
        <div className={cn("border-border/60 flex items-center justify-between gap-2 rounded-xl border px-3 py-2", fill && "lg:mt-auto")}>
          <span className="flex flex-col">
            <span className="text-muted-foreground text-xs">Left to spend</span>
            <span className="text-muted-foreground text-[11.5px]">
              {sums.fixed > 0 ? "after fixed bills" : "of the budget"}
            </span>
          </span>
          <span className="text-foreground text-lg font-medium tabular-nums">
            <PrivacyAmount value={sums.room - sums.spentOthers} currency={currency} />
          </span>
        </div>
      ) : (
        <div className={cn("border-border/60 flex items-center justify-between gap-2 rounded-xl border px-3 py-2", fill && "lg:mt-auto")}>
          <span className="flex flex-col">
            <span className="text-muted-foreground text-xs">
              {isCurrentMonth
                ? t("spending:budgetChart.forecastUpper")
                : t("spending:budgetChart.result")}
            </span>
            <span className="text-muted-foreground text-[11.5px]">
              {isCurrentMonth
                ? forecastReliable
                  ? haveHistory
                    ? t("spending:budgetChart.vsLast3Months")
                    : t("spending:budgetChart.atCurrentPace")
                  : t("spending:budgetChart.moreDataNeeded")
                : isOver
                  ? t("spending:budgetChart.overBudgetLower")
                  : t("spending:budgetChart.leftLower")}
            </span>
          </span>
          {isCurrentMonth ? (
            <span
              className={cn(
                "text-lg font-medium tabular-nums",
                forecastReliable
                  ? willOverspend
                    ? "text-destructive"
                    : "text-foreground"
                  : "text-muted-foreground/60",
              )}
            >
              {forecastReliable ? <PrivacyAmount value={forecast} currency={currency} /> : "-"}
            </span>
          ) : (
            <span
              className={cn(
                "text-lg font-medium tabular-nums",
                isOver ? "text-destructive" : "text-foreground",
              )}
            >
              <PrivacyAmount value={isOver ? overBy : remaining} currency={currency} />
            </span>
          )}
        </div>
      )}
      </div>
      </div>

      <div className="border-border/60 mt-3 border-t pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-foreground text-[12.5px] font-medium">
            {t("spending:budgetChart.byCategory")}
          </span>
          <BudgetManageLink monthKey={monthKey} />
        </div>
        {rings.length === 0 ? (
          <div className="text-muted-foreground py-2 text-center text-xs">
            {t("spending:budgetBars.noBudgets")}{" "}
            <Link
              to="/settings/spending/setup"
              className="hover:text-foreground underline-offset-4 hover:underline"
            >
              {t("spending:budgetBars.setOne")}
            </Link>
          </div>
        ) : (
          <div className="grid gap-x-1 gap-y-2.5 [grid-template-columns:repeat(auto-fill,minmax(96px,1fr))]">
            {rings.map((r) => (
              <BudgetRing key={r.id} ring={r} currency={currency} activityRange={activityRange} />
            ))}
          </div>
        )}
      </div>
    </DashboardCard>
  );
}

function buildHistoricalPaceCurve(
  byDay: DayBucket[],
  currentDaysInMonth: number,
): { points: PacePoint[]; pctByDay: number[] } | null {
  const months = new Map<
    string,
    { daysInMonth: number; outflowByDay: Map<number, number>; total: number }
  >();

  for (const bucket of byDay) {
    const parsed = parseDayBucketDate(bucket.date);
    if (!parsed) continue;
    const outflow = Number.isFinite(bucket.outflow) ? bucket.outflow : 0;

    const key = `${parsed.year}-${String(parsed.month).padStart(2, "0")}`;
    const month = months.get(key) ?? {
      daysInMonth: new Date(parsed.year, parsed.month, 0).getDate(),
      outflowByDay: new Map<number, number>(),
      total: 0,
    };
    month.outflowByDay.set(parsed.day, (month.outflowByDay.get(parsed.day) ?? 0) + outflow);
    month.total += outflow;
    months.set(key, month);
  }

  const eligibleMonths = Array.from(months.values())
    .filter((month) => month.total > 0)
    .map((month) => {
      const cumulativeByDay = Array.from({ length: month.daysInMonth + 1 }, () => 0);
      let running = 0;
      for (let day = 1; day <= month.daysInMonth; day++) {
        running += month.outflowByDay.get(day) ?? 0;
        cumulativeByDay[day] = Math.max(cumulativeByDay[day - 1], clamp(running, 0, month.total));
      }
      return { ...month, cumulativeByDay };
    });

  if (eligibleMonths.length < MIN_HISTORICAL_PACE_MONTHS) return null;

  const pctByDay = Array.from({ length: currentDaysInMonth + 1 }, () => 0);
  const points: PacePoint[] = [];
  for (let day = 1; day <= currentDaysInMonth; day++) {
    const values = eligibleMonths.map((month) => {
      const historyDay = Math.min(
        month.daysInMonth,
        Math.max(1, Math.ceil((day / currentDaysInMonth) * month.daysInMonth)),
      );
      return clamp(month.cumulativeByDay[historyDay] / month.total, 0, 1);
    });
    const value = median(values);
    pctByDay[day] = value;
    points.push({ day, value });
  }

  return { points, pctByDay };
}

function parseDayBucketDate(date: string): { year: number; month: number; day: number } | null {
  const [yearRaw, monthRaw, dayRaw] = date.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function toSvgPath(
  points: PacePoint[],
  xForDay: (day: number) => number,
  yForVal: (value: number) => number,
): string {
  if (!points.length) return "";
  return (
    "M " +
    points.map((p) => `${xForDay(p.day).toFixed(2)} ${yForVal(p.value).toFixed(2)}`).join(" L ")
  );
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function BudgetCardHeaderActions({
  monthLabel,
  onPreviousMonth,
  onNextMonth,
  canGoNextMonth,
  status,
  dayLabel,
}: {
  monthLabel: string;
  monthKey: string;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  canGoNextMonth: boolean;
  status?: ReactNode;
  dayLabel?: string;
}) {
  const { t } = useTranslation();
  const arrow =
    "border-border flex h-8 w-8 items-center justify-center rounded-full border transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {status}
      {dayLabel ? (
        <span className="text-muted-foreground px-1 text-xs tabular-nums">{dayLabel}</span>
      ) : null}
      <button
        type="button"
        onClick={onPreviousMonth}
        className={arrow}
        aria-label={`${t("spending:budgetChart.previousBudgetMonth")} (${monthLabel})`}
      >
        <Icons.ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onNextMonth}
        disabled={!canGoNextMonth}
        className={arrow}
        aria-label={t("spending:budgetChart.nextBudgetMonth")}
      >
        <Icons.ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** money-hub patch: the month's verdict as a chip in the card's header (Meadow: green when on track,
 *  amber when heading over, red when over). */
function StatusChip({ status, label }: { status: Status; label: string }) {
  const tone =
    status === "ok"
      ? "bg-[var(--m-mint,#e3f1da)] text-[var(--m-mint-ink,#1d4d1f)]"
      : status === "warn"
        ? "bg-[var(--m-warn-soft,#fbe9d2)] text-[var(--m-warn,#7a4300)]"
        : "bg-[var(--m-warn-soft,#fbe9d2)] text-[var(--m-bad,#a8321f)]";
  return <span className={cn("rounded-full px-2.5 py-0.5 text-xs", tone)}>{label}</span>;
}

const BudgetManageLink = ({ monthKey }: { monthKey: string }) => {
  const { t } = useTranslation();
  return (
    <Link
      to={`/spending/budget?month=${monthKey}`}
      className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
    >
      {t("spending:budgetChart.manage")}
    </Link>
  );
};

function BudgetRing({
  ring,
  currency,
  activityRange,
}: {
  ring: {
    categoryId: string;
    name: string;
    color: string | null;
    icon: string | null;
    target: number;
    spent: number;
    pct: number;
  };
  currency: string;
  activityRange: { from: string; to: string };
}) {
  const formatting = useAmountFormatting();
  const { t } = useTranslation();
  const { isBalanceHidden } = useBalancePrivacy();
  const isOver = ring.spent > ring.target;
  const close = !isOver && ring.pct >= 0.95;
  const remaining = ring.target - ring.spent;
  // Meadow: forest while there is room, amber from 95%, red past the budget.
  const ringColor = isOver
    ? "var(--m-bad, var(--destructive))"
    : close
      ? "var(--m-warn-line, #C28B47)"
      : "var(--m-forest, var(--success))";
  const displayAmount = Math.abs(isOver ? ring.spent - ring.target : remaining);

  const size = 42;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fillPct = Math.min(1, ring.pct);
  const dash = `${c * fillPct} ${c}`;

  return (
    <Link
      to={`/activities?tab=spending&category=${encodeURIComponent(ring.categoryId)}&from=${
        activityRange.from
      }&to=${activityRange.to}`}
      className="hover:bg-muted/40 flex min-w-0 flex-col items-center gap-0.5 rounded-md px-1 py-1 text-center transition-colors"
      title={`${ring.name}: ${ring.spent.toFixed(2)} / ${ring.target.toFixed(2)}`}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--m-track, var(--muted))"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={ringColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={dash}
          />
        </svg>
        <div className="text-foreground absolute inset-0 flex items-center justify-center text-[10px] tabular-nums">
          {Math.round(ring.pct * 100)}%
        </div>
      </div>
      <div className="text-foreground w-full truncate text-[11.5px] leading-tight">{ring.name}</div>
      <div
        className={cn(
          "text-[11px] tabular-nums",
          isOver ? "text-destructive" : close ? "text-[var(--m-warn,#7a4300)]" : "text-muted-foreground",
        )}
      >
        {isBalanceHidden ? "••••" : formatting.formatCompactAmount(displayAmount, currency)}{" "}
        {isOver ? t("spending:budgetChart.overLower") : t("spending:budgetChart.leftLower")}
      </div>
    </Link>
  );
}

/** money-hub patch: the forecast in plain sums, under the chart. */
function ForecastSums({
  parts,
  sums,
  target,
  daysRemaining,
  currency,
}: {
  parts: ForecastParts;
  sums: ReturnType<typeof againstBudget>;
  target: number;
  daysRemaining: number;
  currency: string;
}) {
  const line = "flex items-baseline justify-between gap-2";
  return (
    <div className="text-muted-foreground space-y-1 rounded-[14px] bg-[var(--m-sand,var(--muted))] px-3 py-2.5 text-[12.5px] tabular-nums leading-snug">
      {sums.fixed > 0 ? (
        <>
          <div className={line}>
            <span className="min-w-0 truncate">Budget</span>
            <PrivacyAmount value={target} currency={currency} />
          </div>
          <div className={line}>
            <span className="min-w-0 truncate">Fixed: {parts.fixedNames.join(", ")}</span>
            <span className="shrink-0">
              - <PrivacyAmount value={sums.fixed} currency={currency} />
            </span>
          </div>
          <div className={`${line} text-foreground font-medium`}>
            <span>Left for everything else</span>
            <PrivacyAmount value={sums.room} currency={currency} />
          </div>
        </>
      ) : null}
      <div className={`${line} text-foreground border-border/60 border-t pt-1 font-medium`}>
        <span className="min-w-0 truncate">
          {sums.fixed > 0 ? "Everything else, forecast" : "Forecast"}
        </span>
        <PrivacyAmount value={sums.others} currency={currency} />
      </div>
      <div className="text-muted-foreground pt-0.5 text-xs">
        Made of <PrivacyAmount value={sums.spentOthers} currency={currency} /> spent so far
        {sums.fixed > 0 ? " besides fixed bills" : ""},{" "}
        <PrivacyAmount value={parts.billsLeftTotal} currency={currency} /> in{" "}
        {parts.billsLeft.length} {parts.billsLeft.length === 1 ? "bill" : "bills"} still due, and{" "}
        <PrivacyAmount value={parts.everydayDaily} currency={currency} /> a day of everyday spending
        for the {daysRemaining} {daysRemaining === 1 ? "day" : "days"} left
        {parts.cappedDays > 0 ? (
          <>
            {" "}
            (your usual days of the last 3 months; {parts.cappedDays} one-off big{" "}
            {parts.cappedDays === 1 ? "day counts" : "days count"} as{" "}
            <PrivacyAmount value={parts.everydayCap} currency={currency} />)
          </>
        ) : null}
        .
      </div>
    </div>
  );
}
