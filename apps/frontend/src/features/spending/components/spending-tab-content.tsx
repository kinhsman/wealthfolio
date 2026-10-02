import { useCallback, useEffect, useMemo, useRef, useState, type FC } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ResponsiveContainer, Tooltip, Treemap } from "recharts";

import { DashboardCard } from "@/components/dashboard-card";
import { useAccounts } from "@/hooks/use-accounts";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { useTaxonomy } from "@/hooks/use-taxonomies";
import { useSettingsContext } from "@/lib/settings-provider";
import type { DateRange, TaxonomyCategory } from "@/lib/types";
import { cn, formatDateISO } from "@/lib/utils";

import {
  Icons,
  PrivacyAmount,
  Skeleton,
  useAmountFormatting,
  type FormattingApi,
  useDateFormatting,
  useNumberFormatting,
} from "@wealthfolio/ui";
import { usePersistentState } from "@/hooks/use-persistent-state";

import { useBudget } from "../hooks/use-budget";
import { useCashActivities, useUncategorizedCount } from "../hooks/use-cash-activities";
import { useCategorizationRules } from "../hooks/use-categorization-rules";
import { useSpendingReport } from "../hooks/use-spending-report";
import { useSpendingSettings } from "../hooks/use-spending-settings";
import { SAVINGS_ROW_COLOR, SAVINGS_ROW_ID, buildWhereItWentRows } from "../lib/category-rollup";
import {
  SPENDING_RANGE_FROM_PARAM,
  SPENDING_RANGE_TO_PARAM,
  spendingRangeFromParams,
  type SpendingDateRange,
} from "../lib/date-range-params";
import {
  SPENDING_MONTH_PARAM,
  SPENDING_MONTH_STORAGE_KEY,
  addMonthsToMonthKey,
  localDateFromParts,
  monthKeyFromParts,
  monthLabel,
  monthRange,
  parseMonthKey,
} from "../lib/month-period";
import { spendingActivityHref } from "../lib/navigation";
import {
  DASHBOARD_PERIOD_UPDATED_AT_STORAGE_KEY,
  INSIGHTS_PERIOD_STORAGE_KEY,
  INSIGHTS_PERIOD_UPDATED_AT_STORAGE_KEY,
  normalizeReportsPeriod,
  periodPreferenceTimestamp,
  shouldPreferDashboardPeriod,
} from "../lib/period-preferences";
import type { ReportsPeriod } from "../lib/reports-period";
import { FOREST_THEME, type Palette } from "../lib/theme";
import {
  addCalendarDays,
  addCalendarMonths,
  calendarDaysBetweenInclusive,
  daysInCalendarMonth,
  formatZonedDateKey,
  getZonedDateParts,
  localDateBoundaryToISOString,
  localDateParts,
  zonedCalendarDateBoundaryToDate,
} from "../lib/timezone";
import { BudgetLineChartCard } from "./budget-line-chart-card";
import { CashCardsCard } from "./cash-cards-card";
import { EventsCard } from "./events-card";
import { RecentActivityCard } from "./recent-activity-card";
import { SubscriptionsCard } from "./subscriptions-card";
import { useSubscriptions } from "../lib/subscriptions";
import { forecastParts } from "../lib/budget-forecast";
import { ReturnsCard } from "./returns-card";
import { SpendingByPeriodCard } from "./spending-by-period-card";
import { SpendingPeriodSelector } from "./spending-period-toggle";
import { CategoryMark } from "./category-chips";
import { PhoneFold } from "./phone-fold";
import { useDashboardSkins } from "../lib/dashboard-skin";

const SPENDING_TAXONOMY = "spending_categories";
type SpendingDashboardPeriod = "MTD" | "LAST_MONTH" | "3M" | "6M" | "YTD" | "1Y";

type SpendingSelection =
  | { kind: "period"; code: SpendingDashboardPeriod }
  | { kind: "month"; monthKey: string; restoreCode: SpendingDashboardPeriod }
  | { kind: "range"; range: SpendingDateRange; restoreCode: SpendingDashboardPeriod };

const SPENDING_DASHBOARD_PERIODS: SpendingDashboardPeriod[] = [
  "MTD",
  "LAST_MONTH",
  "3M",
  "6M",
  "YTD",
  "1Y",
];

const DEFAULT_INTERVAL: SpendingDashboardPeriod = "MTD";
const INTERVAL_STORAGE_KEY = "spending-interval";
const INTERVAL_DESCRIPTIONS: Record<SpendingDashboardPeriod, string> = {
  MTD: "spending:tabContent.intervalMtd",
  LAST_MONTH: "spending:tabContent.intervalLastMonth",
  "3M": "spending:tabContent.interval3M",
  "6M": "spending:tabContent.interval6M",
  YTD: "spending:tabContent.intervalYtd",
  "1Y": "spending:tabContent.interval1Y",
};

// The three insights stages, surfaced as a "Dig deeper" strip under Recent
// activity. Mirrors the StageNav on /spending/insights.
const INSIGHT_STAGES = [
  {
    stage: "where",
    labelKey: "spending:tabContent.stageWhereLabel",
    subKey: "spending:tabContent.stageWhereSub",
    Icon: Icons.PieChart,
  },
  {
    stage: "changed",
    labelKey: "spending:tabContent.stageChangedLabel",
    subKey: "spending:tabContent.stageChangedSub",
    Icon: Icons.TrendingUp,
  },
  {
    stage: "when",
    labelKey: "spending:tabContent.stageWhenLabel",
    subKey: "spending:tabContent.stageWhenSub",
    Icon: Icons.Calendar,
  },
] as const;

function rangeToReportRequest(range: DateRange | undefined, timezone?: string | null) {
  const from = range?.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = range?.to ?? new Date();
  return {
    startDate: localDateBoundaryToISOString(from, "start", timezone),
    endDate: localDateBoundaryToISOString(to, "end", timezone),
  };
}

function isSpendingDashboardPeriod(
  value: string | null | undefined,
): value is SpendingDashboardPeriod {
  return SPENDING_DASHBOARD_PERIODS.includes(value as SpendingDashboardPeriod);
}

function normalizeSpendingDashboardPeriod(
  value: string | null | undefined,
): SpendingDashboardPeriod {
  if (isSpendingDashboardPeriod(value)) return value;
  if (value === "5Y" || value === "ALL") return "1Y";
  return DEFAULT_INTERVAL;
}

function spendingIntervalData(code: SpendingDashboardPeriod, timezone?: string | null) {
  const today = getZonedDateParts(new Date(), timezone);
  const { start, end } = (() => {
    switch (code) {
      case "MTD":
        return { start: { year: today.year, month: today.month, day: 1 }, end: today };
      case "LAST_MONTH": {
        const lastMonth = addCalendarMonths({ year: today.year, month: today.month, day: 1 }, -1);
        return {
          start: { year: lastMonth.year, month: lastMonth.month, day: 1 },
          end: {
            year: lastMonth.year,
            month: lastMonth.month,
            day: daysInCalendarMonth(lastMonth.year, lastMonth.month),
          },
        };
      }
      case "3M":
        return { start: addCalendarMonths(today, -3), end: today };
      case "6M":
        return { start: addCalendarMonths(today, -6), end: today };
      case "YTD":
        return { start: { year: today.year, month: 1, day: 1 }, end: today };
      case "1Y":
        return { start: { ...today, year: today.year - 1 }, end: today };
    }
  })();

  return {
    code,
    description: INTERVAL_DESCRIPTIONS[code],
    range: {
      from: localDateFromParts(start),
      to: localDateFromParts(end),
    },
  };
}

function insightPeriodForDashboardInterval(code: SpendingDashboardPeriod): ReportsPeriod {
  if (code === "LAST_MONTH") return "LAST_MONTH";
  return code;
}

function selectionFromParams(
  params: URLSearchParams,
  persistedInterval: string,
  persistedMonth: string | null,
): SpendingSelection {
  const intervalParam = params.get("spendingInterval");
  const monthParam = params.get(SPENDING_MONTH_PARAM);
  const restoreCode = normalizeSpendingDashboardPeriod(intervalParam ?? persistedInterval);
  const customRange = spendingRangeFromParams(params);
  if (customRange) return { kind: "range", range: customRange, restoreCode };
  const monthKey = monthParam ?? (intervalParam === null ? persistedMonth : null);
  if (monthKey && parseMonthKey(monthKey)) return { kind: "month", monthKey, restoreCode };
  return { kind: "period", code: restoreCode };
}

function budgetMonthStateForSelection(
  selection: SpendingSelection,
  currentMonthKey: string,
): { monthKey: string; touched: boolean } {
  if (selection.kind === "period" && selection.code === "LAST_MONTH") {
    return { monthKey: addMonthsToMonthKey(currentMonthKey, -1), touched: true };
  }
  if (selection.kind === "month" && selection.monthKey <= currentMonthKey) {
    return { monthKey: selection.monthKey, touched: true };
  }
  return { monthKey: currentMonthKey, touched: false };
}

function budgetSelectionSyncKey(selection: SpendingSelection, currentMonthKey: string): string {
  if (selection.kind === "month") return `month:${selection.monthKey}`;
  if (selection.kind === "range") {
    return `range:${formatDateISO(selection.range.from)}:${formatDateISO(selection.range.to)}`;
  }
  if (selection.code === "LAST_MONTH") return `period:${selection.code}:${currentMonthKey}`;
  return `period:${selection.code}`;
}

function selectionData(
  selection: SpendingSelection,
  formatting: Pick<FormattingApi, "formatCalendarDate">,
  timezone?: string | null,
) {
  if (selection.kind === "month") {
    return {
      range: monthRange(selection.monthKey),
      description: monthLabel(selection.monthKey, formatting),
      insightPeriod: "LAST_MONTH" as ReportsPeriod,
    };
  }

  if (selection.kind === "range") {
    const { from, to } = selection.range;
    const format = (date: Date) =>
      formatting.formatCalendarDate(localDateParts(date), {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    return {
      range: selection.range,
      description: `${format(from)} – ${format(to)}`,
      insightPeriod: selection.restoreCode,
    };
  }

  const interval = spendingIntervalData(selection.code, timezone);
  return {
    range: interval.range,
    description: interval.description,
    insightPeriod: insightPeriodForDashboardInterval(selection.code),
  };
}

function previousFullMonthRange(range: DateRange): DateRange | undefined {
  if (!range.from) return undefined;
  const start = localDateParts(range.from);
  const priorMonth = addCalendarMonths({ year: start.year, month: start.month, day: 1 }, -1);
  return monthRange(monthKeyFromParts(priorMonth));
}

function usesCalendarMonthComparison(selection: SpendingSelection) {
  return (
    selection.kind === "month" || (selection.kind === "period" && selection.code === "LAST_MONTH")
  );
}

function priorRange(
  range: DateRange | undefined,
  selection?: SpendingSelection,
): DateRange | undefined {
  if (!range?.from || !range?.to) return undefined;
  if (selection && usesCalendarMonthComparison(selection)) {
    return previousFullMonthRange(range);
  }
  const start = localDateParts(range.from);
  const end = localDateParts(range.to);
  const days = calendarDaysBetweenInclusive(start, end);
  if (days <= 0) return undefined;
  const priorEnd = addCalendarDays(start, -1);
  const priorStart = addCalendarDays(priorEnd, -(days - 1));
  return {
    from: localDateFromParts(priorStart),
    to: localDateFromParts(priorEnd),
  };
}

/**
 * Map a spending-chart bar `key` to the [from, to] date range it covers, so a
 * bar click can deep-link into the Transactions list for that period. The key
 * shape depends on granularity (see the barData builder): `YYYY-MM-DD` for the
 * day/week start, `YYYY-MM` for a month.
 */
function barKeyToRange(
  key: string,
  granularity: "day" | "week" | "month",
): { from: string; to: string } {
  if (granularity === "day") return { from: key, to: key };
  if (granularity === "week") {
    const [y, m, d] = key.split("-").map(Number);
    return { from: key, to: formatDateISO(new Date(y, m - 1, d + 6)) };
  }
  const [y, m] = key.split("-").map(Number);
  // Day 0 of the next month resolves to the last day of this month.
  const lastDay = new Date(y, m, 0).getDate();
  return { from: `${key}-01`, to: `${key}-${String(lastDay).padStart(2, "0")}` };
}

export default function SpendingTabContent() {
  // money-hub patch: the dashboard's theme for each mode, Meadow or Bronze Titanium (Settings, Appearance).
  const skins = useDashboardSkins();
  const dateFormatting = useDateFormatting();
  const formatting = useAmountFormatting();
  const { t } = useTranslation();
  const { isBalanceHidden } = useBalancePrivacy();
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "USD";
  const appTimezone = settings?.timezone ?? undefined;
  const navigate = useNavigate();
  const {
    accountIds: spendingAccountIds,
    excludedCategoryIds,
    isLoading: spendingSettingsLoading,
  } = useSpendingSettings();

  const [searchParams, setSearchParams] = useSearchParams();
  // URL-driven so `/dashboard?tab=spending&spendingInterval=3M` is shareable
  // and survives reload. Falls back to the persisted preference, then to
  // DEFAULT_INTERVAL. The "spendingInterval" prefix avoids colliding with
  // other dashboard tabs that may want their own `?interval`.
  const [persistedInterval, setPersistedInterval] = usePersistentState<string>(
    INTERVAL_STORAGE_KEY,
    DEFAULT_INTERVAL,
  );
  const [persistedMonth, setPersistedMonth] = usePersistentState<string | null>(
    SPENDING_MONTH_STORAGE_KEY,
    null,
  );
  const [persistedInsightPeriod] = usePersistentState<string | null>(
    INSIGHTS_PERIOD_STORAGE_KEY,
    null,
  );
  const [insightPeriodUpdatedAt] = usePersistentState<string>(
    INSIGHTS_PERIOD_UPDATED_AT_STORAGE_KEY,
    "0",
  );
  const [dashboardPeriodUpdatedAt, setDashboardPeriodUpdatedAt] = usePersistentState<string>(
    DASHBOARD_PERIOD_UPDATED_AT_STORAGE_KEY,
    "0",
  );
  const selection = useMemo(
    () => selectionFromParams(searchParams, persistedInterval, persistedMonth),
    [searchParams, persistedInterval, persistedMonth],
  );
  const selectedPeriod = selection.kind === "period" ? selection.code : null;
  const customMonth = selection.kind === "month" ? selection.monthKey : null;
  const customRange = selection.kind === "range" ? selection.range : undefined;
  const restoreCode = selection.kind === "period" ? selection.code : selection.restoreCode;
  const {
    range: dateRange,
    description: selectedIntervalDescription,
    insightPeriod,
  } = useMemo(
    () => selectionData(selection, dateFormatting, appTimezone),
    [selection, dateFormatting, appTimezone],
  );
  const theme: Palette = FOREST_THEME;

  const [whereItWentView, setWhereItWentView] = usePersistentState<"list" | "map">(
    "spending-where-view",
    "list",
  );

  const reportReq = useMemo(
    () => rangeToReportRequest(dateRange, appTimezone),
    [dateRange, appTimezone],
  );
  // `priorRange` returns undefined for invalid / zero-span ranges; in that
  // case feeding it back through `rangeToReportRequest` produces the
  // current-month default, which would make priorReport identical to
  // currentReport (priorSpending == totalSpending) and surface a misleading
  // "About the same as prior period" delta line. Track whether we actually
  // have a prior window and gate the query on it.
  const priorRangeForReport = useMemo(
    () => priorRange(dateRange, selection),
    [dateRange, selection],
  );
  const priorReportReq = useMemo(
    () =>
      priorRangeForReport ? rangeToReportRequest(priorRangeForReport, appTimezone) : reportReq,
    [priorRangeForReport, reportReq, appTimezone],
  );

  const {
    data: report,
    isLoading,
    isError: reportErrored,
    refetch: refetchReport,
  } = useSpendingReport(reportReq);
  const { data: priorReport, isLoading: isPriorLoading } = useSpendingReport(
    priorReportReq,
    /* enabled */ priorRangeForReport !== undefined,
  );
  const { data: activities = [], isError: activitiesErrored } = useCashActivities({
    startDate: reportReq.startDate,
    endDate: reportReq.endDate,
  });
  const taxonomy = useTaxonomy(SPENDING_TAXONOMY);
  // Hint count: only excluded ids that still exist in the taxonomy (stale ids
  // keep filtering backend-side but shouldn't inflate the hint).
  const excludedCategoryCount = useMemo(() => {
    if (excludedCategoryIds.length === 0) return 0;
    const liveIds = new Set((taxonomy.data?.categories ?? []).map((c) => c.id));
    return excludedCategoryIds.filter((id) => liveIds.has(id)).length;
  }, [excludedCategoryIds, taxonomy.data?.categories]);
  const { data: budget, isError: budgetErrored } = useBudget();
  const todayParts = useMemo(() => getZonedDateParts(new Date(), appTimezone), [appTimezone]);
  const currentBudgetMonthKey = useMemo(() => monthKeyFromParts(todayParts), [todayParts]);
  const budgetSyncKey = useMemo(
    () => budgetSelectionSyncKey(selection, currentBudgetMonthKey),
    [selection, currentBudgetMonthKey],
  );
  const lastBudgetSyncKey = useRef(budgetSyncKey);
  const [budgetMonthKey, setBudgetMonthKey] = useState(() => {
    return budgetMonthStateForSelection(selection, currentBudgetMonthKey).monthKey;
  });
  const [budgetMonthTouched, setBudgetMonthTouched] = useState(() => {
    return budgetMonthStateForSelection(selection, currentBudgetMonthKey).touched;
  });
  useEffect(() => {
    if (lastBudgetSyncKey.current === budgetSyncKey) return;
    lastBudgetSyncKey.current = budgetSyncKey;
    const next = budgetMonthStateForSelection(selection, currentBudgetMonthKey);
    setBudgetMonthKey(next.monthKey);
    setBudgetMonthTouched(next.touched);
  }, [budgetSyncKey, currentBudgetMonthKey, selection]);
  useEffect(() => {
    setBudgetMonthKey((monthKey) => {
      if (!budgetMonthTouched) return currentBudgetMonthKey;
      return monthKey > currentBudgetMonthKey ? currentBudgetMonthKey : monthKey;
    });
  }, [budgetMonthTouched, currentBudgetMonthKey]);
  const { data: budgetCardBudget, isError: budgetCardBudgetErrored } = useBudget(budgetMonthKey);
  const { accounts = [] } = useAccounts({ filterActive: false });
  const { data: categorizationRules = [], isLoading: categorizationRulesLoading } =
    useCategorizationRules();
  const { data: uncategorizedCount = 0 } = useUncategorizedCount(
    reportReq.startDate,
    reportReq.endDate,
  );
  // Aggregated error state for the headline banner. Activities / budget
  // failures degrade more silently than report (their absence shows up as
  // a flat treemap or hidden chips), but the user deserves a signal.
  const dataErrored =
    reportErrored || activitiesErrored || budgetErrored || budgetCardBudgetErrored;
  const hasNoIncludedAccounts = !spendingSettingsLoading && spendingAccountIds.length === 0;

  const budgetMonthRange = useMemo(() => {
    const month = parseMonthKey(budgetMonthKey) ?? todayParts;
    const start = { year: month.year, month: month.month, day: 1 };
    const end =
      budgetMonthKey === currentBudgetMonthKey
        ? todayParts
        : { ...month, day: daysInCalendarMonth(month.year, month.month) };
    return { from: localDateFromParts(start), to: localDateFromParts(end) };
  }, [budgetMonthKey, currentBudgetMonthKey, todayParts]);
  const monthReportReq = useMemo(
    () => rangeToReportRequest(budgetMonthRange, appTimezone),
    [budgetMonthRange, appTimezone],
  );
  const { data: monthReport } = useSpendingReport(monthReportReq);
  const budgetMonthActivityRange = useMemo(
    () => ({
      from: formatDateISO(budgetMonthRange.from),
      to: formatDateISO(budgetMonthRange.to),
    }),
    [budgetMonthRange],
  );
  const shiftBudgetMonth = (months: number) => {
    setBudgetMonthTouched(true);
    setBudgetMonthKey((monthKey) => {
      const next = addMonthsToMonthKey(monthKey, months);
      return next > currentBudgetMonthKey ? currentBudgetMonthKey : next;
    });
  };

  const historyReportReq = useMemo(() => {
    const month = parseMonthKey(budgetMonthKey) ?? todayParts;
    const monthStart = { year: month.year, month: month.month, day: 1 };
    const historyStart = addCalendarMonths(monthStart, -3);
    const historyEndMonth = addCalendarMonths(monthStart, -1);
    const historyEnd = {
      ...historyEndMonth,
      day: daysInCalendarMonth(historyEndMonth.year, historyEndMonth.month),
    };
    return {
      startDate: zonedCalendarDateBoundaryToDate(historyStart, "start", appTimezone).toISOString(),
      endDate: zonedCalendarDateBoundaryToDate(historyEnd, "end", appTimezone).toISOString(),
    };
  }, [budgetMonthKey, appTimezone, todayParts]);
  const { data: historyReport } = useSpendingReport(historyReportReq);

  const historicalDailyAvg = useMemo(() => {
    const total = historyReport?.current.outflow ?? 0;
    if (total <= 0) return 0;
    const month = parseMonthKey(budgetMonthKey) ?? todayParts;
    const monthStart = { year: month.year, month: month.month, day: 1 };
    const start = addCalendarMonths(monthStart, -3);
    const endMonth = addCalendarMonths(monthStart, -1);
    const end = { ...endMonth, day: daysInCalendarMonth(endMonth.year, endMonth.month) };
    const days = Math.max(1, calendarDaysBetweenInclusive(start, end));
    return total / days;
  }, [historyReport, budgetMonthKey, todayParts]);

  // money-hub patch: the budget forecast with the bills apart (lib/budget-forecast.ts): the 3 months'
  // average less their bills is the everyday day; the bills still due this month come by date.
  const { data: subscriptionsView, isPending: subscriptionsPending } = useSubscriptions();
  const budgetForecastParts = useMemo(() => {
    if (!subscriptionsView || !historyReport) return null;
    const month = parseMonthKey(budgetMonthKey) ?? todayParts;
    const monthStart = { year: month.year, month: month.month, day: 1 };
    const monthEnd = { ...monthStart, day: daysInCalendarMonth(month.year, month.month) };
    const histStart = addCalendarMonths(monthStart, -3);
    const histEndMonth = addCalendarMonths(monthStart, -1);
    const histEnd = { ...histEndMonth, day: daysInCalendarMonth(histEndMonth.year, histEndMonth.month) };
    const iso = (d: { year: number; month: number; day: number }) =>
      `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
    return forecastParts(subscriptionsView.items, {
      monthStart: iso(monthStart),
      monthEnd: iso(monthEnd),
      histStart: iso(histStart),
      histEnd: iso(histEnd),
      historyOutflow: historyReport.current.outflow ?? 0,
      historyDays: Math.max(1, calendarDaysBetweenInclusive(histStart, histEnd)),
      historyByDay: historyReport.byDay ?? [],
    });
  }, [subscriptionsView, historyReport, budgetMonthKey, todayParts]);

  // Always render in the user's base currency. The backend FX-converts every
  // activity in `report` to base at period end, so labeling by the first
  // activity's currency (the pre-FX behavior) would mislabel multi-currency
  // accounts. Single-currency users see the same number either way.
  const currency = baseCurrency;
  const dashboardInsightHref = useMemo(() => {
    const preferDashboardPeriod =
      selection.kind === "range" ||
      shouldPreferDashboardPeriod({
        persistedInsightPeriod,
        dashboardUpdatedAt: dashboardPeriodUpdatedAt,
        insightUpdatedAt: insightPeriodUpdatedAt,
      });
    const linkPeriod = preferDashboardPeriod
      ? insightPeriod
      : (normalizeReportsPeriod(persistedInsightPeriod) ?? insightPeriod);
    const monthParams =
      preferDashboardPeriod && selection.kind === "month"
        ? `&${SPENDING_MONTH_PARAM}=${selection.monthKey}`
        : "";
    const rangeParams =
      selection.kind === "range"
        ? `&${SPENDING_RANGE_FROM_PARAM}=${formatDateISO(selection.range.from)}&${SPENDING_RANGE_TO_PARAM}=${formatDateISO(selection.range.to)}`
        : "";
    const href = (stage: (typeof INSIGHT_STAGES)[number]["stage"], hash = "") =>
      `/spending/insights?stage=${stage}&period=${linkPeriod}${monthParams}${rangeParams}${hash}`;
    const cashflow = href("where", "#cashflow");
    return {
      where: href("where"),
      changed: href("changed"),
      when: href("when"),
      cashflow,
    };
  }, [
    dashboardPeriodUpdatedAt,
    insightPeriod,
    insightPeriodUpdatedAt,
    persistedInsightPeriod,
    selection,
  ]);
  // "Where it went" deep-links carry the selected period (interval or month)
  // so the activities spending tab opens pre-filtered to the same range.
  const activityHrefFor = useCallback(
    (id: string) =>
      spendingActivityHref(id, {
        savingsHref: dashboardInsightHref.cashflow,
        startDate: dateRange?.from ? formatDateISO(dateRange.from) : undefined,
        endDate: dateRange?.to ? formatDateISO(dateRange.to) : undefined,
      }),
    [dashboardInsightHref.cashflow, dateRange],
  );
  const accountTypeById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.accountType])),
    [accounts],
  );
  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);

  const totalSpending = report?.current.outflow ?? 0;
  const totalSaved = report?.current.saved ?? 0;
  const priorSpending = priorReport?.current.outflow ?? 0;
  const delta = totalSpending - priorSpending;
  // `deltaPct` is a RATIO (0.2 == 20%) used for thresholds; convert to
  // percentage on render. `displayDeltaPct` is the same ratio but null'd out
  // when prior is too small to make the percentage meaningful — that gating
  // is only for *display*, not for fact-detection (e.g. "spending doubled"
  // is interesting even when prior was $50 — the insight should still fire,
  // even if we choose not to render the eye-popping % delta).
  const deltaPct = priorSpending > 0 ? delta / priorSpending : 0;
  const priorIsMeaningful = priorSpending >= Math.max(100, totalSpending * 0.02);
  const displayDeltaPct = priorIsMeaningful ? deltaPct : null;
  const maxPickerMonth = useMemo(
    () => addMonthsToMonthKey(currentBudgetMonthKey, -1),
    [currentBudgetMonthKey],
  );

  const handleIntervalSelect = (code: SpendingDashboardPeriod) => {
    setPersistedInterval(code);
    setPersistedMonth(null);
    setDashboardPeriodUpdatedAt(periodPreferenceTimestamp());
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("spendingInterval", code);
        p.delete(SPENDING_MONTH_PARAM);
        p.delete(SPENDING_RANGE_FROM_PARAM);
        p.delete(SPENDING_RANGE_TO_PARAM);
        return p;
      },
      { replace: true },
    );
    if (code === "LAST_MONTH") {
      setBudgetMonthKey(addMonthsToMonthKey(currentBudgetMonthKey, -1));
      setBudgetMonthTouched(true);
    } else {
      setBudgetMonthKey(currentBudgetMonthKey);
      setBudgetMonthTouched(false);
    }
  };

  const handleCustomMonthSelect = (monthKey: string | null) => {
    setPersistedMonth(monthKey);
    setDashboardPeriodUpdatedAt(periodPreferenceTimestamp());
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (monthKey) {
          p.set("spendingInterval", restoreCode);
          p.set(SPENDING_MONTH_PARAM, monthKey);
          p.delete(SPENDING_RANGE_FROM_PARAM);
          p.delete(SPENDING_RANGE_TO_PARAM);
        } else {
          p.set("spendingInterval", restoreCode);
          p.delete(SPENDING_MONTH_PARAM);
        }
        return p;
      },
      { replace: true },
    );
    if (monthKey && monthKey <= currentBudgetMonthKey) {
      setBudgetMonthKey(monthKey);
      setBudgetMonthTouched(true);
    } else {
      setBudgetMonthKey(currentBudgetMonthKey);
      setBudgetMonthTouched(false);
    }
  };

  const handleCustomRangeSelect = (range: DateRange | undefined) => {
    if (range && (!range.from || !range.to)) return;
    setPersistedMonth(null);
    setDashboardPeriodUpdatedAt(periodPreferenceTimestamp());
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("spendingInterval", restoreCode);
        p.delete(SPENDING_MONTH_PARAM);
        if (range?.from && range.to) {
          p.set(SPENDING_RANGE_FROM_PARAM, formatDateISO(range.from));
          p.set(SPENDING_RANGE_TO_PARAM, formatDateISO(range.to));
        } else {
          p.delete(SPENDING_RANGE_FROM_PARAM);
          p.delete(SPENDING_RANGE_TO_PARAM);
        }
        return p;
      },
      { replace: true },
    );
    setBudgetMonthKey(currentBudgetMonthKey);
    setBudgetMonthTouched(false);
  };

  const granularity: "day" | "week" | "month" = useMemo(() => {
    if (selection.kind === "month") return "day";
    if (selection.kind === "range") {
      const days = calendarDaysBetweenInclusive(
        localDateParts(selection.range.from),
        localDateParts(selection.range.to),
      );
      return days <= 45 ? "day" : days <= 180 ? "week" : "month";
    }
    switch (selection.code) {
      case "MTD":
      case "LAST_MONTH":
        return "day";
      case "3M":
      case "6M":
        return "week";
      default:
        return "month";
    }
  }, [selection]);

  const { barData, avgValue, avgLabel } = useMemo(() => {
    const buckets = report?.byDay ?? [];
    if (buckets.length === 0)
      return { barData: [], avgValue: 0, avgLabel: t("spending:tabContent.avg") };
    const sorted = buckets.slice().sort((a, b) => a.date.localeCompare(b.date));
    const todayParts = getZonedDateParts(new Date(), appTimezone);
    const todayKey = formatZonedDateKey(new Date(), appTimezone);
    const monthLabels = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const groups = new Map<
      string,
      { key: string; label: string; sortKey: string; value: number; future: boolean }
    >();
    for (const b of sorted) {
      const [yStr, mStr, dStr] = b.date.split("-");
      const year = parseInt(yStr, 10);
      const month = parseInt(mStr, 10);
      const day = parseInt(dStr, 10);
      const date = new Date(year, month - 1, day);

      let key: string;
      let label: string;
      let sortKey: string;
      if (granularity === "day") {
        key = b.date;
        label = day === 1 ? `${monthLabels[month - 1]} 1` : String(day);
        sortKey = b.date;
      } else if (granularity === "week") {
        const weekday = (date.getDay() + 6) % 7;
        const monday = new Date(date);
        monday.setDate(date.getDate() - weekday);
        key = formatDateISO(monday);
        label = `${monthLabels[monday.getMonth()]} ${monday.getDate()}`;
        sortKey = key;
      } else {
        key = `${year}-${mStr}`;
        label =
          year !== todayParts.year
            ? `${monthLabels[month - 1]} '${String(year).slice(2)}`
            : monthLabels[month - 1];
        sortKey = `${yStr}-${mStr}`;
      }

      const future = b.date > todayKey;
      const e =
        groups.get(key) ??
        ({ key, label, sortKey, value: 0, future } as {
          key: string;
          label: string;
          sortKey: string;
          value: number;
          future: boolean;
        });
      e.value += b.outflow;
      if (!future) e.future = false;
      groups.set(key, e);
    }
    let data = Array.from(groups.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    if (granularity === "day" && dateRange?.from && dateRange?.to) {
      const padded = new Map(data.map((d) => [d.key, d]));
      const cursor = new Date(
        dateRange.from.getFullYear(),
        dateRange.from.getMonth(),
        dateRange.from.getDate(),
      );
      const end = new Date(
        dateRange.to.getFullYear(),
        dateRange.to.getMonth(),
        dateRange.to.getDate(),
      );
      while (cursor <= end) {
        const key = formatDateISO(cursor);
        if (!padded.has(key)) {
          const day = cursor.getDate();
          const month = cursor.getMonth();
          padded.set(key, {
            key,
            label: day === 1 ? `${monthLabels[month]} 1` : String(day),
            sortKey: key,
            value: 0,
            future: key > todayKey,
          });
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      data = Array.from(padded.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    }

    const observed = data.filter((d) => d.value > 0);
    const avg =
      observed.length > 0 ? observed.reduce((s, d) => s + d.value, 0) / observed.length : 0;
    const labelByGranularity =
      granularity === "day"
        ? t("spending:tabContent.dailyAvg")
        : granularity === "week"
          ? t("spending:tabContent.weeklyAvg")
          : t("spending:tabContent.monthlyAvg");
    return { barData: data, avgValue: avg, avgLabel: labelByGranularity };
  }, [report?.byDay, granularity, dateRange, appTimezone, t]);

  const categoriesMeta = useMemo(() => {
    const meta = new Map<
      string,
      { name: string; color: string | null; icon: string | null; parentId: string | null }
    >();
    (taxonomy.data?.categories ?? []).forEach((c: TaxonomyCategory) => {
      meta.set(c.id, {
        name: c.name,
        color: c.color ?? null,
        icon: c.icon ?? null,
        parentId: c.parentId ?? null,
      });
    });
    return meta;
  }, [taxonomy.data?.categories]);

  const categoryRows = useMemo(() => {
    if (!report) return [];
    return buildWhereItWentRows({
      spendingBreakdown: report.spendingBreakdown,
      priorSpendingBreakdown: priorReport?.spendingBreakdown ?? [],
      categoriesMeta,
      totalSaved,
      priorSaved: priorReport?.current.saved ?? 0,
      uncategorizedLabel: t("spending:insightsPage.uncategorized"),
      savingsLabel: t("spending:cashFlow.saving"),
    });
  }, [report, priorReport, categoriesMeta, t, totalSaved]);

  const insights = useMemo(() => {
    const items: {
      icon: string;
      title: React.ReactNode;
      sub: React.ReactNode;
      action?: React.ReactNode;
    }[] = [];
    const uncategorized = categoryRows.find((c) => c.id === "__uncategorized__");
    if (uncategorized && uncategorized.txCount > 0) {
      const hasNoCategorizationRules =
        !categorizationRulesLoading && categorizationRules.length === 0;
      items.push({
        icon: "+",
        title: (
          <>
            <span className="font-semibold">
              {t("spending:tabContent.uncategorizedCount", { count: uncategorized.txCount })}
            </span>{" "}
            {t("spending:tabContent.totaling")}{" "}
            <PrivacyAmount value={uncategorized.amount} currency={currency} />.
          </>
        ),
        sub: t("spending:tabContent.categorizeToImprove"),
        action: (
          <Link
            to="/assistant"
            state={{
              aiPrompt: t("spending:tabContent.aiCategorizePrompt"),
            }}
            data-m="fill" className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-full bg-[var(--m-forest)] px-3 text-xs text-[var(--m-on-forest)] hover:opacity-90"
          >
            <Icons.Sparkles className="h-3 w-3" />
            {t("spending:tabContent.askAiCategorize")}
          </Link>
        ),
      });
      if (hasNoCategorizationRules) {
        items.push({
          icon: "!",
          title: (
            <>
              {t("spending:tabContent.noRulesSet")}{" "}
              <Link
                to="/settings/spending/rules"
                className="font-semibold underline-offset-4 hover:underline"
              >
                {t("spending:tabContent.createRules")}
              </Link>
            </>
          ),
          sub: t("spending:tabContent.automateMatching"),
        });
      }
    }
    return items;
  }, [
    categoryRows,
    currency,
    categorizationRules,
    categorizationRulesLoading,
    t,
  ]);

  // money-hub patch: Where it went is spending only (Saving has its own tile in the Spent strip), so its
  // rows add up to the Spent figure.
  const spendRows = useMemo(
    () => categoryRows.filter((r) => r.id !== SAVINGS_ROW_ID),
    [categoryRows],
  );
  const showBills = useCallback(() => {
    document.getElementById("next-due")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);
  const periodWord = selectedIntervalDescription?.startsWith("spending:")
    ? t(selectedIntervalDescription)
    : selectedIntervalDescription;
  // "Sep 1 to 30" for the chart title; "Aug 3 to Sep 30" across months.
  const chartRangeLabel = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return undefined;
    const from = formatDateISO(dateRange.from);
    const to = formatDateISO(dateRange.to);
    const sameMonth = from.slice(0, 7) === to.slice(0, 7);
    const sameYear = from.slice(0, 4) === to.slice(0, 4);
    const opts = sameYear
      ? ({ month: "short", day: "numeric" } as const)
      : ({ month: "short", day: "numeric", year: "numeric" } as const);
    const end = sameMonth
      ? String(dateRange.to.getDate())
      : dateFormatting.formatCalendarDate(to, opts);
    return `${dateFormatting.formatCalendarDate(from, opts)} to ${end}`;
  }, [dateRange, dateFormatting]);
  const income = report?.current.income ?? 0;
  const net = income - totalSpending - totalSaved;
  const compact = (v: number) => (isBalanceHidden ? "••••" : formatting.formatCompactAmount(v, currency));

  // money-hub patch (owner, 10-02: "merge these cards"): the Spent strip is the Monthly budget card's top
  // row. Spent follows the page's period; the card's bar splits it only when that period is the card's month.
  // The Net tile is a money figure, not a button: green or red by its sign in every theme.
  const spentHead = (
    <>
      <span className="text-muted-foreground text-[12.5px]">
        {t("spending:tabContent.spentLabel")}
        {periodWord ? ` · ${periodWord.charAt(0).toUpperCase()}${periodWord.slice(1)}` : ""}
        {excludedCategoryCount > 0 && (
          <>
            {" · "}
            <Link
              to="/settings/spending/categories"
              className="hover:text-foreground hover:underline"
            >
              {t("spending:tabContent.excludedCategoriesHint", {
                count: excludedCategoryCount,
              })}
            </Link>
          </>
        )}
      </span>
      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {isLoading ? (
          <Skeleton className="h-8 w-40" />
        ) : (
          <span data-m-num="big" className="text-[30px] font-medium leading-tight tracking-[-0.03em] tabular-nums">
            <PrivacyAmount value={totalSpending} currency={currency} />
          </span>
        )}
        {isPriorLoading ? (
          <Skeleton className="h-5 w-48" />
        ) : priorSpending > 0 ? (
          <SpendingDeltaLine
            delta={delta}
            currency={currency}
            deltaPct={
              displayDeltaPct !== null && Math.abs(displayDeltaPct) <= 5 ? displayDeltaPct : null
            }
          />
        ) : null}
      </span>
    </>
  );
  const cashTiles = (
    <div className="grid min-w-0 grid-cols-3 gap-1.5">
      <Link
        to={dashboardInsightHref.cashflow}
        className="flex min-w-0 flex-col rounded-xl bg-[var(--m-sand)] px-3 py-2 hover:opacity-90 max-md:px-2.5 max-md:py-1.5"
      >
        <span className="text-muted-foreground text-xs">{t("spending:cashFlow.income")}</span>
        <span data-m-num="tile" className="truncate text-[17px] font-medium text-[var(--m-up)]">
          +{compact(income)}
        </span>
      </Link>
      <Link
        to={dashboardInsightHref.cashflow}
        className="flex min-w-0 flex-col rounded-xl bg-[var(--m-sand)] px-3 py-2 hover:opacity-90 max-md:px-2.5 max-md:py-1.5"
      >
        <span className="text-muted-foreground text-xs">{t("spending:cashFlow.saving")}</span>
        <span data-m-num="tile" className="truncate text-[17px] font-medium">{compact(totalSaved)}</span>
      </Link>
      <div data-net={net >= 0 ? "up" : "down"} className="flex min-w-0 flex-col rounded-xl bg-[var(--m-sand)] px-3 py-2 max-md:px-2.5 max-md:py-1.5">
        <span className="text-muted-foreground text-xs">{t("spending:cashFlow.net")}</span>
        <span data-m-num="tile" className={cn("truncate text-[17px] font-medium", net >= 0 ? "text-[var(--m-up)]" : "text-[var(--m-down)]")}>
          {net >= 0 ? "+" : "\u2212"}
          {compact(Math.abs(net))}
        </span>
      </div>
    </div>
  );
  const spentMatchesBudgetMonth =
    reportReq.startDate === monthReportReq.startDate && reportReq.endDate === monthReportReq.endDate;

  // money-hub patch: the Spending dashboard, Meadow (owner picked design 5 on 10-02). Order is the
  // owner's ranking: Cash & cards, Spent, money in and out, Monthly budget, Subscriptions & bills, Where it
  // went, Returns, Dig deeper, Events, Worth a look; the chart and Recent activity sit under More. Every
  // two-card row splits two thirds / one third so the columns line up; each figure shows in one place.
  return (
    <div
      className="meadow flex min-h-screen flex-col gap-3.5 px-3 pb-[var(--mobile-nav-total-offset)] pt-2 max-md:gap-2 md:px-6 md:pb-8 lg:px-8"
      data-light-skin={skins.light}
      data-dark-skin={skins.dark}
    >
      {dataErrored && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
          <span>
            <span className="font-medium">{t("spending:tabContent.loadError")}</span>{" "}
            {t("spending:insightsPage.showingZeros")}
          </span>
          <button
            type="button"
            onClick={() => void refetchReport()}
            className="text-foreground hover:underline"
          >
            {t("common:retry")}
          </button>
        </div>
      )}

      <div className="flex justify-end">
        <SpendingPeriodSelector
          className="w-auto max-w-full justify-end"
          value={selectedPeriod}
          onValueChange={handleIntervalSelect}
          customMonth={customMonth}
          customRange={customRange}
          maxMonth={maxPickerMonth}
          onCustomMonthChange={handleCustomMonthSelect}
          onCustomRangeChange={handleCustomRangeSelect}
          isLoading={isLoading}
        />
      </div>

      <CashCardsCard currency={currency} onShowBills={showBills} />


      <div className="grid gap-3.5 max-md:gap-2 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <BudgetLineChartCard
            monthKey={budgetMonthKey}
            today={todayParts}
            isCurrentMonth={budgetMonthKey === currentBudgetMonthKey}
            onPreviousMonth={() => shiftBudgetMonth(-1)}
            onNextMonth={() => shiftBudgetMonth(1)}
            canGoNextMonth={budgetMonthKey < currentBudgetMonthKey}
            activityRange={budgetMonthActivityRange}
            target={budgetCardBudget?.computed.totals.spendingPlanned ?? 0}
            spent={monthReport?.current.outflow ?? 0}
            currency={budgetCardBudget?.computed.currency ?? currency}
            historicalDailyAvg={historicalDailyAvg}
            forecastParts={budgetForecastParts}
            forecastPending={subscriptionsPending || !historyReport || !monthReport}
            allocations={
              budgetCardBudget?.computed.groupRows.flatMap((row) => row.categories) ?? []
            }
            spendingBreakdown={monthReport?.spendingBreakdown ?? []}
            categoriesMeta={categoriesMeta}
            monthByDay={monthReport?.byDay ?? []}
            historicalByDay={historyReport?.byDay ?? []}
            fill
            summary={{ head: spentHead, tiles: cashTiles, sameMonth: spentMatchesBudgetMonth }}
          />
        </div>
        <div className="min-w-0">
          {/* money-hub patch: the charges that repeat (lib/subscriptions.ts); Next due is the one list of
              the bills coming up. Side by side, the two cards are one height (owner, 10-02: "scale the
              monthly budget to match"): the budget's chart takes the extra. */}
          <SubscriptionsCard currency={currency} fill />
        </div>
      </div>

      <div className="grid gap-3.5 max-md:gap-2 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <DashboardCard
            title={t("spending:tabContent.whereItWent")}
            action={
              <div className="flex items-center gap-3">
                <SegmentedToggle
                  ariaLabel={t("spending:tabContent.whereItWentView")}
                  items={[
                    { value: "list", label: t("spending:tabContent.listView") },
                    { value: "map", label: t("spending:tabContent.mapView") },
                  ]}
                  value={whereItWentView}
                  onChange={(v) => setWhereItWentView(v as "list" | "map")}
                />
                <Link
                  to={dashboardInsightHref.where}
                  className="text-xs underline underline-offset-4 hover:no-underline"
                >
                  {t("spending:dashboard.viewAll").replace(/\s*→\s*$/, "")}
                </Link>
              </div>
            }
          >
            {isLoading ? (
              <Skeleton className="h-[220px] w-full rounded-lg" />
            ) : whereItWentView === "map" ? (
              <CategoryTreemapMono
                rows={spendRows}
                total={totalSpending}
                currency={currency}
                themeColor={theme.deep}
                hasNoIncludedAccounts={hasNoIncludedAccounts}
                activityHrefFor={activityHrefFor}
              />
            ) : (
              <CategoryRankedBar
                rows={spendRows}
                total={totalSpending}
                currency={currency}
                themeColor={theme.deep}
                groupRows={budget?.computed.groupRows ?? []}
                hasNoIncludedAccounts={hasNoIncludedAccounts}
                activityHrefFor={activityHrefFor}
              />
            )}
          </DashboardCard>
        </div>
        <div className="flex min-w-0 flex-col gap-3.5 max-md:gap-2">
          {/* money-hub patch: returns still waiting for their refund (lib/returns.ts); nothing while none is. */}
          <ReturnsCard currency={currency} />
          <nav
            aria-label={t("spending:tabContent.digDeeper")}
            data-m="card"
            className="border-border flex flex-col rounded-[20px] border bg-[var(--m-surface)] p-1.5 max-md:p-1"
          >
            {INSIGHT_STAGES.map((s) => (
              <Link
                key={s.stage}
                to={dashboardInsightHref[s.stage]}
                className="hover:bg-muted/40 group flex items-center gap-3 rounded-[14px] px-3 py-2.5 transition-colors max-md:gap-2.5 max-md:px-2 max-md:py-1.5"
              >
                <span data-m="icon-tile" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--m-mint)] text-[var(--m-forest)]">
                  <s.Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-foreground block text-[13.5px] font-medium">
                    {t(s.labelKey)}
                  </span>
                  <span className="text-muted-foreground block truncate text-[11.5px]">
                    {t(s.subKey)}
                  </span>
                </span>
                <Icons.ChevronRight className="text-muted-foreground group-hover:text-foreground h-3.5 w-3.5" />
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="grid gap-3.5 max-md:gap-2 lg:grid-cols-3">
        <div className={cn("min-w-0", insights.length > 0 ? "lg:col-span-2" : "lg:col-span-3")}>
          <EventsCard
            activities={activities}
            accountTypeById={accountTypeById}
            categoriesMeta={categoriesMeta}
            eventSummaryEndDate={reportReq.endDate}
            eventSummaryStartDate={reportReq.startDate}
            periodEndDate={dateRange?.to ? formatDateISO(dateRange.to) : reportReq.endDate}
            periodStartDate={dateRange?.from ? formatDateISO(dateRange.from) : reportReq.startDate}
            theme={theme}
          />
        </div>
        {insights.length > 0 ? (
          <section
            aria-label={t("spending:tabContent.worthALook")}
            data-m="notice"
            className="min-w-0 rounded-[20px] border border-[var(--m-warn-panel-line)] bg-[var(--m-warn-panel)] px-[18px] py-4 max-md:px-3 max-md:py-2.5"
          >
            <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 whitespace-nowrap">
              <Icons.AlertCircle className="h-4 w-4 shrink-0 text-[var(--m-warn)]" />
              <h3 className="text-foreground text-sm font-medium">
                {t("spending:tabContent.worthALook")}
              </h3>
              <span className="text-muted-foreground text-xs">
                {t("spending:tabContent.signalCount", { count: insights.length })}
              </span>
              <Link
                to={dashboardInsightHref.changed}
                className="ml-auto text-xs underline underline-offset-4 hover:no-underline"
              >
                {t("spending:tabContent.seeTrends")}
              </Link>
            </div>
            <div className="space-y-2.5">
              {insights.map((ins, i) => (
                <div key={i} className="text-[13px]">
                  <div className="text-foreground">{ins.title}</div>
                  <div className="text-muted-foreground mt-0.5 text-xs">{ins.sub}</div>
                  {ins.action && <div>{ins.action}</div>}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <div className="flex items-center gap-2.5 pt-1">
        <span className="text-muted-foreground text-xs">More</span>
        <span className="border-border flex-1 border-t" />
      </div>

      <SpendingByPeriodCard
        barData={barData}
        avgValue={avgValue}
        avgLabel={avgLabel}
        granularity={granularity}
        isLoading={isLoading}
        currency={currency}
        rangeLabel={chartRangeLabel}
        onOpen={(entry) => {
          const bucket = barKeyToRange(entry.key, granularity);
          const rangeStart = dateRange?.from ? formatDateISO(dateRange.from) : bucket.from;
          const rangeEnd = dateRange?.to ? formatDateISO(dateRange.to) : bucket.to;
          const from = bucket.from < rangeStart ? rangeStart : bucket.from;
          const to = bucket.to > rangeEnd ? rangeEnd : bucket.to;
          navigate(`/activities?tab=spending&from=${from}&to=${to}`);
        }}
      />

      <RecentActivityCard
        activities={activities}
        accountTypeById={accountTypeById}
        accountById={accountById}
        categoriesMeta={categoriesMeta}
        uncategorizedCount={uncategorizedCount}
        pendingRange={{
          from: dateRange?.from ? formatDateISO(dateRange.from) : undefined,
          to: dateRange?.to ? formatDateISO(dateRange.to) : undefined,
        }}
      />
    </div>
  );
}

// ─── small inline components ──────────────────────────────────────────────

function SegmentedToggle({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  /** A11y label for the group — without this, screen readers announce two
   *  unrelated buttons instead of a single logical control. */
  ariaLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="bg-card/40 border-border/60 inline-flex max-w-full items-center gap-0.5 rounded-full border p-0.5"
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            onClick={() => onChange(it.value)}
            aria-pressed={active}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Where it went — Map (treemap) and List variants ──────────────────────

interface CategoryRow {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  amount: number;
}

function WhereItWentEmptyState({ hasNoIncludedAccounts }: { hasNoIncludedAccounts: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="py-6 text-center">
      {hasNoIncludedAccounts ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            {t("spending:tabContent.noAccountsSelected")}
          </p>
          <Link
            to="/settings/spending"
            className="text-foreground inline-flex text-xs underline-offset-4 hover:underline"
          >
            {t("spending:tabContent.openSpendingSettings")}
          </Link>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          {t("spending:hierarchy.noCategorizedSpending")}
        </p>
      )}
    </div>
  );
}

interface CategoryTreemapNodeProps {
  depth?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  amount?: number;
  pct?: number;
  fill?: string;
  currency?: string;
  id?: string;
}

interface CategoryTreemapNodeMonoProps extends CategoryTreemapNodeProps {
  accent?: string | null;
  onActivate?: (id: string) => void;
}

function CategoryTreemapMono({
  rows,
  total,
  currency,
  themeColor,
  hasNoIncludedAccounts,
  activityHrefFor,
}: {
  rows: CategoryRow[];
  total: number;
  currency: string;
  themeColor: string;
  hasNoIncludedAccounts: boolean;
  activityHrefFor: (id: string) => string;
}) {
  const { t } = useTranslation();
  const numberFormatting = useNumberFormatting();
  const navigate = useNavigate();

  if (rows.length === 0 || total <= 0) {
    return <WhereItWentEmptyState hasNoIncludedAccounts={hasNoIncludedAccounts} />;
  }

  const top = rows.slice(0, 8);
  const restAmount = rows.slice(8).reduce((s, r) => s + r.amount, 0);
  const data: {
    name: string;
    amount: number;
    fill: string;
    accent: string | null;
    id: string;
    pct: number;
  }[] = top.map((r) => ({
    name: r.name,
    amount: r.amount,
    fill: themeColor,
    accent: r.color,
    id: r.id,
    pct: total > 0 ? (r.amount / total) * 100 : 0,
  }));
  if (restAmount > 0) {
    data.push({
      name: t("spending:hero.other"),
      amount: restAmount,
      fill: themeColor,
      accent: null,
      id: "__other__",
      pct: total > 0 ? (restAmount / total) * 100 : 0,
    });
  }

  return (
    <div className="border-border/60 bg-card/40 overflow-hidden rounded-xl border p-4 backdrop-blur-xl md:p-5">
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data}
            dataKey="amount"
            aspectRatio={4 / 3}
            stroke="transparent"
            content={
              (
                <CategoryTreemapNodeMono
                  currency={currency}
                  onActivate={(id) => {
                    if (id && id !== "__other__") {
                      navigate(activityHrefFor(id));
                    }
                  }}
                />
              ) as unknown as React.ReactElement
            }
            isAnimationActive={false}
            onClick={(node: unknown) => {
              const id = (node as { id?: string } | null)?.id;
              if (id && id !== "__other__") {
                navigate(activityHrefFor(id));
              }
            }}
          >
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { name: string; amount: number; pct: number };
                return (
                  <div className="bg-background rounded-md border px-3 py-2 text-xs shadow-sm">
                    <div className="text-foreground font-semibold">{p.name}</div>
                    <div className="text-muted-foreground tabular-nums">
                      <PrivacyAmount value={p.amount} currency={currency} /> ·{" "}
                      {numberFormatting.formatPercent(p.pct / 100, { digits: 1 })}
                    </div>
                  </div>
                );
              }}
            />
          </Treemap>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const CategoryTreemapNodeMono: FC<CategoryTreemapNodeMonoProps> = ({
  depth = 0,
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  name,
  amount = 0,
  pct = 0,
  fill = "#7DB3D9",
  currency = "USD",
  accent,
  id,
  onActivate,
}) => {
  const formatting = useAmountFormatting();
  const numberFormatting = useNumberFormatting();
  const { t } = useTranslation();
  const { isBalanceHidden } = useBalancePrivacy();
  if (depth === 0) return null;

  const showName = width > 56 && height > 32;
  const labelFontSize = Math.max(9.5, Math.min(11.5, Math.min(width, height) * 0.11));
  const amountFontSize = Math.max(11, Math.min(15, Math.min(width, height) * 0.15));
  const pctFontSize = 10;
  const padX = Math.max(10, width * 0.05);
  const padY = Math.max(10, height * 0.07);

  const fillOpacity = 0.12 + Math.min(0.55, (pct / 30) * 0.55);
  const dotR = Math.max(2.5, Math.min(4, Math.min(width, height) * 0.04));
  const showDot = accent && width > 40 && height > 28;

  const amountText = isBalanceHidden ? "••••" : formatting.formatAmount(amount, currency);
  const pctText = numberFormatting.formatPercent(pct / 100, { digits: 1 });
  const amountTextW = amountText.length * amountFontSize * 0.58;
  const pctTextW = pctText.length * pctFontSize * 0.6;
  const innerW = Math.max(0, width - padX * 2);
  const showAmount = width > 60 && height > 48;
  const showPct = showAmount && height > 70 && amountTextW + pctTextW + 8 <= innerW;

  const isOther = id === "__other__";
  const isClickable = !!id && !isOther;
  const a11yProps = isClickable
    ? {
        role: "button" as const,
        tabIndex: 0,
        "aria-label": `${name ?? t("spending:filters.category")}: ${amountText}, ${pctText}`,
        onKeyDown: (e: React.KeyboardEvent<SVGGElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onActivate?.(id);
          }
        },
      }
    : {};

  return (
    <g style={{ cursor: isClickable ? "pointer" : "default" }} {...a11yProps}>
      <rect
        x={x + 1}
        y={y + 1}
        width={Math.max(0, width - 2)}
        height={Math.max(0, height - 2)}
        rx={5}
        ry={5}
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={fill}
        strokeOpacity={0.4}
        strokeWidth={0.75}
      />
      {showDot && (
        <circle cx={x + padX + dotR} cy={y + padY + dotR} r={dotR} fill={accent ?? "transparent"} />
      )}
      {/* Visual labels — the parent <g> already carries an aria-label with
          the full "<name>: <amount>, <pct>" string, so the SVG <text> nodes
          are decorative and would otherwise double-announce on screen
          readers. */}
      {showName && (
        <text
          x={x + padX + (showDot ? dotR * 2 + 6 : 0)}
          y={y + padY + labelFontSize - 2}
          fill="var(--foreground)"
          className="font-semibold uppercase"
          style={{ fontSize: labelFontSize, letterSpacing: "0.06em", opacity: 0.7 }}
          aria-hidden
        >
          {truncateForBox(
            name ?? "",
            width - padX * 2 - (showDot ? dotR * 2 + 6 : 0),
            labelFontSize,
          )}
        </text>
      )}
      {showAmount && (
        <text
          x={x + padX}
          y={y + height - padY}
          fill="var(--foreground)"
          className="font-semibold tabular-nums"
          style={{ fontSize: amountFontSize, opacity: 0.92 }}
          aria-hidden
        >
          {truncateForBox(amountText, innerW - (showPct ? pctTextW + 8 : 0), amountFontSize)}
        </text>
      )}
      {showPct && (
        <text
          x={x + width - padX}
          y={y + height - padY}
          textAnchor="end"
          fill="var(--foreground)"
          className="tabular-nums"
          style={{ fontSize: pctFontSize, opacity: 0.5 }}
          aria-hidden
        >
          {pctText}
        </text>
      )}
    </g>
  );
};

// Exported for the preview harness (preview/free-cash.tsx ?view=where).
export function CategoryRankedBar({
  rows,
  total,
  currency,
  themeColor,
  groupRows = [],
  hasNoIncludedAccounts,
  activityHrefFor,
}: {
  rows: CategoryRow[];
  total: number;
  currency: string;
  themeColor: string;
  hasNoIncludedAccounts: boolean;
  /**
   * Budget groups (Needs / Wants / …). When any category here is assigned to a
   * group, the list switches to a grouped layout with collapsible group rows.
   */
  groupRows?: import("../types/budget").BudgetGroupRow[];
  activityHrefFor: (id: string) => string;
}) {
  const formatting = useAmountFormatting();
  const numberFormatting = useNumberFormatting();
  const { t } = useTranslation();
  const { isBalanceHidden } = useBalancePrivacy();
  // Memoize derivations so we don't rebuild the Map + reduce + slices on every
  // parent re-render — this card lives inside a chart-heavy page.
  const derived = useMemo(() => {
    const categoryGroup = new Map<string, { id: string; name: string; color: string | null }>();
    for (const g of groupRows) {
      for (const cat of g.categories) {
        categoryGroup.set(cat.categoryId, {
          id: g.group.id,
          name: g.group.name,
          color: g.group.color,
        });
      }
    }
    const hasAnyGroup = rows.some((r) => categoryGroup.has(r.id));
    const categorizedSum = rows.reduce((s, r) => s + r.amount, 0);
    const uncategorizedAmount = Math.max(0, total - categorizedSum);

    const top = rows.slice(0, 7);
    const restAmount = rows.slice(7).reduce((s, r) => s + r.amount, 0);
    const barSegments: CategoryRow[] = [...top];
    if (restAmount > 0) {
      barSegments.push({
        id: "__other__",
        name: t("spending:hero.other"),
        amount: restAmount,
        color: null,
        icon: null,
      });
    }
    return { categoryGroup, hasAnyGroup, uncategorizedAmount, top, restAmount, barSegments };
  }, [rows, total, groupRows, t]);

  if (rows.length === 0 || total <= 0) {
    return <WhereItWentEmptyState hasNoIncludedAccounts={hasNoIncludedAccounts} />;
  }

  const { categoryGroup, hasAnyGroup, uncategorizedAmount, top, restAmount, barSegments } = derived;

  const StackedBar = (
    <div className="flex h-3.5 w-full gap-[3px]">
      {barSegments.map((s) => {
        const share = (s.amount / total) * 100;
        const color = s.id === "__other__" ? "var(--m-cat-other)" : (s.color ?? themeColor);
        return (
          <div
            key={s.id}
            className="h-full min-w-[3px] rounded-[5px] transition-opacity hover:opacity-80"
            // Grow by share so the 3px gaps fit inside the card.
            style={{
              flex: `${share} 1 0`,
              backgroundColor: color,
            }}
            title={`${s.name}: ${
              isBalanceHidden ? "••••" : formatting.formatAmount(s.amount, currency)
            } (${numberFormatting.formatPercent(share / 100, { digits: 1 })})`}
          />
        );
      })}
    </div>
  );

  if (hasAnyGroup) {
    // Group rows by their group assignment; unassigned categories + the
    // uncategorized bucket fall into a synthetic "Other" group.
    interface Bucket {
      id: string;
      name: string;
      color: string | null;
      categories: CategoryRow[];
      total: number;
    }
    const buckets = new Map<string, Bucket>();
    const ensureBucket = (id: string, name: string, color: string | null) => {
      let b = buckets.get(id);
      if (!b) {
        b = { id, name, color, categories: [], total: 0 };
        buckets.set(id, b);
      }
      return b;
    };
    // Seed declared groups first so they keep the user's sortOrder when totals tie.
    for (const g of groupRows) ensureBucket(g.group.id, g.group.name, g.group.color);

    // The backend ships an "Other" system group (key="other"). Reuse it for
    // unassigned categories so we don't render two "Other" rows side by side.
    const fallbackGroup =
      groupRows.find((g) => g.group.key === "other") ??
      groupRows.find((g) => g.group.name.toLowerCase() === "other");
    const ensureOther = () =>
      fallbackGroup
        ? ensureBucket(fallbackGroup.group.id, fallbackGroup.group.name, fallbackGroup.group.color)
        : ensureBucket("__other__", t("spending:hero.other"), null);

    for (const row of rows) {
      let b: Bucket;
      if (row.id === SAVINGS_ROW_ID) {
        b = ensureBucket(SAVINGS_ROW_ID, t("spending:cashFlow.saving"), SAVINGS_ROW_COLOR);
      } else {
        const g = categoryGroup.get(row.id);
        b = g ? ensureBucket(g.id, g.name, g.color) : ensureOther();
      }
      b.categories.push(row);
      b.total += row.amount;
    }
    if (uncategorizedAmount > 0.01) {
      const b = ensureOther();
      b.categories.push({
        id: "__uncategorized__",
        name: t("spending:dashboard.uncategorized"),
        color: null,
        icon: null,
        amount: uncategorizedAmount,
      });
      b.total += uncategorizedAmount;
    }

    // Preserve insertion order: declared groups follow the user's `sortOrder`
    // from the backend (mockup convention), and the synthetic "Other" bucket
    // naturally lands last because it's only created on demand.
    const orderedBuckets = Array.from(buckets.values()).filter((b) => b.total > 0);
    // money-hub patch: on a phone the first four show and the rest fold (approved phone design, 10-02).
    const renderBucket = (bucket: (typeof orderedBuckets)[number]) => (
      <GroupedCategoryBlock
        key={bucket.id}
        bucket={bucket}
        total={total}
        currency={currency}
        themeColor={themeColor}
        activityHrefFor={activityHrefFor}
      />
    );

    return (
      <div>
        {StackedBar}
        <div className="mt-3 space-y-1.5 max-md:mt-2">
          {orderedBuckets.slice(0, 4).map(renderBucket)}
          {orderedBuckets.length > 4 ? (
            <PhoneFold
              id="where-it-went"
              closedLabel={`Show ${orderedBuckets.length - 4} more`}
              openLabel="Show less"
              className="!mt-2.5 -mb-2.5"
            >
              {orderedBuckets.slice(4).map(renderBucket)}
            </PhoneFold>
          ) : null}
        </div>
      </div>
    );
  }

  // ── Flat layout (no budget groups configured). money-hub patch: Meadow tiles, two across when wide.
  const renderRow = (r: (typeof top)[number]) => {
    const share = (r.amount / total) * 100;
    const color = r.color ?? themeColor;
    return (
      <Link
        key={r.id}
        to={activityHrefFor(r.id)}
        className="flex min-h-11 items-center gap-2.5 rounded-xl bg-[var(--m-tile)] px-3 py-1 transition-opacity hover:opacity-80"
      >
        {/* money-hub patch: the category's icon in its colour, not a bar (owner, 10-02). */}
        <CategoryMark icon={r.icon} color={color} size="lg" />
        <span className="text-foreground min-w-0 flex-1 truncate text-[13px]">{r.name}</span>
        <span className="text-muted-foreground w-[52px] text-right text-xs tabular-nums">
          {numberFormatting.formatPercent(share / 100, { digits: 1 })}
        </span>
        <span className="text-foreground w-[92px] text-right text-[13px] font-medium tabular-nums">
          <PrivacyAmount value={r.amount} currency={currency} />
        </span>
      </Link>
    );
  };
  const uncategorizedShare = total > 0 ? (uncategorizedAmount / total) * 100 : 0;
  return (
    <div className="flex flex-col gap-3">
      {StackedBar}

      <div className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr))]">
        {top.slice(0, 4).map(renderRow)}
        <PhoneFold
          id="where-it-went"
          closedLabel={`Show ${Math.max(0, top.length - 4) + (uncategorizedAmount > 0.01 ? 1 : 0)} more`}
          openLabel="Show less"
          className={top.length > 4 || uncategorizedAmount > 0.01 ? "mt-1" : "hidden"}
        >
        {top.slice(4).map(renderRow)}
        {uncategorizedAmount > 0.01 && (
          <Link
            to={activityHrefFor("__uncategorized__")}
            className="flex min-h-11 items-center gap-2.5 rounded-xl border border-dashed border-[var(--m-cat-other)] px-3 py-1 transition-opacity hover:opacity-80"
          >
            <Icons.AlertCircle className="h-3 w-3 shrink-0 text-[var(--m-warn)]" />
            <span className="text-foreground min-w-0 flex-1 truncate text-[13px]">
              {t("spending:dashboard.uncategorized")}
            </span>
            <span className="text-muted-foreground w-[52px] text-right text-xs tabular-nums">
              {numberFormatting.formatPercent(uncategorizedShare / 100, { digits: 1 })}
            </span>
            <span className="text-foreground w-[92px] text-right text-[13px] font-medium tabular-nums">
              <PrivacyAmount value={uncategorizedAmount} currency={currency} />
            </span>
          </Link>
        )}
        </PhoneFold>
      </div>
      {restAmount > 0 && (
        <div className="text-muted-foreground text-xs">
          {t("spending:tabContent.plusMore", { count: rows.length - 7 })} ·{" "}
          <PrivacyAmount value={restAmount} currency={currency} />
        </div>
      )}
    </div>
  );
}

function GroupedCategoryBlock({
  bucket,
  total,
  currency,
  themeColor,
  activityHrefFor,
}: {
  bucket: {
    id: string;
    name: string;
    color: string | null;
    categories: CategoryRow[];
    total: number;
  };
  total: number;
  currency: string;
  themeColor: string;
  activityHrefFor: (id: string) => string;
}) {
  const numberFormatting = useNumberFormatting();
  const [expanded, setExpanded] = useState(false);
  const share = total > 0 ? (bucket.total / total) * 100 : 0;
  const accent = bucket.color ?? themeColor;
  // Sort categories by spend descending, but always pin the uncategorized
  // bucket to the end — it's a "to-do" row, not a normal category.
  const sortedCats = useMemo(
    () =>
      bucket.categories.slice().sort((a, b) => {
        if (a.id === "__uncategorized__") return 1;
        if (b.id === "__uncategorized__") return -1;
        return b.amount - a.amount;
      }),
    [bucket.categories],
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-xl bg-[var(--m-tile)] px-3 py-1 transition-opacity hover:opacity-80"
      >
        <Icons.ChevronRight
          className={cn(
            "text-muted-foreground/70 h-3 w-3 shrink-0 transition-transform",
            expanded && "rotate-90",
          )}
        />
        <span className="block h-6 w-2 shrink-0 rounded-[3px]" style={{ backgroundColor: accent }} />
        <span className="text-foreground min-w-0 flex-1 truncate text-left text-[13px]">
          {bucket.name}
        </span>
        <span className="text-muted-foreground w-[52px] text-right text-xs tabular-nums">
          {numberFormatting.formatPercent(share / 100, { digits: 1 })}
        </span>
        <span className="text-foreground w-[92px] text-right text-[13px] font-medium tabular-nums">
          <PrivacyAmount value={bucket.total} currency={currency} />
        </span>
      </button>
      {expanded && (
        <div className="mt-1 space-y-0.5 pl-8 pr-3">
          {sortedCats.map((cat) => {
            const catShare = total > 0 ? (cat.amount / total) * 100 : 0;
            const isUncategorized = cat.id === "__uncategorized__";
            const to = activityHrefFor(cat.id);
            const dotColor = cat.color ?? accent;
            return (
              <Link
                key={cat.id}
                to={to}
                className="hover:bg-muted/40 flex items-center gap-2.5 rounded-md px-1 py-1 transition-colors"
              >
                {isUncategorized ? (
                  <Icons.AlertCircle className="h-3 w-3 shrink-0 text-[var(--m-warn)]" />
                ) : (
                  // money-hub patch: the category's icon in its colour, not a dot (owner, 10-02: "where is the icons").
                  <CategoryMark icon={cat.icon} color={dotColor} />
                )}
                <span className="text-foreground min-w-0 flex-1 truncate text-[12.5px]">
                  {cat.name}
                </span>
                <span className="text-muted-foreground w-[52px] text-right text-xs tabular-nums">
                  {numberFormatting.formatPercent(catShare / 100, { digits: 1 })}
                </span>
                <span className="text-foreground w-[92px] text-right text-[12.5px] tabular-nums">
                  <PrivacyAmount value={cat.amount} currency={currency} />
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function truncateForBox(text: string, boxWidth: number, fontSize: number): string {
  if (!text) return "";
  const charW = fontSize * 0.62;
  const max = Math.max(2, Math.floor(boxWidth / charW));
  return text.length > max ? text.slice(0, Math.max(1, max - 1)) + "…" : text;
}

// money-hub patch: the change from the prior period, as the one chip by Spent (Meadow): amber when
// spending went up, mint when it went down.
function SpendingDeltaLine({
  delta,
  currency,
  deltaPct,
}: {
  delta: number;
  currency: string;
  deltaPct: number | null;
}) {
  const { t } = useTranslation();
  const numberFormatting = useNumberFormatting();
  const formatting = useAmountFormatting();
  const { isBalanceHidden } = useBalancePrivacy();
  const isFlat = Math.abs(delta) < 1;

  if (isFlat) {
    return (
      <span className="text-muted-foreground rounded-full bg-[var(--m-sand)] px-2.5 py-0.5 text-xs">
        {t("spending:tabContent.aboutSame")}
      </span>
    );
  }

  const up = delta > 0;
  const pctSuffix =
    deltaPct !== null
      ? ` (${numberFormatting.formatPercent(Math.abs(deltaPct), { digits: 0 })})`
      : "";

  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs",
        up
          ? "bg-[var(--m-warn-soft)] text-[var(--m-warn)]"
          : "bg-[var(--m-good-soft)] text-[var(--m-up)]",
      )}
    >
      {up ? <Icons.ArrowUp className="h-3 w-3" /> : <Icons.ArrowDown className="h-3 w-3" />}
      {isBalanceHidden ? "••••" : formatting.formatRoundedAmount(Math.abs(delta), currency)}
      {pctSuffix} {t("spending:tabContent.fromPriorPeriod")}
    </span>
  );
}
