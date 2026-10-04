// money-hub patch: Cash & cards and Cash forecast moved to their own page, Cash (owner, 10-04: "cash &
// cards, and cash forecast deserve their own page"). The Spending tab keeps this one line: the answer
// (free cash, covered or short) and the way in. The forecast speaks here only when it dips under the
// cushion; a calm forecast stays on the Cash page. Same numbers as the Cash page: lib/free-cash.ts.
import { Link } from "react-router-dom";

import { usePersistentState } from "@/hooks/use-persistent-state";
import { cn } from "@/lib/utils";
import { Icons, PrivacyAmount, Skeleton } from "@wealthfolio/ui";

import { shortDay, useCashForecast } from "../lib/cash-forecast";
import { asOfLabel } from "../lib/credit-cards";
import { useFreeCash } from "../lib/free-cash";
import { Verdict } from "./cash-cards-card";

export function FreeCashStrip({ currency = "USD" }: { currency?: string }) {
  const cash = useFreeCash();
  // Same horizon the Cash page's forecast uses, so both read one cached answer.
  const [days] = usePersistentState<number>("cash-forecast-days", 60);
  const forecast = useCashForecast(days);
  const fc = cash.data;
  const hasCash = !!fc && fc.accounts.length > 0;
  if (!cash.isLoading && !hasCash && !cash.isError) return null;

  const under = forecast.data?.under ?? null;
  const asOf = asOfLabel(fc?.asOf ?? null);
  return (
    <Link
      to="/cash"
      data-m="hero"
      aria-label="Open the Cash page"
      className={cn(
        "flex min-h-[56px] items-center gap-x-3 rounded-[20px] bg-[var(--m-mint)] px-5 py-2.5 text-[var(--m-mint-ink)]",
        "hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-mint-ink)]",
        "max-md:min-h-[48px] max-md:gap-x-2 max-md:px-3 max-md:py-2",
      )}
    >
      {cash.isLoading ? (
        <Skeleton className="h-7 w-56" />
      ) : cash.isError || !fc ? (
        <span className="min-w-0 flex-1 text-[13px] text-[var(--m-mint-muted)]">
          The money app helper did not answer.
        </span>
      ) : (
        <>
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5">
            <span className="flex items-center gap-1.5 text-[12.5px] text-[var(--m-mint-muted)]">
              {fc.short ? null : (
                <span className="h-2.5 w-2.5 rounded-[3px] bg-[var(--m-free)]" aria-hidden />
              )}
              {fc.short ? "Short by" : "Free cash"}
            </span>
            <span
              data-m-num="hero"
              className={cn(
                "text-[26px] font-medium leading-tight tracking-[-0.03em] tabular-nums max-md:text-[22px]",
                fc.short && "text-[var(--m-bad)]",
              )}
            >
              <PrivacyAmount value={Math.abs(fc.totals.left)} currency={currency} />
            </span>
            {asOf ? (
              <span className="text-[12.5px] text-[var(--m-mint-muted)] max-md:hidden">
                as of {asOf}
              </span>
            ) : null}
          </div>
          {under ? (
            <span
              data-m="warn-chip"
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--m-warn-soft)] px-3 py-1 text-[12.5px] text-[var(--m-bad)] max-md:hidden"
            >
              <Icons.AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              Under your cushion {shortDay(under)}
            </span>
          ) : null}
          <Verdict short={fc.short} />
        </>
      )}
      <span className="flex shrink-0 items-center gap-1 text-[12.5px] underline-offset-4">
        Cash
        <Icons.ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </span>
    </Link>
  );
}
