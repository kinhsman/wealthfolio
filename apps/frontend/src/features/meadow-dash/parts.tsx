// money-hub patch: the pieces the Investments and Net worth tabs share in the Spending dashboard's look
// (Meadow, or Bronze Titanium per mode; owner picked the redesign on the canvas "Money app pages, Meadow
// and Bronze Titanium", 10-02). The page sits inside `.meadow`, so the --m-* colours and both skins apply;
// money up / down and chart colours come from --m-up, --m-down and --m-chart (Bronze gives data its own).
import { useMemo, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useDashboardSkins } from "@/features/spending/lib/dashboard-skin";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { cn } from "@/lib/utils";
import { Icons, useAmountFormatting, useDisplayCurrency } from "@wealthfolio/ui";

/** The tab's page: Meadow (or Bronze) ground, the same paddings and gaps as the Spending tab. */
export function MeadowTab({ children, className }: { children: ReactNode; className?: string }) {
  const skins = useDashboardSkins();
  return (
    <div
      data-mdash
      data-light-skin={skins.light}
      data-dark-skin={skins.dark}
      className={cn(
        "meadow flex min-h-screen flex-col gap-3.5 px-3 pb-[var(--mobile-nav-total-offset)] pt-2 max-md:gap-2 md:px-6 md:pb-8 lg:px-8",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The one answer of the tab, on the mint (Meadow) or glowing (Bronze) hero. */
export function Hero({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <section
      data-m="hero"
      aria-label={label}
      className={cn(
        "flex flex-col gap-3 rounded-[20px] bg-[var(--m-mint)] px-5 py-4 text-[var(--m-mint-ink)] max-md:gap-1.5 max-md:px-3 max-md:py-2.5",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Money as a figure: the app's currency format, hidden like every amount when privacy is on. */
export function useMoney(ownCurrency: string) {
  const { isBalanceHidden } = useBalancePrivacy();
  const formatting = useAmountFormatting();
  // money-hub patch: in the sidebar's currency (USD or VND) at the app's rate; dong has no cents.
  const display = useDisplayCurrency();
  return useMemo(() => {
    const { value: rate, currency } = display.convert(1, ownCurrency);
    const digits = Math.min(2, formatting.currencyFractionDigits(currency));
    const whole = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    });
    const cents = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    const hide = (s: string) => (isBalanceHidden ? "••••" : s);
    return {
      hidden: isBalanceHidden,
      whole: (v: number) => hide(whole.format(v * rate)),
      cents: (v: number) => hide(cents.format(v * rate)),
      /** The app's compact amount ($17K, $1.22M), the same as the stock tabs show. */
      short: (v: number) => hide(formatting.formatCompactAmount(v, ownCurrency, true, "narrowSymbol")),
      /** "$537,804" and ".21" apart, so the cents can be quieter. */
      split: (v: number) => {
        const s = cents.format(v * rate);
        const dot = s.lastIndexOf(".");
        return isBalanceHidden
          ? { main: "$•••••••", rest: "" }
          : dot < 0
            ? { main: s, rest: "" }
            : { main: s.slice(0, dot), rest: s.slice(dot) };
      },
    };
  }, [ownCurrency, isBalanceHidden, formatting, display]);
}

/** A change chip: green up, red down (Bronze's data colours; Meadow's forest and red). */
export function ChangeChip({ value, text }: { value: number; text: string }) {
  const up = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] tabular-nums",
        up
          ? "bg-[var(--m-good-soft)] text-[var(--m-up)]"
          : "bg-[color-mix(in_srgb,var(--m-down)_14%,transparent)] text-[var(--m-down)]",
      )}
    >
      {up ? (
        <Icons.TrendingUp className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Icons.TrendingDown className="h-3.5 w-3.5" aria-hidden />
      )}
      {text}
    </span>
  );
}

/** A quiet button on the hero (Update prices, Refresh full history). */
export function HeroButton({
  children,
  onClick,
  busy,
  icon,
  label,
}: {
  children?: ReactNode;
  onClick: () => void;
  busy?: boolean;
  icon: ReactNode;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-full bg-[var(--m-mint-tile)] text-[12.5px] text-[var(--m-mint-ink)] hover:opacity-85 disabled:opacity-60",
        children ? "px-3" : "w-8 justify-center",
      )}
    >
      {busy ? <Icons.Spinner className="h-3.5 w-3.5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export interface ChartPoint {
  date: string;
  value: number;
}

/**
 * The hero's chart: one area in --m-chart, dollar ticks on the left (Meadow: every chart has a scale),
 * month ticks under it, a small tooltip. Drawn on the hero, so its ticks and grid use the hero's colours.
 */
export function HeroChart({
  data,
  height,
  money,
  tooltip,
  ticks = 4,
}: {
  data: ChartPoint[];
  height: number;
  money: (v: number) => string;
  tooltip?: (p: ChartPoint) => ReactNode;
  ticks?: number;
}) {
  // Round ticks ($200K, $400K...), never $798.9K.
  const { domain, tickValues } = useMemo(() => {
    if (!data.length) return { domain: [0, 1] as [number, number], tickValues: [0, 1] };
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of data) {
      lo = Math.min(lo, p.value);
      hi = Math.max(hi, p.value);
    }
    if (hi === lo) hi = lo + Math.max(1, Math.abs(lo) * 0.1);
    const rough = (hi - lo) / Math.max(1, ticks - 1);
    const mag = 10 ** Math.floor(Math.log10(rough));
    const norm = rough / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const start = Math.floor(lo / step) * step;
    const end = Math.ceil(hi / step) * step;
    const list: number[] = [];
    for (let v = start; v <= end + step / 2; v += step) list.push(Math.round(v * 100) / 100);
    return { domain: [start, end] as [number, number], tickValues: list };
  }, [data, ticks]);
  const fmtDay = useMemo(
    () => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }),
    [],
  );
  const fmtMonth = useMemo(
    () => new Intl.DateTimeFormat(undefined, { month: "short", year: "2-digit" }),
    [],
  );
  const spanDays =
    data.length > 1
      ? (Date.parse(data[data.length - 1].date) - Date.parse(data[0].date)) / 86_400_000
      : 0;
  const tickDate = (d: string) => {
    const dt = new Date(`${d}T12:00:00`);
    return spanDays > 200 ? fmtMonth.format(dt).replace(" ", " '") : fmtDay.format(dt);
  };
  if (!data.length) return <div style={{ height }} />;
  return (
    <div style={{ height }} className="min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="mdash-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--m-chart)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--m-chart)" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--m-mint-line)" />
          <YAxis
            domain={domain}
            ticks={tickValues}
            interval={0}
            width={52}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "var(--m-mint-muted)" }}
            tickFormatter={(v: number) => money(v)}
          />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            minTickGap={36}
            tick={{ fontSize: 11, fill: "var(--m-mint-muted)" }}
            tickFormatter={tickDate}
          />
          {tooltip ? (
            <Tooltip
              cursor={{ stroke: "var(--m-mint-muted)", strokeDasharray: "3 3" }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="rounded-lg border border-[var(--m-line)] bg-[var(--m-surface)] px-2.5 py-1.5 text-xs text-[var(--m-ink)] shadow-md">
                    {tooltip(payload[0].payload as ChartPoint)}
                  </div>
                ) : null
              }
            />
          ) : null}
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--m-chart)"
            strokeWidth={2}
            fill="url(#mdash-area)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Period words for the verdict line: "past 3 months", "all time". */
export function periodWords(label: string) {
  return label.toLowerCase();
}

/** Sentence case for the stock labels (Meadow: "Net worth", not "Net Worth"). */
export function sentence(label: string) {
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}

/** "+360.03%": the change as a percent with its sign, two decimals. */
export function signedPercent(fraction: number) {
  const pct = Math.abs(fraction * 100);
  return `${fraction > 0 ? "+" : fraction < 0 ? "−" : ""}${pct.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}
