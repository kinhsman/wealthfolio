// money-hub patch: Cash forecast (owner, 2026-10-02/03, from the Monarch comparison: "cash forecast:
// checking balance for the next 60 days from paychecks and bills, + card due dates"). One line: the free
// cash accounts' balance ahead, a step on each payment; the cushion dashed; the lowest day marked; a hover
// says the day's balance and what happens that day. Under it, what is coming up. lib/cash-forecast.ts.
import { useMemo, useRef, useState } from "react";
import { DashboardCard } from "@/components/dashboard-card";
import { useAccounts } from "@/hooks/use-accounts";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { cn } from "@/lib/utils";
import { Icons, PrivacyAmount, useAmountFormatting, useBalancePrivacy, type AmountFormatting } from "@wealthfolio/ui";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import {
  FORECAST_HORIZONS,
  cardWhy,
  forecastLabel,
  niceScale,
  shortDay,
  stepPath,
  useCashForecast,
  type CashForecast,
  type ForecastEvent,
} from "../lib/cash-forecast";
import { useMerchants } from "../lib/merchants";
import { MerchantLogo } from "./merchant-logo";
import { PhoneFold } from "./phone-fold";

const LINE = "var(--m-chart, var(--m-forest, hsl(73 84% 27%)))";

const W = 600;
const H = 140;

/** The scale's top and bottom on a phone, over the plot's left corners. */
const ON_PLOT_LABEL = "text-muted-foreground pointer-events-none absolute left-0 text-[10.5px] leading-none tabular-nums";

function Toggle({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div role="group" aria-label="How far ahead" className="bg-card/40 border-border/60 inline-flex items-center gap-0.5 rounded-full border p-0.5">
      {FORECAST_HORIZONS.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(d)}
          aria-pressed={value === d}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
            value === d ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {d} days
        </button>
      ))}
    </div>
  );
}

export function CashForecastCard({ currency }: { currency: string }) {
  const isMobile = useIsMobileViewport();
  const [days, setDays] = usePersistentState<number>("cash-forecast-days", 60);
  const { data, isLoading, isError } = useCashForecast(days);
  return (
    <DashboardCard
      title="Cash forecast"
      subtitle={isMobile ? undefined : "your cash accounts, ahead"}
      action={<Toggle value={days} onChange={setDays} />}
    >
      {isLoading ? (
        <Skeleton className="h-[220px] w-full rounded-lg" />
      ) : isError || !data ? (
        <p className="text-muted-foreground text-sm">The money app helper did not answer.</p>
      ) : (
        <Body f={data} currency={currency} isMobile={isMobile} />
      )}
    </DashboardCard>
  );
}

function Body({ f, currency, isMobile }: { f: CashForecast; currency: string; isMobile: boolean }) {
  const under = f.under != null;
  const lowIsToday = f.low.date === f.now;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        {/* Full width on a phone (the verdict wraps under it); side by side from sm. */}
        <div className="flex w-full min-w-0 items-end justify-between gap-x-8 sm:w-auto sm:justify-start">
          <div className="min-w-0">
            <div className="text-muted-foreground text-xs">Lowest{lowIsToday ? ", today" : `, ${shortDay(f.low.date)}`}</div>
            <div className="text-foreground text-[26px] font-medium leading-tight tabular-nums tracking-tight">
              <PrivacyAmount value={f.low.balance} currency={currency} />
            </div>
          </div>
          <div className="min-w-0 text-right sm:text-left">
            <div className="text-muted-foreground text-xs">In {f.horizon} days</div>
            <div className="text-foreground text-lg font-medium tabular-nums">
              <PrivacyAmount value={f.end} currency={currency} />
            </div>
          </div>
        </div>
        <Verdict f={f} currency={currency} under={under} />
      </div>
      <Chart f={f} currency={currency} isMobile={isMobile} />
      <PhoneFold id="cash-forecast" closedLabel={`${f.events.length} payments ahead`} openLabel="Hide the payments" bleed>
        <Upcoming f={f} currency={currency} isMobile={isMobile} />
      </PhoneFold>
      {!isMobile ? (
        <p className="text-muted-foreground text-[11.5px] leading-relaxed">
          From what repeats in your cash accounts over the last 6 months, and each card's statement on its due date
          (its usual payment after that). Money that does not repeat is not in it.
        </p>
      ) : null}
    </div>
  );
}

function Verdict({ f, currency, under }: { f: CashForecast; currency: string; under: boolean }) {
  if (!(f.cushion > 0)) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        under
          ? "bg-[var(--m-warn-soft,#fbe9d2)] text-[var(--m-warn,#7a4300)]"
          : "bg-[var(--m-good-soft,var(--m-mint,#e3f1da))] text-[var(--m-good-ink,var(--m-mint-ink,#1d4d1f))]",
      )}
    >
      {under ? <Icons.AlertTriangle className="h-3.5 w-3.5" aria-hidden /> : <Icons.Check className="h-3.5 w-3.5" aria-hidden />}
      {under ? (
        <span>
          Under your <PrivacyAmount value={f.cushion} currency={currency} /> cushion on {shortDay(f.under!)}
        </span>
      ) : (
        <span>
          Stays above your <PrivacyAmount value={f.cushion} currency={currency} /> cushion
        </span>
      )}
    </span>
  );
}

// Through the app's formatters, so the sidebar's USD / VND switch reaches the chart too.
function moneyWith(fmt: AmountFormatting) {
  return (v: number, currency: string, hidden: boolean, whole = false) =>
    hidden ? "••••" : whole ? fmt.formatRoundedAmount(v, currency) : fmt.formatAmount(v, currency);
}

function Chart({ f, currency, isMobile }: { f: CashForecast; currency: string; isMobile: boolean }) {
  const { isBalanceHidden } = useBalancePrivacy();
  const money = moneyWith(useAmountFormatting());
  const { data: merchants } = useMerchants();
  const { accounts } = useAccounts({ filterActive: false });
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const balances = f.days.map((d) => d.balance);
  const { min, max } = useMemo(() => {
    const lo = Math.min(...balances, f.cushion > 0 ? f.cushion : Infinity);
    const hi = Math.max(...balances);
    const pad = Math.max((hi - lo) * 0.08, 1);
    return niceScale(Math.max(0, lo - pad), hi + pad);
  }, [balances, f.cushion]);
  const path = stepPath(balances, { w: W, h: H, min, max });
  const yPct = (v: number) => (1 - (v - min) / (max - min || 1)) * 100;
  const xPct = (i: number) => (balances.length > 1 ? (i / (balances.length - 1)) * 100 : 0);
  const lowIdx = f.days.findIndex((d) => d.date === f.low.date);
  const eventsOn = useMemo(() => {
    const m = new Map<string, ForecastEvent[]>();
    for (const e of f.events) (m.get(e.date) || m.set(e.date, []).get(e.date)!).push(e);
    return m;
  }, [f.events]);
  const pick = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || balances.length < 2) return;
    const i = Math.round(((clientX - r.left) / r.width) * (balances.length - 1));
    setHover(Math.max(0, Math.min(balances.length - 1, i)));
  };
  const h = hover != null ? f.days[hover] : null;
  const hEvents = h ? eventsOn.get(h.date) ?? [] : [];
  const mid = f.days[Math.floor(f.days.length / 2)];
  return (
    <div>
      {/* Not a flex row on a phone: the phone's ".flex { overflow-x: hidden }" would cut the markers
          that sit on the plot's two edges in half. */}
      <div className={isMobile ? undefined : "flex gap-2"}>
        {isMobile ? null : (
          <div className="text-muted-foreground flex w-12 shrink-0 flex-col justify-between py-0.5 text-right text-[10.5px] tabular-nums">
            <span>{money(max, currency, isBalanceHidden, true)}</span>
            <span>{money(min, currency, isBalanceHidden, true)}</span>
          </div>
        )}
        <div
          ref={box}
          className={cn("relative min-w-0 flex-1 touch-pan-y select-none", isMobile ? "h-[110px]" : "h-[140px]")}
          onPointerMove={(e) => pick(e.clientX)}
          onPointerDown={(e) => pick(e.clientX)}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`Cash ahead: from ${money(f.start, currency, isBalanceHidden)} today to ${money(f.end, currency, isBalanceHidden)} on ${shortDay(f.until)}, lowest ${money(f.low.balance, currency, isBalanceHidden)} on ${shortDay(f.low.date)}`}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 block h-full w-full overflow-visible">
            <path d={`${path} V ${H} H 0 Z`} fill={LINE} fillOpacity={0.08} stroke="none" />
            {f.cushion > 0 && f.cushion >= min && f.cushion <= max ? (
              <line x1={0} x2={W} y1={(yPct(f.cushion) / 100) * H} y2={(yPct(f.cushion) / 100) * H}
                stroke="var(--muted-foreground)" strokeOpacity={0.5} strokeDasharray="4 4" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
            ) : null}
            <path d={path} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {isMobile ? (
            // A phone has no room for a column of its own (it left the chart a sixth narrower and
            // blank on the left; owner, 10-03): the top and bottom of the scale sit on the plot.
            <>
              <span className={ON_PLOT_LABEL} style={{ top: 0 }}>{money(max, currency, isBalanceHidden, true)}</span>
              <span className={ON_PLOT_LABEL} style={{ bottom: 0 }}>{money(min, currency, isBalanceHidden, true)}</span>
            </>
          ) : null}
          {f.cushion > 0 && f.cushion >= min && f.cushion <= max ? (
            <span className="text-muted-foreground absolute right-0 -translate-y-full pb-0.5 text-[10.5px]" style={{ top: `${yPct(f.cushion)}%` }}>
              cushion {money(f.cushion, currency, isBalanceHidden, true)}
            </span>
          ) : null}
          {lowIdx >= 0 ? (
            // HTML so it stays round (the SVG stretches).
            <span
              className="absolute h-[9px] w-[9px] rounded-full bg-[var(--m-surface,white)]"
              style={{ left: `${xPct(lowIdx)}%`, top: `${yPct(f.low.balance)}%`, transform: "translate(-50%, -50%)", border: `2px solid ${f.under ? "var(--m-warn,#b45309)" : LINE}` }}
              aria-hidden
            />
          ) : null}
          {h && hover != null ? (
            <>
              <span className="bg-foreground/30 absolute bottom-0 top-0 w-px" style={{ left: `${xPct(hover)}%` }} aria-hidden />
              <span
                className="absolute h-[9px] w-[9px] rounded-full"
                style={{ left: `${xPct(hover)}%`, top: `${yPct(h.balance)}%`, transform: "translate(-50%, -50%)", background: LINE, boxShadow: "0 0 0 2px var(--m-surface, white)" }}
                aria-hidden
              />
              <div
                className="bg-popover text-popover-foreground pointer-events-none absolute top-0 z-10 w-max max-w-[240px] rounded-lg border px-2.5 py-1.5 text-[11.5px] shadow-md"
                style={xPct(hover) > 60 ? { right: `${100 - xPct(hover) + 2}%` } : { left: `${xPct(hover) + 2}%` }}
              >
                <div className="text-muted-foreground">{shortDay(h.date)}</div>
                <div className="text-foreground font-medium tabular-nums">{money(h.balance, currency, isBalanceHidden)}</div>
                {hEvents.map((e, i) => (
                  <div key={i} className="flex justify-between gap-3 tabular-nums">
                    <span className="truncate">{forecastLabel(e, merchants, accounts).label}</span>
                    <span className={e.amount > 0 ? "text-[var(--m-up,#15803d)]" : ""}>{e.amount > 0 ? "+" : ""}{money(e.amount, currency, isBalanceHidden)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
      <div className={cn("text-muted-foreground mt-1 flex justify-between text-[10.5px] tabular-nums", !isMobile && "pl-14")}>
        <span>Today</span>
        {mid ? <span>{shortDay(mid.date)}</span> : null}
        <span>{shortDay(f.until)}</span>
      </div>
    </div>
  );
}

function Upcoming({ f, currency, isMobile }: { f: CashForecast; currency: string; isMobile: boolean }) {
  const { data: merchants } = useMerchants();
  const { accounts } = useAccounts({ filterActive: false });
  const [open, setOpen] = useState(false);
  const keep = isMobile ? 6 : 8;
  const shown = open ? f.events : f.events.slice(0, keep);
  if (!f.events.length) return <p className="text-muted-foreground text-xs">Nothing that repeats in this window.</p>;
  return (
    <div className="space-y-0.5">
      <div className="text-muted-foreground pb-1 text-xs">Coming up</div>
      {shown.map((e, i) => {
        const { label, logo } = forecastLabel(e, merchants, accounts);
        const sub = e.card ? cardWhy(e.why) : [e.parts && e.parts > 1 ? `${e.parts} deposits` : null, e.every === "biweekly" ? "every 2 weeks" : "monthly", "estimated"].filter(Boolean).join(", ");
        return (
          <div key={`${e.date}-${i}`} className="flex items-center gap-2.5 rounded-lg px-1 py-1">
            <span className="text-muted-foreground w-12 shrink-0 text-[11.5px] tabular-nums">{shortDay(e.date)}</span>
            {logo ? (
              <MerchantLogo url={logo.url} name={logo.name} whole={logo.whole} className="h-6 w-6" />
            ) : (
              <span className="bg-muted flex h-6 w-6 shrink-0 items-center justify-center rounded-full" aria-hidden>
                {e.card ? <Icons.CreditCard className="text-muted-foreground h-3.5 w-3.5" /> : e.amount > 0 ? <Icons.ArrowDown className="text-muted-foreground h-3.5 w-3.5" /> : <Icons.ArrowUp className="text-muted-foreground h-3.5 w-3.5" />}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="text-foreground block truncate text-[13px]">{label}</span>
              {!isMobile && sub ? <span className="text-muted-foreground block truncate text-[11px]">{sub}</span> : null}
            </span>
            <span className={cn("shrink-0 text-[13px] font-medium tabular-nums", e.amount > 0 && "text-[var(--m-up,#15803d)]")}>
              {e.amount > 0 ? "+" : ""}
              <PrivacyAmount value={e.amount} currency={currency} />
            </span>
          </div>
        );
      })}
      {f.events.length > keep ? (
        <button type="button" onClick={() => setOpen(!open)} className="text-muted-foreground hover:text-foreground px-1 pt-1 text-xs underline-offset-4 hover:underline">
          {open ? "Show less" : `Show ${f.events.length - keep} more`}
        </button>
      ) : null}
    </div>
  );
}
