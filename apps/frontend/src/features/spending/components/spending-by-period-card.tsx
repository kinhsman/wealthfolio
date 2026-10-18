import { useMemo } from "react";

import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { cn } from "@/lib/utils";
import { Icons, Skeleton, useAmountFormatting, useDateFormatting } from "@wealthfolio/ui";

export interface PeriodBar {
  key: string;
  label: string;
  sortKey: string;
  value: number;
  future: boolean;
}

type Granularity = "day" | "week" | "month";

const UNIT: Record<Granularity, { one: string; many: string }> = {
  day: { one: "day", many: "days" },
  week: { one: "week", many: "weeks" },
  month: { one: "month", many: "months" },
};

/** A bar this many times a middle one, and over the average line, stands out even when nothing is cut. */
const STANDOUT_TIMES = 4;

/** A round step for a scale of three lines: 1, 2, 2.5 or 5 times a power of ten. */
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= raw) return m * mag;
  return 10 * mag;
}

/**
 * The top of the Spending by day scale. Usually the biggest bar; when a day is far above the rest it is
 * the usual top (the 85th percentile or the average, whichever is higher) plus a little, and the big day
 * is cut there. "Far above" is twice the 85th percentile, or four times a middle day, whichever is lower.
 * `sorted` is the days' amounts, smallest first.
 */
export function dayScale(
  sorted: number[],
  avgValue: number,
): { top: number; step: number; outliers: boolean } {
  const max = sorted[sorted.length - 1];
  const usual = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.85))];
  const middle = sorted[Math.floor((sorted.length - 1) / 2)];
  const line = Math.min(usual * 2, middle * STANDOUT_TIMES);
  const outliers = sorted.length >= 4 && max > line;
  const step = niceStep((outliers ? Math.max(line / 2, avgValue) * 1.15 : max) / 3);
  return { top: step * 3, step, outliers };
}

/**
 * money-hub patch: the Spending by day chart, Meadow (owner picked design 5 on 10-02). A short plot
 * (150px) with a $ scale. One or two huge days (the mortgage, a flight) used to flatten every other
 * bar, so a bar far above the rest is cut at the top of the scale with its amount over it. A sentence
 * above says what the chart shows; the legend sits below.
 */
export function SpendingByPeriodCard({
  barData,
  avgValue,
  avgLabel,
  granularity,
  isLoading,
  currency,
  rangeLabel,
  onOpen,
  fill = false,
}: {
  /** money-hub patch (owner, 10-11): as tall as the card beside it, the bars taking the extra height. */
  fill?: boolean;
  barData: PeriodBar[];
  avgValue: number;
  avgLabel: string;
  granularity: Granularity;
  isLoading: boolean;
  currency: string;
  rangeLabel?: string;
  onOpen: (bar: PeriodBar) => void;
}) {
  const formatting = useAmountFormatting();
  const dates = useDateFormatting();
  const { isBalanceHidden } = useBalancePrivacy();
  const unit = UNIT[granularity];
  // money-hub patch: on a phone this card (under More) folds to its title and its one-line verdict; the
  // title row opens the chart (approved phone design, 10-02). Remembered on the device.
  const isMobile = useIsMobileViewport();
  const [phoneOpen, setPhoneOpen] = usePersistentState<boolean>("dashboard-fold-by-day", false);
  const showChart = !isMobile || phoneOpen;

  const money = (v: number) =>
    isBalanceHidden ? "••••" : formatting.formatRoundedAmount(v, currency);

  const nameOf = (bar: PeriodBar) => {
    if (granularity === "month") {
      return dates.formatCalendarDate(`${bar.key}-01`, { month: "short", year: "numeric" });
    }
    const day = dates.formatCalendarDate(bar.key, { month: "short", day: "numeric" });
    return granularity === "week" ? `the week of ${day}` : day;
  };

  const chart = useMemo(() => {
    const past = barData.filter((b) => !b.future);
    const spent = past.filter((b) => b.value > 0).map((b) => b.value);
    if (spent.length === 0) return null;
    const sorted = [...spent].sort((a, b) => a - b);
    const max = sorted[sorted.length - 1];
    // money-hub patch (owner, 10-18): a day over four times a middle day is cut at the top of the scale
    // too, so a few bill days (which lift the 85th percentile) no longer flatten the usual days.
    const { top, step } = dayScale(sorted, avgValue);
    const tall = past.filter((b) => b.value > top).sort((a, b) => b.value - a.value);
    // money-hub patch (owner, 10-17: "No day stands out" beside a $3,138 day): a few bill days lift the
    // 85th percentile, so no bar gets cut. What stands out is measured against a middle day instead.
    const middle = sorted[Math.floor((sorted.length - 1) / 2)];
    const standouts =
      sorted.length >= 4
        ? past
            .filter((b) => b.value > middle * STANDOUT_TIMES && b.value > avgValue)
            .sort((a, b) => b.value - a.value)
        : [];
    return { top, step, tall, max, middle, standouts };
  }, [barData, avgValue]);

  // money-hub patch (owner, 10-18): the days that stand out (cut or not) are drawn in orange.
  const bigKeys = useMemo(
    () => new Set([...(chart?.tall ?? []), ...(chart?.standouts ?? [])].map((b) => b.key)),
    [chart],
  );

  const todayKey = useMemo(() => {
    const last = [...barData].reverse().find((b) => !b.future);
    return barData.some((b) => b.future) ? last?.key : undefined;
  }, [barData]);

  // Two cut bars close together would print their amounts over each other ("$2.6K$853" on a phone):
  // the second goes up a line.
  const capRow = useMemo(() => {
    const rows = new Map<string, number>();
    if (!chart) return rows;
    const near = isMobile ? 5 : 2;
    let lastIdx = -99;
    let lastRow = 1;
    barData.forEach((b, i) => {
      if (b.future || b.value <= chart.top) return;
      const row = i - lastIdx < near && lastRow === 0 ? 1 : 0;
      rows.set(b.key, row);
      lastIdx = i;
      lastRow = row;
    });
    return rows;
  }, [barData, chart, isMobile]);
  const twoCapRows = [...capRow.values()].some((r) => r === 1);

  // Up to six labels under the bars; for days, one a week starting on the first.
  const labelEvery = granularity === "day" ? 7 : Math.max(1, Math.ceil(barData.length / 6));
  const hasFuture = barData.some((b) => b.future);

  // money-hub patch (owner, 10-18): when one day is a big share of the period, say how big.
  const periodTotal = barData.reduce((sum, b) => (b.future ? sum : sum + Math.max(0, b.value)), 0);
  const shareNote = (biggest: PeriodBar | undefined) => {
    if (!biggest || periodTotal <= 0) return "";
    const share = biggest.value / periodTotal;
    return share >= 0.25
      ? ` That one ${unit.one} is ${Math.round(share * 100)}% of the ${granularity === "month" ? "total" : "spending"}.`
      : "";
  };

  const verdict = (() => {
    if (!chart) return null;
    const { tall, top, middle, standouts } = chart;
    if (tall.length === 0) {
      if (standouts.length > 0 && standouts.length <= 3) {
        const names = standouts.map((b) => `${nameOf(b)} (${money(b.value)})`);
        const list =
          names.length === 1
            ? names[0]
            : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
        return `${list} ${standouts.length === 1 ? "stands" : "stand"} out. A usual ${unit.one} is about ${money(middle)}.${shareNote(standouts[0])}`;
      }
      if (standouts.length > 3) {
        return `${standouts.length} ${unit.many} stand out, the biggest ${nameOf(standouts[0])} at ${money(standouts[0].value)}. A usual ${unit.one} is about ${money(middle)}.`;
      }
      const biggest = barData.reduce((a, b) => (b.value > a.value ? b : a), barData[0]);
      return `No ${unit.one} stands out. The biggest was ${nameOf(biggest)} at ${money(biggest.value)}.`;
    }
    const lead = `Most ${unit.many} stay under ${money(top)}.`;
    if (tall.length <= 3) {
      const names = tall.map((b) => `${nameOf(b)} (${money(b.value)})`);
      const list =
        names.length === 1
          ? names[0]
          : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
      return `${lead} The tall ${tall.length === 1 ? "bar is" : "bars are"} ${list}.${shareNote(tall[0])}`;
    }
    return `${lead} ${tall.length} ${unit.many} went over, the biggest ${nameOf(tall[0])} at ${money(tall[0].value)}.${shareNote(tall[0])}`;
  })();

  return (
    <section
      data-m="card"
      className="border-border flex min-w-0 flex-col gap-2.5 rounded-[20px] border bg-[var(--m-surface)] px-[18px] py-4 max-md:gap-1.5 max-md:px-3 max-md:py-1"
    >
      {isMobile ? (
        <button
          type="button"
          onClick={() => setPhoneOpen(!phoneOpen)}
          aria-expanded={phoneOpen}
          data-m-foldhead
          className="-mx-3 flex min-h-10 w-[calc(100%+1.5rem)] max-w-none items-center justify-between gap-2.5 px-3 text-left"
        >
          <span className="flex min-w-0 items-baseline gap-2">
            <h2 className="text-foreground text-sm font-medium">Spending by {unit.one}</h2>
            {rangeLabel ? (
              <span className="text-muted-foreground truncate text-[12.5px]">{rangeLabel}</span>
            ) : null}
          </span>
          <span
            aria-hidden
            data-m-chev
            className="text-secondary-foreground flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--m-tile)]"
          >
            {phoneOpen ? (
              <Icons.ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <Icons.ChevronDown className="h-3.5 w-3.5" />
            )}
          </span>
        </button>
      ) : (
        <div className="flex items-baseline gap-2">
          <h2 className="text-foreground text-sm font-medium">Spending by {unit.one}</h2>
          {rangeLabel ? (
            <span className="text-muted-foreground text-[12.5px]">{rangeLabel}</span>
          ) : null}
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-[190px] w-full rounded-lg" />
      ) : !chart && !showChart ? (
        <p className="text-muted-foreground pb-2 text-[12.5px]">No spending in this period</p>
      ) : !chart ? (
        <div className="flex h-[150px] flex-col items-center justify-center">
          <Icons.CreditCard className="text-muted-foreground/30 mb-2 h-10 w-10" />
          <p className="text-muted-foreground text-sm">No spending in this period</p>
        </div>
      ) : (
        <>
          {verdict ? (
            <p className="text-foreground text-[13.5px] max-md:-mt-1 max-md:pb-2 max-md:text-[12.5px] max-md:text-[var(--m-ink-2)]">
              {verdict}
            </p>
          ) : null}
          {showChart ? (
            <>
              <div
                className={cn(
                  "relative ml-11 max-md:h-[132px]",
                  fill ? "min-h-[150px] flex-1" : "h-[150px]",
                  twoCapRows ? "mt-9" : "mt-5",
                )}
              >
                {[0, 1, 2, 3].map((i) => (
                  <div key={i}>
                    <div
                      className={cn(
                        "absolute inset-x-0 border-t",
                        i === 0 ? "border-[var(--m-line)]" : "border-[var(--m-line-soft)]",
                      )}
                      style={{ bottom: `${(i / 3) * 100}%` }}
                    />
                    <span
                      className="text-muted-foreground absolute -left-11 w-[38px] text-right text-[11px]"
                      style={{ bottom: `calc(${(i / 3) * 100}% - 7px)` }}
                    >
                      {isBalanceHidden
                        ? ""
                        : formatting.formatCompactAmount(chart.step * i, currency)}
                    </span>
                  </div>
                ))}
                <div className="absolute inset-0 flex items-end gap-[3px] sm:gap-[5px]">
                  {barData.map((b) => {
                    const capped = !b.future && b.value > chart.top;
                    const h = b.future
                      ? 2
                      : Math.max(
                          b.value > 0 ? 1.5 : 0,
                          (Math.min(b.value, chart.top) / chart.top) * 100,
                        );
                    const clickable = !b.future && b.value > 0;
                    return (
                      <button
                        key={b.key}
                        type="button"
                        disabled={!clickable}
                        onClick={() => clickable && onOpen(b)}
                        title={b.future ? nameOf(b) : `${nameOf(b)}: ${money(b.value)}`}
                        aria-label={b.future ? nameOf(b) : `${nameOf(b)}: ${money(b.value)}`}
                        className="group relative flex h-full min-w-0 flex-1 items-end justify-center disabled:cursor-default"
                      >
                        <span
                          className={cn(
                            "block w-[72%] max-w-[22px] rounded-t-[5px] transition-opacity",
                            clickable && "group-hover:opacity-80",
                          )}
                          style={{
                            height: `${h}%`,
                            background: b.future
                              ? "var(--m-line)"
                              : b.key === todayKey
                                ? "var(--m-chart-today)"
                                : bigKeys.has(b.key)
                                  ? "var(--m-chart-big, #fb923c)"
                                  : "var(--m-chart)",
                          }}
                        />
                        {capped ? (
                          <>
                            <span
                              className={cn(
                                "text-foreground absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px]",
                                capRow.get(b.key) === 1 ? "-top-[33px]" : "-top-[18px]",
                              )}
                            >
                              {isBalanceHidden
                                ? ""
                                : formatting.formatCompactAmount(b.value, currency)}
                            </span>
                            <span className="absolute inset-x-[8%] top-3 h-1 -skew-y-[16deg] bg-[var(--m-surface)]" />
                          </>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                {avgValue > 0 && avgValue < chart.top ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 border-t-[1.5px] border-dashed border-[var(--m-muted)]"
                    style={{ bottom: `${(avgValue / chart.top) * 100}%` }}
                  />
                ) : null}
              </div>
              <div className="ml-11 flex h-[15px] gap-[3px] sm:gap-[5px]">
                {barData.map((b, i) => (
                  // A label near the right end is anchored to its bar's right edge, so it never runs past
                  // the card ("Sep 29" did on a phone).
                  <span key={b.key} className="relative min-w-0 flex-1">
                    <span
                      className={cn(
                        "absolute top-0 whitespace-nowrap text-[11px]",
                        i >= barData.length - 3 ? "right-0" : "left-1/2 -translate-x-1/2",
                        b.key === todayKey ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {i % labelEvery === 0
                        ? granularity === "day"
                          ? dates.formatCalendarDate(b.key, { month: "short", day: "numeric" })
                          : b.label
                        : ""}
                    </span>
                  </span>
                ))}
              </div>
              <div className="text-secondary-foreground flex flex-wrap gap-x-[18px] gap-y-1 text-xs max-md:pb-2.5">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-[3px] bg-[var(--m-chart)]" />
                  Spent that {unit.one}
                </span>
                {bigKeys.size > 0 ? (
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-[3px] bg-[var(--m-chart-big,#fb923c)]" />
                    Stands out
                  </span>
                ) : null}
                {hasFuture ? (
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-[3px] bg-[var(--m-line)]" />
                    {unit.many.charAt(0).toUpperCase() + unit.many.slice(1)} still to come
                  </span>
                ) : null}
                {avgValue > 0 ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 border-t-[1.5px] border-dashed border-[var(--m-muted)]" />
                    {avgLabel.charAt(0).toUpperCase() + avgLabel.slice(1)}, {money(avgValue)}
                  </span>
                ) : null}
              </div>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
