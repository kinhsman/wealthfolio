// money-hub patch (owner, 10-10: "so many design flaws ... split it into 2-col, 3-col, 4-col widgets"): the
// four answers the Spending page opens with, side by side on a desktop: Free cash, Spent, Left to spend, Net.
// They move the figures out of the full-width rows (the Free cash banner, the Monthly budget card's Spent
// row and its Left to spend box), so each figure still has ONE home. The phone keeps its own layout.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { usePersistentState } from "@/hooks/use-persistent-state";
import { cn } from "@/lib/utils";
import { Icons, PrivacyAmount, Skeleton } from "@wealthfolio/ui";

import { shortDay, useCashForecast } from "../lib/cash-forecast";
import { asOfLabel } from "../lib/credit-cards";
import { useFreeCash } from "../lib/free-cash";
import { Verdict } from "./cash-cards-card";

type Tone = "good" | "warn" | "bad";

const TONE_TEXT: Record<Tone, string> = {
  good: "text-[var(--m-up)]",
  warn: "text-[var(--m-warn)]",
  bad: "text-[var(--m-down)]",
};
const TONE_PILL: Record<Tone, string> = {
  good: "bg-[var(--m-good-soft)] text-[var(--m-up)]",
  warn: "bg-[var(--m-warn-soft)] text-[var(--m-warn)]",
  bad: "bg-[var(--m-higher-soft)] text-[var(--m-down)]",
};

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs",
        TONE_PILL[tone],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}

function Tile({
  label,
  badge,
  children,
  className,
}: {
  label: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-m="card"
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-[20px] border border-[var(--m-line)] bg-[var(--m-surface)] px-[18px] py-4",
        className,
      )}
    >
      <div className="flex min-h-[22px] items-center justify-between gap-2">
        <span className="text-muted-foreground min-w-0 truncate text-[12.5px]">{label}</span>
        {badge}
      </div>
      {children}
    </div>
  );
}

const BIG = "text-[30px] font-medium leading-tight tracking-[-0.03em] tabular-nums";

/** Free cash, the answer of the Cash page: the same numbers as the old banner (lib/free-cash.ts). */
export function FreeCashTile({ currency = "USD" }: { currency?: string }) {
  const cash = useFreeCash();
  const [days] = usePersistentState<number>("cash-forecast-days", 60);
  const forecast = useCashForecast(days);
  const fc = cash.data;
  const hasCash = !!fc && fc.accounts.length > 0;
  if (!cash.isLoading && !hasCash && !cash.isError) return null;
  const under = forecast.data?.under ?? null;
  const asOf = asOfLabel(fc?.asOf ?? null);

  return (
    <Tile
      label={fc?.short ? "Short by" : "Free cash"}
      badge={fc ? <Verdict short={fc.short} /> : undefined}
    >
      {cash.isLoading ? (
        <Skeleton className="h-8 w-40" />
      ) : cash.isError || !fc ? (
        <span className="text-muted-foreground text-[13px]">The money app helper did not answer.</span>
      ) : (
        <>
          <div data-m-num="big" className={cn(BIG, fc.short && "text-[var(--m-down)]")}>
            <PrivacyAmount value={Math.abs(fc.totals.left)} currency={currency} />
          </div>
          <div className="text-muted-foreground text-[12.5px]">
            {asOf ? `as of ${asOf}` : "after cards and bills due"}
            {under ? (
              <span className="text-[var(--m-warn)]">
                {" "}
                <Icons.AlertTriangle className="-mt-0.5 inline h-3 w-3" aria-hidden /> Under your cushion{" "}
                {shortDay(under)}
              </span>
            ) : null}
          </div>
          <Link
            to="/cash"
            aria-label="Open the Cash page"
            className="mt-auto inline-flex items-center gap-1 self-start text-[12.5px] text-[var(--m-forest)] underline-offset-4 hover:underline"
          >
            Open Cash
            <Icons.ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </>
      )}
    </Tile>
  );
}

/** Spent for the page's period: the head (label, figure, change vs before) and the fixed / everyday bar. */
export function SpentTile({
  head,
  bar,
  status,
}: {
  head: ReactNode;
  bar: ReactNode;
  status: { tone: Tone; label: string } | null;
}) {
  return (
    <div
      data-m="card"
      className="relative flex min-w-0 flex-col gap-2 rounded-[20px] border border-[var(--m-line)] bg-[var(--m-surface)] px-[18px] py-4"
    >
      {status ? (
        <div className="absolute bottom-4 right-[18px]">
          <Pill tone={status.tone}>{status.label}</Pill>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-col gap-0.5">{head}</div>
      {bar}
    </div>
  );
}

/** What is left to spend once the fixed bills are paid, and the day it makes (or does not). */
export function LeftToSpendTile({
  loading,
  left,
  hasFixed,
  perDay,
  usualPerDay,
  daysRemaining,
  currency,
  noBudget,
}: {
  loading: boolean;
  left: number | null;
  hasFixed: boolean;
  perDay: number | null;
  usualPerDay: number | null;
  daysRemaining: number;
  currency: string;
  noBudget: boolean;
}) {
  if (noBudget) {
    return (
      <Tile label="Left to spend">
        <div className="text-muted-foreground text-[13px]">No budget set for this month.</div>
        <Link
          to="/settings/spending/setup"
          className="mt-auto inline-flex items-center gap-1 self-start text-[12.5px] text-[var(--m-forest)] underline-offset-4 hover:underline"
        >
          Set a budget
          <Icons.ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </Tile>
    );
  }
  const tone: Tone | null =
    left === null
      ? null
      : left <= 0
        ? "bad"
        : perDay !== null && usualPerDay !== null && perDay < usualPerDay
          ? "warn"
          : "good";
  const word = tone === "bad" ? "Nothing left" : tone === "warn" ? "Tight" : "On track";
  return (
    <Tile label="Left to spend" badge={tone ? <Pill tone={tone}>{word}</Pill> : undefined}>
      {loading || left === null ? (
        <Skeleton className="h-8 w-32" />
      ) : (
        <>
          <div data-m-num="big" className={cn(BIG, tone ? TONE_TEXT[tone] : undefined)}>
            <PrivacyAmount value={left} currency={currency} />
          </div>
          <div className="text-muted-foreground text-[12.5px] tabular-nums">
            {hasFixed ? "after fixed bills" : "of the budget"}
            {daysRemaining > 0 && perDay !== null && perDay > 0 ? (
              <>
                {`, ${daysRemaining} ${daysRemaining === 1 ? "day" : "days"} left. About `}
                <PrivacyAmount value={perDay} currency={currency} />
                {" a day"}
                {usualPerDay !== null ? (
                  <>
                    {", you usually spend "}
                    <PrivacyAmount value={usualPerDay} currency={currency} />
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        </>
      )}
    </Tile>
  );
}

/** Net for the period (money in minus spending and saving), with Income and Saving under it. */
export function NetTile({
  net,
  income,
  saved,
  compact,
  href,
}: {
  net: number;
  income: number;
  saved: number;
  compact: (v: number) => string;
  href: string;
}) {
  const tone: Tone = net >= 0 ? "good" : "bad";
  const mini = "flex min-w-0 flex-col rounded-xl bg-[var(--m-sand)] px-3 py-2 hover:opacity-90";
  return (
    <Tile label="Net" badge={<Pill tone={tone}>{net >= 0 ? "Positive" : "Negative"}</Pill>}>
      <div data-m-num="big" className={cn(BIG, TONE_TEXT[tone])}>
        {net >= 0 ? "+" : "−"}
        {compact(Math.abs(net))}
      </div>
      <div className="mt-auto grid grid-cols-2 gap-1.5">
        <Link to={href} className={mini}>
          <span className="text-muted-foreground text-xs">Income</span>
          <span data-m-num="tile" className="truncate text-[15px] font-medium text-[var(--m-up)]">
            +{compact(income)}
          </span>
        </Link>
        <Link to={href} className={mini}>
          <span className="text-muted-foreground text-xs">Saving</span>
          <span data-m-num="tile" className="truncate text-[15px] font-medium">
            {compact(saved)}
          </span>
        </Link>
      </div>
    </Tile>
  );
}
