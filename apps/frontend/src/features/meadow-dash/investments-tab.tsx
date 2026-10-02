// money-hub patch: the Investments tab in the Spending dashboard's look (owner, 10-02). Same sections and
// figures as the stock tab (pages/dashboard/dashboard-content.tsx): the period pills top right; one hero with
// the total, its change for the period, the chart with a scale, and what the stock hover card held (as of,
// Update prices, Refresh full history, any notes) out in the open; then Accounts (two thirds) beside Holdings
// and Goals. The data hooks are the stock tab's; the three cards are the stock cards, framed the Meadow way.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

import { calculatePerformanceSummary } from "@/adapters";
import { formatZonedDateKey } from "@/features/spending/lib/timezone";
import { useHapticFeedback } from "@/hooks";
import {
  useRecalculatePortfolioMutation,
  useUpdatePortfolioMutation,
} from "@/hooks/use-calculate-portfolio";
import { useCurrentValuation } from "@/hooks/use-current-account-valuations";
import { useHoldings } from "@/hooks/use-holdings";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { useValuationHistory } from "@/hooks/use-valuation-history";
import { HoldingType, isAlternativeAssetKind } from "@/lib/constants";
import { performancePeriodPnl, performanceSummaryReturn } from "@/lib/performance";
import { QueryKeys } from "@/lib/query-keys";
import { useSettingsContext } from "@/lib/settings-provider";
import { parseLocalDate } from "@/lib/utils";
import { AccountsSummary } from "@/pages/dashboard/accounts-summary";
import SavingGoals from "@/pages/dashboard/goals";
import TopHoldings from "@/pages/dashboard/top-holdings";
import { getInitialIntervalData, Icons, IntervalSelector, type TimePeriod } from "@wealthfolio/ui";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";

import {
  ChangeChip,
  Hero,
  HeroButton,
  HeroChart,
  MeadowTab,
  periodWords,
  signedPercent,
  useMoney,
} from "./parts";

const DEFAULT_INTERVAL: TimePeriod = "3M";
const INTERVAL_STORAGE_KEY = "dashboard-interval";

export function MeadowInvestmentsTab() {
  const { t } = useTranslation();
  const { settings } = useSettingsContext();
  const isMobile = useIsMobileViewport();
  const { triggerHaptic } = useHapticFeedback();
  const todayISO = formatZonedDateKey(new Date(), settings?.timezone);
  const [selectedInterval, setSelectedInterval] = usePersistentState<TimePeriod>(
    INTERVAL_STORAGE_KEY,
    DEFAULT_INTERVAL,
  );
  const dateRange = useMemo(
    () => getInitialIntervalData(selectedInterval, parseLocalDate(todayISO)).range,
    [selectedInterval, todayISO],
  );
  const isAllTime = selectedInterval === "ALL";

  const { holdings: allHoldings, isLoading: isHoldingsLoading } = useHoldings({ type: "all" });
  const {
    currentValuation,
    isLoading: isCurrentValuationLoading,
    error: currentValuationError,
  } = useCurrentValuation({ type: "all" }, { includeAccounts: true });
  const holdings = useMemo(
    () =>
      (allHoldings ?? []).filter(
        (h) =>
          h.holdingType !== HoldingType.CASH &&
          !(h.assetKind && isAlternativeAssetKind(h.assetKind)),
      ),
    [allHoldings],
  );
  const totalValue = currentValuation?.summary.totalValueBase ?? 0;
  const { valuationHistory, isLoading: isHistoryLoading } = useValuationHistory(
    isAllTime ? undefined : dateRange,
  );
  const baseCurrency = settings?.baseCurrency ?? "USD";
  const money = useMoney(baseCurrency);

  const startDate =
    !isAllTime && dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : undefined;
  const endDate = !isAllTime && dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : undefined;
  const datesReady = isAllTime || (!!startDate && !!endDate);
  const { data: performance, isLoading: isPerformanceLoading } = useQuery({
    queryKey: [QueryKeys.PERFORMANCE_SUMMARY, "dashboard", "all", startDate, endDate],
    queryFn: () =>
      calculatePerformanceSummary({
        itemType: "account",
        itemId: "portfolio:all",
        startDate,
        endDate,
        filter: { type: "all" },
        profile: "dashboard",
      }),
    enabled: datesReady,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    retry: 1,
  });
  const gain = performancePeriodPnl(performance);
  const simpleReturn = performanceSummaryReturn(performance);
  const unavailable =
    !isCurrentValuationLoading && !currentValuation && Boolean(currentValuationError);
  const asOf =
    currentValuation?.summary.sourceDataAsOf ??
    (!unavailable ? valuationHistory?.[valuationHistory.length - 1]?.calculatedAt : undefined);
  const notices = currentValuation?.summary.warnings ?? [];

  const update = useUpdatePortfolioMutation();
  const rebuild = useRecalculatePortfolioMutation();

  const chartData = useMemo(
    () =>
      (valuationHistory ?? []).map((v) => ({
        date: v.valuationDate,
        value: v.totalValueBase,
        deposit: v.netContributionBase,
      })),
    [valuationHistory],
  );

  const asOfText = asOf
    ? new Date(asOf).toLocaleString(
        undefined,
        isMobile
          ? { hour: "numeric", minute: "2-digit" }
          : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
      )
    : null;
  const total = money.split(totalValue);
  const periodLabel = periodWords(t(`ui:interval.${selectedInterval}`));

  const actions = (
    <div className="flex flex-wrap gap-1.5">
      <HeroButton
        onClick={() => update.mutate()}
        busy={update.isPending}
        icon={<Icons.Refresh className="h-3.5 w-3.5" aria-hidden />}
        label={isMobile ? t("dashboard:update.update_quotes") : undefined}
      >
        {isMobile
          ? null
          : update.isPending
            ? t("dashboard:update.updating_quotes")
            : t("dashboard:update.update_quotes")}
      </HeroButton>
      <HeroButton
        onClick={() => rebuild.mutate()}
        busy={rebuild.isPending}
        icon={<Icons.Clock className="h-3.5 w-3.5" aria-hidden />}
        label={isMobile ? t("dashboard:update.rebuild_history") : undefined}
      >
        {isMobile
          ? null
          : rebuild.isPending
            ? t("dashboard:update.rebuilding_history")
            : t("dashboard:update.rebuild_history")}
      </HeroButton>
    </div>
  );

  const numbers = (
    <div className="flex min-w-0 flex-col gap-1.5 max-md:gap-0.5">
      <div className="flex flex-wrap items-center gap-2.5">
        {isCurrentValuationLoading ? (
          <Skeleton className="h-10 w-56" />
        ) : unavailable ? (
          <span className="text-[30px] text-[var(--m-mint-muted)]">N/A</span>
        ) : (
          <span
            data-m-num={isMobile ? "big" : "hero"}
            className="text-[38px] font-medium leading-[1.1] tracking-[-0.03em] max-md:text-[30px]"
          >
            {total.main}
            <span className="text-[var(--m-mint-muted)]">{total.rest}</span>
          </span>
        )}
        {simpleReturn != null && !isPerformanceLoading ? (
          <ChangeChip value={simpleReturn} text={signedPercent(simpleReturn)} />
        ) : null}
      </div>
      {isPerformanceLoading ? (
        <Skeleton className="h-4 w-56" />
      ) : gain != null ? (
        <span className="text-[13.5px] text-[var(--m-mint-muted)] max-md:text-[12.5px]">
          {gain >= 0 ? "Up" : "Down"} {money.cents(Math.abs(gain))}, {periodLabel}
        </span>
      ) : null}
    </div>
  );

  const chart =
    isHistoryLoading && !chartData.length ? (
      <Skeleton className="h-[170px] w-full rounded-xl" />
    ) : (
      <HeroChart
        data={chartData}
        height={isMobile ? 96 : 176}
        ticks={isMobile ? 3 : 4}
        money={money.short}
        tooltip={(p) => {
          const point = p as (typeof chartData)[number];
          return (
            <div className="flex flex-col gap-0.5">
              <span className="text-[var(--m-muted)]">
                {new Date(`${point.date}T12:00:00`).toLocaleDateString(undefined, {
                  dateStyle: "medium",
                })}
              </span>
              <span className="flex justify-between gap-4">
                <span>Total value</span>
                <span className="tabular-nums">{money.cents(point.value)}</span>
              </span>
              <span className="flex justify-between gap-4 text-[var(--m-muted)]">
                <span>Net deposit</span>
                <span className="tabular-nums">{money.cents(point.deposit)}</span>
              </span>
            </div>
          );
        }}
      />
    );

  return (
    <MeadowTab>
      {valuationHistory && chartData.length > 0 ? (
        <div className="flex justify-end">
          <IntervalSelector
            className="w-auto max-w-full"
            value={selectedInterval}
            onIntervalSelect={(code) => setSelectedInterval(code)}
            onHaptic={triggerHaptic}
            isLoading={isHistoryLoading}
          />
        </div>
      ) : null}

      <Hero label="Investments">
        <div className="flex flex-wrap items-stretch gap-x-8 gap-y-3 max-md:flex-col max-md:gap-1.5">
          <div className="flex min-w-[260px] flex-[0_1_360px] flex-col gap-3 max-md:min-w-0 max-md:flex-none max-md:gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <h2 className="text-sm font-medium">{t("dashboard:tabs.investments")}</h2>
                {asOfText ? (
                  <span className="text-[12.5px] text-[var(--m-mint-muted)]">
                    {isMobile ? asOfText : `as of ${asOfText}`}
                  </span>
                ) : null}
              </div>
              {isMobile ? actions : null}
            </div>
            {numbers}
            {notices.length ? (
              <ul className="flex flex-col gap-1 rounded-xl bg-[var(--m-warn-soft)] px-3 py-2 text-[12px] text-[var(--m-warn)]">
                {notices.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
            {!isMobile ? <div className="mt-auto">{actions}</div> : null}
          </div>
          <div className="min-w-0 flex-[1_1_480px] max-md:flex-none">{chart}</div>
        </div>
      </Hero>

      <div className="grid grid-cols-1 items-start gap-3.5 max-md:gap-2 lg:grid-cols-3">
        <section
          data-m="card"
          data-acct
          className="min-w-0 rounded-[20px] border border-[var(--m-line)] bg-[var(--m-surface)] px-[18px] pb-3 pt-3.5 max-md:px-3 max-md:pb-2 max-md:pt-2.5 lg:col-span-2"
        >
          <AccountsSummary
            dateRange={dateRange}
            isAllTime={isAllTime}
            currentAccountValuations={currentValuation?.accounts}
            isLoadingCurrentValuations={isCurrentValuationLoading}
          />
        </section>
        <div className="flex min-w-0 flex-col gap-3.5 max-md:gap-2">
          <TopHoldings
            holdings={holdings}
            isLoading={isHoldingsLoading}
            baseCurrency={baseCurrency}
          />
          <SavingGoals />
        </div>
      </div>
    </MeadowTab>
  );
}
