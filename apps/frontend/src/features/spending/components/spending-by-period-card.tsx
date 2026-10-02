import { useMemo } from "react";

import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
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

/** A round step for a scale of three lines: 1, 2, 2.5 or 5 times a power of ten. */
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= raw) return m * mag;
  return 10 * mag;
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
}: {
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
    // The usual top: the 85th percentile. A bar more than twice that is an outlier and gets cut.
    const usual = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.85))];
    const outliers = sorted.length >= 4 && max > usual * 2;
    const step = niceStep((outliers ? Math.max(usual, avgValue) * 1.15 : max) / 3);
    const top = step * 3;
    const tall = past.filter((b) => b.value > top).sort((a, b) => b.value - a.value);
    return { top, step, tall, max };
  }, [barData, avgValue]);

  const todayKey = useMemo(() => {
    const last = [...barData].reverse().find((b) => !b.future);
    return barData.some((b) => b.future) ? last?.key : undefined;
  }, [barData]);

  // Up to six labels under the bars; for days, one a week starting on the first.
  const labelEvery = granularity === "day" ? 7 : Math.max(1, Math.ceil(barData.length / 6));
  const hasFuture = barData.some((b) => b.future);

  const verdict = (() => {
    if (!chart) return null;
    const { tall, top } = chart;
    if (tall.length === 0) {
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
      return `${lead} The tall ${tall.length === 1 ? "bar is" : "bars are"} ${list}.`;
    }
    return `${lead} ${tall.length} ${unit.many} went over, the biggest ${nameOf(tall[0])} at ${money(tall[0].value)}.`;
  })();

  return (
    <section className="border-border flex min-w-0 flex-col gap-2.5 rounded-[20px] border bg-[var(--m-surface)] px-[18px] py-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-foreground text-sm font-medium">Spending by {unit.one}</h2>
        {rangeLabel ? (
          <span className="text-muted-foreground text-[12.5px]">{rangeLabel}</span>
        ) : null}
      </div>

      {isLoading ? (
        <Skeleton className="h-[190px] w-full rounded-lg" />
      ) : !chart ? (
        <div className="flex h-[150px] flex-col items-center justify-center">
          <Icons.CreditCard className="text-muted-foreground/30 mb-2 h-10 w-10" />
          <p className="text-muted-foreground text-sm">No spending in this period</p>
        </div>
      ) : (
        <>
          {verdict ? <p className="text-foreground text-[13.5px]">{verdict}</p> : null}
          <div className="relative ml-11 mt-5 h-[150px]">
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
                  {isBalanceHidden ? "" : formatting.formatCompactAmount(chart.step * i, currency)}
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
                            ? "var(--m-forest-today)"
                            : "var(--m-forest)",
                      }}
                    />
                    {capped ? (
                      <>
                        <span className="text-foreground absolute -top-[18px] left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px]">
                          {isBalanceHidden ? "" : formatting.formatCompactAmount(b.value, currency)}
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
          <div className="ml-11 flex gap-[3px] sm:gap-[5px]">
            {barData.map((b, i) => (
              <span
                key={b.key}
                className={cn(
                  "min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[11px]",
                  b.key === todayKey ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {i % labelEvery === 0
                  ? granularity === "day"
                    ? dates.formatCalendarDate(b.key, { month: "short", day: "numeric" })
                    : b.label
                  : ""}
              </span>
            ))}
          </div>
          <div className="text-secondary-foreground flex flex-wrap gap-x-[18px] gap-y-1 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-[var(--m-forest)]" />
              Spent that {unit.one}
            </span>
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
      )}
    </section>
  );
}
