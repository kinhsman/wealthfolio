// money-hub patch: the Subscriptions & Bills card's month (owner, 2026-10-02: "add the paid / left line
// to the dashboard card too ... also add a small calendar for projected bill dates"): paid so far and
// left to pay, then the month's days with each bill's logo on its day, paid ones dimmed and ringed
// (owner picked the logos over plain circles, 10-02).
// The arrows walk back to what was paid and ahead to where each bill's rhythm lands (lib/bill-calendar.ts).
import { useMemo, useState } from "react";

import { Icons, Popover, PopoverContent, PopoverTrigger, PrivacyAmount } from "@wealthfolio/ui";

import { cn } from "@/lib/utils";

import { billMonth, ymd, type BillMonth } from "../lib/bill-calendar";
import { shortDate, type Stream } from "../lib/subscriptions";
import { StreamLogo } from "./stream-logo";

// Meadow's colours on the dashboard (globals.css, `.meadow`); outside it (the Subscriptions & Bills page)
// the page's own green and track, which read in Day and Night alike.
const FOREST = "var(--m-forest, #16a34a)";
const TRACK = "var(--m-track, var(--muted))";

const WEEK = ["S", "M", "T", "W", "T", "F", "S"];
/** Today: its number underlined (a ring read as one more bill day). */
const TODAY = "font-medium underline decoration-2 underline-offset-[3px]";
/** How far the arrows go, back and ahead. */
const BACK = 12;
const AHEAD = 12;

/** `totals` false: this month's paid and left to pay are shown elsewhere (the page's own month card);
 *  another month still says its total. */
export function BillMonthPanel({
  items,
  currency,
  totals = true,
  className,
}: {
  items: Stream[];
  currency: string;
  totals?: boolean;
  className?: string;
}) {
  const [offset, setOffset] = useState(0);
  const today = ymd(new Date());
  const m = useMemo(() => billMonth(items, today, offset), [items, today, offset]);
  const byKey = useMemo(() => new Map(items.map((s) => [s.key, s])), [items]);
  const whole = Math.max(0, m.paidTotal) + m.leftTotal;
  const pct = whole > 0 ? Math.min(100, (Math.max(0, m.paidTotal) / whole) * 100) : 0;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-0.5">
          <ArrowButton label="Month before" disabled={offset <= -BACK} onClick={() => setOffset((o) => o - 1)}>
            <Icons.ChevronLeft className="h-3.5 w-3.5" />
          </ArrowButton>
          <button
            type="button"
            className="min-w-[5.5rem] text-center text-[13px] font-medium"
            title={offset ? "Back to this month" : undefined}
            onClick={() => setOffset(0)}
          >
            {m.label}
          </button>
          <ArrowButton label="Month after" disabled={offset >= AHEAD} onClick={() => setOffset((o) => o + 1)}>
            <Icons.ChevronRight className="h-3.5 w-3.5" />
          </ArrowButton>
        </div>
        <span className="text-muted-foreground text-xs tabular-nums">{countLine(m, offset)}</span>
      </div>

      {offset === 0 && !totals ? null : offset === 0 ? (
        <div>
          {/* Each amount with its word under it: the narrow column (1024 wide) cut "left to pay" off. */}
          <div className="flex items-end justify-between gap-3 whitespace-nowrap">
            <div>
              <div className="text-lg leading-tight tabular-nums">
                <PrivacyAmount value={m.paidTotal} currency={currency} />
              </div>
              <div className="text-muted-foreground text-xs">paid</div>
            </div>
            <div className="text-right">
              <div className="text-lg leading-tight tabular-nums">
                <PrivacyAmount value={m.leftTotal} currency={currency} />
              </div>
              <div className="text-muted-foreground text-xs">left to pay</div>
            </div>
          </div>
          <div className="mt-1.5 h-[5px] overflow-hidden rounded-full" style={{ background: TRACK }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: FOREST }} />
          </div>
        </div>
      ) : (
        <div className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-lg tabular-nums">
            <PrivacyAmount value={offset < 0 ? m.paidTotal : m.leftTotal} currency={currency} />
          </span>
          <span className="text-muted-foreground text-xs">{offset < 0 ? "paid" : "coming, at the usual amounts"}</span>
        </div>
      )}

      <div>
        <div className="text-muted-foreground grid grid-cols-7 pb-1 text-center text-[10.5px]">
          {WEEK.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: m.firstWeekday }, (_, i) => (
            <span key={`pad-${i}`} />
          ))}
          {Array.from({ length: m.days }, (_, i) => {
            const date = `${m.start.slice(0, 8)}${String(i + 1).padStart(2, "0")}`;
            return (
              <Day
                key={date}
                date={date}
                day={i + 1}
                today={today}
                bills={m.byDay.get(date) ?? []}
                byKey={byKey}
                currency={currency}
              />
            );
          })}
        </div>
      </div>

      {/* The key, below the calendar. */}
      <div className="text-muted-foreground flex items-center gap-4 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="bg-muted-foreground/60 h-2.5 w-2.5 rounded-full" style={{ boxShadow: `0 0 0 1.5px ${FOREST}`, opacity: 0.55 }} aria-hidden />
          Paid
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-muted-foreground/60 h-2.5 w-2.5 rounded-full" aria-hidden />
          {offset > 0 ? "Expected" : "Coming"}
        </span>
        {offset === 0 ? <span className="underline decoration-2 underline-offset-[3px]">Today</span> : null}
        <span className="ml-auto">Tap a day</span>
      </div>
    </div>
  );
}

function countLine(m: BillMonth, offset: number): string {
  if (offset < 0) return `${m.paidCount} paid`;
  if (offset > 0) return `${m.count} expected`;
  return `${m.paidCount} of ${m.count} paid`;
}

function ArrowButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground hover:bg-muted flex h-6 w-6 items-center justify-center rounded-full transition-colors disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function Day({
  date,
  day,
  today,
  bills,
  byKey,
  currency,
}: {
  date: string;
  day: number;
  today: string;
  bills: BillMonth["byDay"] extends Map<string, infer V> ? V : never;
  byKey: Map<string, Stream>;
  currency: string;
}) {
  const isToday = date === today;
  const past = date < today;
  if (!bills.length) {
    return (
      <span className={cn("flex h-10 items-start justify-center pt-0.5 text-[11.5px] tabular-nums", past && "text-muted-foreground/60")}>
        <span className={cn("flex h-6 w-6 items-center justify-center rounded-full", isToday && TODAY)}>{day}</span>
      </span>
    );
  }
  const total = Math.round(bills.reduce((a, b) => a + b.amount, 0) * 100) / 100;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${shortDate(date)}: ${bills.map((b) => b.name).join(", ")}`}
          className="hover:bg-muted/60 flex h-10 flex-col items-center justify-center gap-0.5 rounded-lg pt-0.5 transition-colors"
        >
          <span className={cn("flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none tabular-nums", isToday && TODAY)}>{day}</span>
          <span className="flex -space-x-1.5">
            {bills.slice(0, 2).map((b, i) => {
              const s = byKey.get(b.key);
              return (
                <span
                  key={`${b.key}-${i}`}
                  className="rounded-full"
                  style={{ boxShadow: b.paid ? `0 0 0 1.5px ${FOREST}` : `0 0 0 1.5px var(--card)`, opacity: b.paid ? 0.55 : 1 }}
                >
                  {s ? <StreamLogo s={s} className="h-[18px] w-[18px] text-[8px]" /> : null}
                </span>
              );
            })}
            {bills.length > 2 ? (
              <span className="bg-muted text-muted-foreground flex h-[18px] w-[18px] items-center justify-center rounded-full text-[8.5px]" style={{ boxShadow: "0 0 0 1.5px var(--card)" }}>
                +{bills.length - 2}
              </span>
            ) : null}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" collisionPadding={12} className="w-64 p-3">
        <div className="text-muted-foreground flex items-baseline justify-between pb-1 text-[11px]">
          <span>{shortDate(date)}</span>
          <span className="text-foreground tabular-nums">
            <PrivacyAmount value={total} currency={currency} />
          </span>
        </div>
        {bills.map((b, i) => {
          const s = byKey.get(b.key);
          return (
            <div key={`${b.key}-${i}`} className="flex items-center gap-2 py-1">
              {s ? <StreamLogo s={s} className="h-5 w-5 text-[9px]" /> : null}
              {/* What it is under its name: beside it, a phone cut "Planet Fitness" to "Planet Fi…". */}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs">{b.name}</span>
                <span className="text-muted-foreground block text-[11px] leading-tight">
                  {b.paid ? "Paid" : b.late ? `Was due ${shortDate(b.late)}` : date < today ? "Not in yet" : "Coming"}
                </span>
              </span>
              <span className="shrink-0 text-right text-xs tabular-nums">
                <PrivacyAmount value={b.amount} currency={currency} />
              </span>
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
