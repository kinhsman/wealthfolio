// money-hub patch: the Net worth tab in the Spending dashboard's look (owner, 10-02: "redesign ... network
// pages", then "build"). Same sections and figures as the stock tab (pages/net-worth/net-worth-content.tsx),
// laid out like the approved canvas: the period pills top right, one hero with the net worth, its change and
// a chart with a scale, then Breakdown (two thirds) beside Monthly pace, Momentum and Needs attention.
// The data hooks, the change maths and both detail drawers are the stock tab's own.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { AltAssetIcon } from "@/components/alt-asset-icon";
import { DashboardCard } from "@/components/dashboard-card";
import { RoundLogo } from "@/components/round-logo";
import { PhoneFold } from "@/features/spending/components/phone-fold";
import { formatZonedDateKey } from "@/features/spending/lib/timezone";
import { useAccounts } from "@/hooks/use-accounts";
import { useNetWorth, useNetWorthHistory } from "@/hooks/use-alternative-assets";
import { accountLogoUrl } from "@/lib/account-logo";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { usePortfolioAllocations } from "@/hooks/use-portfolio-allocations";
import { getNetWorthCategoryLabel } from "@/lib/net-worth-category-label";
import { useSettingsContext } from "@/lib/settings-provider";
import { cn, formatDateISO, parseLocalDate } from "@/lib/utils";
import { AllocationDetailSheet } from "@/pages/holdings/components/allocation-detail-sheet";
import { CategoryDetailSheet } from "@/pages/net-worth/components/category-detail-sheet";
import { MomentumCard } from "@/pages/net-worth/components/momentum-card";
import { NetWorthAttention } from "@/pages/net-worth/components/net-worth-attention";
import {
  computeMomentum,
  computeVelocity,
  deriveChange,
  formatChangePercent,
  investmentAllocation,
  isPlainPercent,
  parseHistory,
  seriesFor,
  type Change,
  type ParsedNetWorth,
  type SelectedCategory,
} from "@/pages/net-worth/components/utils";
import { VelocityCard } from "@/pages/net-worth/components/velocity-card";
import {
  getInitialIntervalData,
  Icons,
  IntervalSelector,
  useNumberFormatting,
  type TimePeriod,
} from "@wealthfolio/ui";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@wealthfolio/ui/components/ui/tooltip";

import { WealthCheckCard } from "./wealth-check-card";
import {
  ChangeChip,
  Hero,
  HeroChart,
  MeadowTab,
  periodWords,
  sentence,
  signedPercent,
  useMoney,
} from "./parts";

const DEFAULT_INTERVAL: TimePeriod = "ALL";
const INTERVAL_STORAGE_KEY = "networth-interval";
const MS_PER_DAY = 86_400_000;

// Category marks: Meadow's category colours (Bronze swaps in its own distinct set).
const CATEGORY_MARK: Record<string, { color: string; icon: keyof typeof Icons }> = {
  properties: { color: "var(--m-cat-1)", icon: "Home" },
  investments: { color: "var(--m-cat-4)", icon: "TrendingUp" },
  cash: { color: "var(--m-cat-7)", icon: "Wallet" },
  vehicles: { color: "var(--m-cat-8)", icon: "Car" },
  preciousMetals: { color: "var(--m-cat-5)", icon: "Coins" },
  collectibles: { color: "var(--m-cat-6)", icon: "Gem" },
  otherAssets: { color: "var(--m-cat-other)", icon: "Package" },
};

function Mark({ color, icon }: { color: string; icon: keyof typeof Icons }) {
  const Glyph = (Icons[icon] ?? Icons.Circle) as React.ComponentType<{ className?: string }>;
  return (
    <span
      aria-hidden
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] max-md:h-[26px] max-md:w-[26px]"
      style={{ background: `color-mix(in srgb, ${color} var(--m-tint), transparent)`, color }}
    >
      <Glyph className="h-3.5 w-3.5" />
    </span>
  );
}

// A debt's own picture in the same tile as a Mark: a loan's icon (components/alt-asset-icon.tsx),
// a card's bank logo; the category drawing when it has none.
const TILE = "h-7 w-7 rounded-[10px] max-md:h-[26px] max-md:w-[26px]";

function RowMark({ row }: { row: RowData }) {
  const mark = <Mark {...row.mark} />;
  if (row.logoUrl) return <RoundLogo url={row.logoUrl} name={row.name} className={TILE} />;
  if (row.assetId) {
    return <AltAssetIcon assetId={row.assetId} name={row.name} className={TILE} fallback={mark} />;
  }
  return mark;
}

export function MeadowNetWorthTab() {
  const { t } = useTranslation();
  const formatting = useNumberFormatting();
  const { settings } = useSettingsContext();
  const isMobile = useIsMobileViewport();
  const currentDateISO = formatZonedDateKey(new Date(), settings?.timezone);
  const { data: netWorthData, isLoading, isError, error } = useNetWorth({ date: currentDateISO });

  const [periodCode, setPeriodCode] = usePersistentState<TimePeriod>(
    INTERVAL_STORAGE_KEY,
    DEFAULT_INTERVAL,
  );
  const currentDate = useMemo(() => parseLocalDate(currentDateISO), [currentDateISO]);
  const dateRange = useMemo(
    () => getInitialIntervalData(periodCode, currentDate).range,
    [periodCode, currentDate],
  );
  const historyDates = useMemo(() => {
    if (!dateRange?.from) return null;
    const endDate = dateRange.to ?? currentDate;
    return { startDate: formatDateISO(dateRange.from), endDate: formatDateISO(endDate) };
  }, [currentDate, dateRange]);
  const longHistoryDates = useMemo(() => {
    if (!dateRange?.from || periodCode === "ALL") return null;
    const end = dateRange.to ?? currentDate;
    const rangeMs = end.getTime() - dateRange.from.getTime();
    const priorStart = new Date(dateRange.from.getTime() - rangeMs);
    const yearStart = new Date(end.getTime() - 366 * MS_PER_DAY);
    const start = priorStart < yearStart ? priorStart : yearStart;
    return { startDate: formatDateISO(start), endDate: formatDateISO(end) };
  }, [currentDate, dateRange, periodCode]);
  const { data: historyData, isLoading: isHistoryLoading } = useNetWorthHistory({
    startDate: historyDates?.startDate ?? "",
    endDate: historyDates?.endDate ?? "",
    enabled: !!historyDates,
  });
  const { data: longHistoryData } = useNetWorthHistory({
    startDate: longHistoryDates?.startDate ?? "",
    endDate: longHistoryDates?.endDate ?? "",
    enabled: !!longHistoryDates,
  });

  const parsedData = useMemo((): ParsedNetWorth | null => {
    if (!netWorthData) return null;
    return {
      netWorth: parseFloat(netWorthData.netWorth) || 0,
      assets: {
        total: parseFloat(netWorthData.assets.total) || 0,
        breakdown: (netWorthData.assets.breakdown || []).map((item) => ({
          category: item.category,
          name: getNetWorthCategoryLabel(t, item.category, item.name),
          value: parseFloat(item.value) || 0,
          assetId: item.assetId,
          children: (item.children ?? []).map((child) => ({
            category: child.category,
            name: child.name,
            value: parseFloat(child.value) || 0,
            assetId: child.assetId,
          })),
        })),
      },
      liabilities: {
        total: parseFloat(netWorthData.liabilities.total) || 0,
        breakdown: (netWorthData.liabilities.breakdown || []).map((item) => ({
          category: item.category,
          name: item.name,
          value: parseFloat(item.value) || 0,
          assetId: item.assetId,
        })),
      },
    };
  }, [netWorthData, t]);

  const parsedHistory = useMemo(() => parseHistory(historyData), [historyData]);
  const longHistory = useMemo(() => parseHistory(longHistoryData), [longHistoryData]);
  const velocity = useMemo(() => computeVelocity(parsedHistory), [parsedHistory]);
  const trailingYearMonthly = useMemo(() => {
    if (periodCode === "ALL" || !velocity) return undefined;
    const cutoff = formatDateISO(new Date(currentDate.getTime() - 366 * MS_PER_DAY));
    const trailing = computeVelocity(longHistory.filter((point) => point.date >= cutoff));
    const yearAgo = formatDateISO(new Date(currentDate.getTime() - 365 * MS_PER_DAY));
    if (!trailing || trailing.startDate > yearAgo) return undefined;
    if (trailing.months - velocity.months < 1) return undefined;
    return trailing.perMonth;
  }, [longHistory, periodCode, currentDate, velocity]);
  const momentum = useMemo(() => {
    if (!historyDates || periodCode === "ALL") return null;
    return computeMomentum(longHistory, historyDates.startDate, historyDates.endDate);
  }, [longHistory, historyDates, periodCode]);
  const netWorthChange = useMemo(
    () =>
      deriveChange(
        parsedHistory.map((p) => p.netWorth),
        false,
      ),
    [parsedHistory],
  );
  const showChangeRatio =
    parsedHistory.length >= 2 &&
    parsedHistory[0].netWorth > 0 &&
    parsedHistory[parsedHistory.length - 1].netWorth >= 0;

  const currency = netWorthData?.currency || settings?.baseCurrency || "USD";
  const money = useMoney(currency);
  const localizedPeriodLabel = t(`ui:interval.${periodCode}`);

  const [selected, setSelected] = useState<SelectedCategory | null>(null);
  const { allocations } = usePortfolioAllocations({ type: "all" });
  const investmentsAlloc = useMemo(
    () => investmentAllocation(allocations?.assetClasses),
    [allocations],
  );

  const chartData = useMemo(
    () =>
      parsedHistory.map((p) => ({
        date: p.date,
        value: p.netWorth,
        assets: p.totalAssets,
        liabilities: p.totalLiabilities,
      })),
    [parsedHistory],
  );

  if (isError && error) {
    return (
      <MeadowTab>
        <div className="rounded-[20px] border border-[var(--m-line)] bg-[var(--m-surface)] px-[18px] py-4">
          <p className="text-[var(--m-down)]">{t("insights:networth.failed_to_load")}</p>
          <p className="mt-1 text-[12.5px] text-[var(--m-muted)]">{error?.message}</p>
        </div>
      </MeadowTab>
    );
  }

  const up = netWorthChange.amount >= 0;
  const chip = showChangeRatio
    ? isPlainPercent(netWorthChange.percent)
      ? signedPercent(netWorthChange.percent)
      : formatChangePercent(netWorthChange, t("insights:networth.breakdown_table.new"), formatting)
    : null;
  const stale = netWorthData?.staleAssets ?? [];

  const heroNumbers = (
    <div className="flex min-w-0 flex-col gap-1.5 max-md:gap-0.5">
      <div className="flex flex-wrap items-center gap-2.5">
        {isLoading ? (
          <Skeleton className="h-10 w-48" />
        ) : (
          <span
            data-m-num={isMobile ? "big" : "hero"}
            className="text-[38px] font-medium leading-[1.1] tracking-[-0.03em] max-md:text-[30px]"
          >
            {money.whole(parsedData?.netWorth ?? 0)}
          </span>
        )}
        {chip && !isHistoryLoading ? (
          <ChangeChip value={netWorthChange.amount} text={chip} />
        ) : null}
        {stale.length > 0 ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--m-warn-soft)] text-[var(--m-warn)]"
                  aria-label={t("insights:networth.stale_valuations_tooltip")}
                >
                  <Icons.AlertCircle className="h-4 w-4" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[280px]">
                <p className="mb-2 text-xs font-medium">
                  {t("insights:networth.stale_valuations_tooltip")}
                </p>
                <ul className="space-y-1 text-xs">
                  {stale.map((asset) => (
                    <li key={asset.assetId} className="flex items-center justify-between gap-2">
                      <span className="truncate">{asset.name ?? asset.assetId}</span>
                      <span className="text-muted-foreground shrink-0">
                        {t("insights:networth.days_ago", { count: asset.daysStale })}
                      </span>
                    </li>
                  ))}
                </ul>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>
      {isHistoryLoading ? (
        <Skeleton className="h-4 w-56" />
      ) : parsedHistory.length >= 2 ? (
        <span className="text-[13.5px] text-[var(--m-mint-muted)] max-md:text-[12.5px]">
          {up ? "Up" : "Down"} {money.cents(Math.abs(netWorthChange.amount))},{" "}
          {periodWords(localizedPeriodLabel)}
        </span>
      ) : null}
    </div>
  );

  const chart = isHistoryLoading ? (
    <Skeleton className="h-[150px] w-full rounded-xl" />
  ) : chartData.length > 1 ? (
    <HeroChart
      data={chartData}
      height={isMobile ? 96 : 156}
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
              <span>{t("insights:networth.chart.net_worth_label")}</span>
              <span className="tabular-nums">{money.cents(point.value)}</span>
            </span>
            {point.liabilities > 0 ? (
              <>
                <span className="flex justify-between gap-4 text-[var(--m-muted)]">
                  <span>{t("insights:networth.chart.assets_label")}</span>
                  <span className="tabular-nums">{money.cents(point.assets)}</span>
                </span>
                <span className="flex justify-between gap-4 text-[var(--m-muted)]">
                  <span>{t("insights:networth.chart.liabilities_label")}</span>
                  <span className="tabular-nums">−{money.cents(point.liabilities)}</span>
                </span>
              </>
            ) : null}
          </div>
        );
      }}
    />
  ) : (
    <p className="py-6 text-center text-[12.5px] text-[var(--m-mint-muted)]">
      {t("insights:networth.no_history_data")}
    </p>
  );

  return (
    <MeadowTab>
      {historyData && historyData.length > 0 ? (
        <div className="flex justify-end">
          <IntervalSelector
            className="w-auto max-w-full"
            value={periodCode}
            onIntervalSelect={(code) => setPeriodCode(code)}
            isLoading={isHistoryLoading}
          />
        </div>
      ) : null}

      <Hero label="Net worth">
        <div className="flex flex-wrap items-stretch gap-x-8 gap-y-3 max-md:flex-col max-md:gap-1.5">
          <div className="flex min-w-[240px] flex-[0_1_360px] flex-col gap-3 max-md:min-w-0 max-md:flex-none max-md:gap-1.5">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-medium">
                {sentence(t("insights:networth.breakdown_table.net_worth"))}
              </h2>
              <span className="text-[12.5px] text-[var(--m-mint-muted)]">
                as of{" "}
                {new Date(`${currentDateISO}T12:00:00`).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
            {heroNumbers}
          </div>
          <div className="min-w-0 flex-[1_1_480px] max-md:flex-none">{chart}</div>
        </div>
      </Hero>

      <div className="grid grid-cols-1 items-start gap-3.5 max-md:gap-2 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          {isLoading || isHistoryLoading ? (
            <DashboardCard title={t("insights:networth.breakdown")}>
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            </DashboardCard>
          ) : parsedData ? (
            <Breakdown
              data={parsedData}
              history={parsedHistory}
              currency={currency}
              periodLabel={periodWords(localizedPeriodLabel)}
              onSelect={setSelected}
            />
          ) : (
            <div className="rounded-[20px] border border-[var(--m-line)] bg-[var(--m-surface)] px-[18px] py-4 text-center">
              <p className="text-sm">{t("insights:networth.no_assets_found")}</p>
              <Link
                to="/holdings"
                className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--m-muted)] underline-offset-4 hover:underline"
              >
                {t("insights:networth.add_first_asset")}
                <Icons.ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-3.5 max-md:gap-2">
          {velocity ? (
            <VelocityCard
              velocity={velocity}
              trailingYearMonthly={trailingYearMonthly}
              currency={currency}
              periodLabel={sentence(localizedPeriodLabel)}
            />
          ) : null}
          {momentum ? (
            <MomentumCard momentum={momentum} currency={currency} periodLabel={periodCode} />
          ) : null}
          {parsedData ? (
            <WealthCheckCard netWorth={parsedData.netWorth} currency={currency} asOf={currentDateISO} />
          ) : null}
          <NetWorthAttention staleAssets={stale} />
        </div>
      </div>

      <AllocationDetailSheet
        isOpen={!!selected && selected.isInvestment}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        allocation={investmentsAlloc}
        accountFilter={{ type: "all" }}
        baseCurrency={currency}
      />
      <CategoryDetailSheet
        open={!!selected && !selected.isInvestment}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        selected={selected}
        history={parsedHistory}
        currency={currency}
        periodLabel={periodCode}
      />
    </MeadowTab>
  );
}

// ---------------------------------------------------------------- Breakdown

const GRID = "grid grid-cols-[minmax(0,1fr)_64px_84px_minmax(120px,150px)] items-center gap-x-3";

function ChangeCell({
  change,
  currency,
  newLabel,
}: {
  change: Change;
  currency: string;
  newLabel: string;
}) {
  const money = useMoney(currency);
  const formatting = useNumberFormatting();
  const zero = Math.abs(change.amount) < 0.005;
  return (
    <span className="flex items-baseline justify-end gap-2 whitespace-nowrap text-[13px] tabular-nums max-md:text-[12px]">
      <span
        className={cn(
          zero
            ? "text-[var(--m-muted)]"
            : change.amount > 0
              ? "text-[var(--m-up)]"
              : "text-[var(--m-down)]",
        )}
      >
        {zero ? "" : change.amount > 0 ? "+" : "−"}
        {money.short(Math.abs(change.amount))}
      </span>
      <span className="min-w-[44px] text-right text-[var(--m-muted)]">
        {formatChangePercent(change, newLabel, formatting)}
      </span>
    </span>
  );
}

interface RowData {
  key: string;
  name: string;
  mark: { color: string; icon: keyof typeof Icons };
  /** money-hub: a loan's asset id, for its icon. */
  assetId?: string;
  /** money-hub: a card's bank logo. */
  logoUrl?: string | null;
  share: number;
  value: number;
  negative?: boolean;
  change: Change;
  onClick?: () => void;
}

function BreakdownRow({
  row,
  currency,
  newLabel,
  phone,
}: {
  row: RowData;
  currency: string;
  newLabel: string;
  phone: boolean;
}) {
  const money = useMoney(currency);
  const value = `${row.negative && row.value !== 0 ? "−" : ""}${money.short(row.value)}`;
  const inner = phone ? (
    <>
      <RowMark row={row} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{row.name}</span>
        <span className="text-[12px] text-[var(--m-muted)]">
          {row.share.toFixed(1)}% of {row.negative ? "debt" : "assets"}
        </span>
      </span>
      <span className="flex flex-col items-end">
        <span className="font-medium tabular-nums">{value}</span>
        <ChangeCell change={row.change} currency={currency} newLabel={newLabel} />
      </span>
    </>
  ) : (
    <>
      <span className="flex min-w-0 items-center gap-2.5">
        <RowMark row={row} />
        <span className="truncate">{row.name}</span>
      </span>
      <span className="text-right tabular-nums text-[var(--m-muted)]">{row.share.toFixed(1)}%</span>
      <span className="text-right font-medium tabular-nums">{value}</span>
      <ChangeCell change={row.change} currency={currency} newLabel={newLabel} />
    </>
  );
  const cls = cn(
    phone ? "flex min-h-[44px] items-center gap-2.5 py-1" : `${GRID} min-h-[46px]`,
    "w-full border-t border-[var(--m-line-soft)] text-left text-[13.5px]",
    row.onClick && "rounded-none hover:bg-[var(--m-tile)]",
  );
  return row.onClick ? (
    <button type="button" onClick={row.onClick} className={cls}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function SectionHead({
  open,
  onToggle,
  label,
  total,
  tone,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  total: string;
  tone: "up" | "down";
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex min-h-10 w-full items-center gap-2 text-left max-md:min-h-[34px]"
    >
      {open ? (
        <Icons.ChevronDown className="h-4 w-4 text-[var(--m-muted)]" />
      ) : (
        <Icons.ChevronRight className="h-4 w-4 text-[var(--m-muted)]" />
      )}
      <span className="flex-1 font-medium">{label}</span>
      <span
        data-m-num="tile"
        className={cn(
          "text-[17px] font-medium tabular-nums",
          tone === "up" ? "text-[var(--m-up)]" : "text-[var(--m-down)]",
        )}
      >
        {total}
      </span>
    </button>
  );
}

function Breakdown({
  data,
  history,
  currency,
  periodLabel,
  onSelect,
}: {
  data: ParsedNetWorth;
  history: ReturnType<typeof parseHistory>;
  currency: string;
  periodLabel: string;
  onSelect: (s: SelectedCategory) => void;
}) {
  const { t } = useTranslation();
  const phone = useIsMobileViewport();
  const money = useMoney(currency);
  const newLabel = t("insights:networth.breakdown_table.new");
  const { accounts } = useAccounts({ filterActive: false });
  // A card's row is "CREDIT_CARD:<account id>" (the server's net worth); anything else is a loan's asset.
  const debtPicture = (assetId?: string): Pick<RowData, "assetId" | "logoUrl"> => {
    const card = assetId?.match(/^CREDIT_CARD:(.+)$/)?.[1];
    if (card) return { logoUrl: accountLogoUrl(accounts.find((a) => a.id === card)) };
    return { assetId };
  };
  const [assetsOpen, setAssetsOpen] = useState(true);
  const [debtsOpen, setDebtsOpen] = useState(true);
  const hasDebts = data.liabilities.total > 0 || data.liabilities.breakdown.length > 0;
  const total = deriveChange(
    history.map((p) => p.netWorth),
    false,
  );

  const assets: RowData[] = data.assets.breakdown.map((item) => ({
    key: item.category,
    name: item.name,
    mark: CATEGORY_MARK[item.category] ?? CATEGORY_MARK.otherAssets,
    share: data.assets.total > 0 ? (item.value / data.assets.total) * 100 : 0,
    value: item.value,
    change: deriveChange(seriesFor(history, item.category), false),
    onClick: () =>
      onSelect({
        key: item.category,
        name: item.name,
        value: item.value,
        isLiability: false,
        isInvestment: item.category === "investments",
        children: item.children ?? [],
      }),
  }));
  const debts: RowData[] = data.liabilities.breakdown.map((item, index) => ({
    key: item.assetId ?? `${item.category}-${index}`,
    name: item.name,
    mark: {
      color: "var(--m-down)",
      icon: /card/i.test(item.assetId ?? "") ? "CreditCard" : "Building",
    },
    ...debtPicture(item.assetId),
    share: data.liabilities.total > 0 ? (item.value / data.liabilities.total) * 100 : 0,
    value: item.value,
    negative: true,
    change: deriveChange(item.assetId ? seriesFor(history, item.assetId) : [], true),
    onClick: item.assetId
      ? () =>
          onSelect({
            key: item.assetId!,
            name: item.name,
            value: item.value,
            isLiability: true,
            isInvestment: false,
            children: [],
          })
      : undefined,
  }));
  const segments = data.assets.breakdown
    .filter((i) => i.value > 0 && data.assets.total > 0)
    .map((i) => ({
      key: i.category,
      name: i.name,
      pct: (i.value / data.assets.total) * 100,
      color: (CATEGORY_MARK[i.category] ?? CATEGORY_MARK.otherAssets).color,
    }))
    .sort((a, b) => b.pct - a.pct);

  const debtRows = debts.map((r) => (
    <BreakdownRow key={r.key} row={r} currency={currency} newLabel={newLabel} phone={phone} />
  ));

  return (
    <DashboardCard
      title={t("insights:networth.breakdown")}
      action={
        <span className="text-[12.5px] text-[var(--m-muted)]">Change over {periodLabel}</span>
      }
    >
      <div className="flex flex-col">
        <SectionHead
          open={assetsOpen}
          onToggle={() => setAssetsOpen(!assetsOpen)}
          label={t("insights:networth.breakdown_table.assets")}
          total={money.short(data.assets.total)}
          tone="up"
        />
        {segments.length ? (
          <div
            role="img"
            aria-label={segments.map((s) => `${s.name} ${s.pct.toFixed(1)}%`).join(", ")}
            className="mb-2 mt-1 flex h-3 gap-[3px] max-md:h-2.5"
          >
            {segments.map((s) => (
              <span
                key={s.key}
                title={`${s.name} ${s.pct.toFixed(1)}%`}
                className="h-full rounded-[6px]"
                style={{ width: `${s.pct}%`, minWidth: 3, background: s.color }}
              />
            ))}
          </div>
        ) : null}
        {assetsOpen ? (
          <>
            {!phone ? (
              <div className={`${GRID} min-h-8 text-[12px] text-[var(--m-muted)]`}>
                <span>{t("insights:networth.breakdown_table.category")}</span>
                <span className="text-right">Share</span>
                <span className="text-right">{t("insights:networth.breakdown_table.value")}</span>
                <span className="text-right">Change</span>
              </div>
            ) : null}
            {assets.map((r) => (
              <BreakdownRow
                key={r.key}
                row={r}
                currency={currency}
                newLabel={newLabel}
                phone={phone}
              />
            ))}
          </>
        ) : null}

        {hasDebts ? (
          <>
            <div className="my-2 flex items-center gap-2.5 max-md:my-1">
              <span className="w-4 text-center text-[var(--m-muted)]">−</span>
              <span className="h-px flex-1 bg-[var(--m-line)]" />
            </div>
            <SectionHead
              open={debtsOpen}
              onToggle={() => setDebtsOpen(!debtsOpen)}
              label={t("insights:networth.breakdown_table.liabilities")}
              total={`−${money.short(data.liabilities.total)}`}
              tone="down"
            />
            {debtsOpen ? (
              phone ? (
                <PhoneFold
                  id="networth-debts"
                  closedLabel={`${debts.length} debts`}
                  openLabel="Hide the debts"
                >
                  {debtRows}
                </PhoneFold>
              ) : (
                debtRows
              )
            ) : null}
          </>
        ) : null}

        <div
          className={cn(
            phone ? "flex min-h-[44px] items-center gap-2.5 px-2.5" : `${GRID} min-h-12 px-3`,
            "mt-3 rounded-[14px] bg-[var(--m-sand)] max-md:mt-2",
          )}
        >
          <span className="flex items-center gap-2.5 font-medium">
            <span className="w-4 text-center font-normal text-[var(--m-muted)]">=</span>
            {sentence(t("insights:networth.breakdown_table.net_worth"))}
          </span>
          {phone ? <span className="flex-1" /> : <span />}
          <span data-m-num="tile" className="text-right text-[17px] font-medium tabular-nums">
            {money.short(data.netWorth)}
          </span>
          <ChangeCell change={total} currency={currency} newLabel={newLabel} />
        </div>
      </div>
    </DashboardCard>
  );
}
