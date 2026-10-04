// money-hub patch: the Spending tab's Subscriptions & Bills widget, now only the summary numbers (owner,
// 10-04: "make the dashboard widget smaller just displaying summary stats"). The calendar, the list of what
// is due and every row live on the Subscriptions & Bills page (pages/spending-subscriptions-page.tsx), which
// this whole strip opens. The numbers are the page's own: lib/subscriptions.ts totals, and this month's paid
// and left to pay from lib/bill-calendar.ts, counted the way the Monthly budget card counts them.
import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import { Icons, PrivacyAmount, Skeleton } from "@wealthfolio/ui";

import { billMonth, ymd } from "../lib/bill-calendar";
import { useSubscriptions } from "../lib/subscriptions";

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-muted-foreground truncate text-[12.5px] max-md:text-[11.5px]">{label}</span>
      <span data-m-num="tile" className="truncate text-[17px] font-medium leading-tight tabular-nums max-md:text-[15px]">
        {children}
      </span>
    </div>
  );
}

export function SubscriptionsStrip({ currency = "USD" }: { currency?: string }) {
  const { data, isLoading, isError } = useSubscriptions();
  const today = useMemo(() => ymd(new Date()), []);
  const month = useMemo(() => new Date().toLocaleDateString(undefined, { month: "long" }), []);
  const m = useMemo(() => (data ? billMonth(data.items, today) : null), [data, today]);
  const empty = !!data && data.totals.count === 0;

  return (
    <Link
      to="/spending/subscriptions"
      data-m="card"
      aria-label="Open Subscriptions & Bills"
      className={cn(
        "flex min-h-[64px] items-center gap-x-6 rounded-[20px] border border-[var(--m-line)] bg-[var(--m-surface)] px-[18px] py-3",
        "hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-forest)]",
        "max-md:flex-wrap max-md:gap-x-3 max-md:gap-y-1.5 max-md:px-3 max-md:py-2",
      )}
    >
      <div className="min-w-0 shrink-0 max-md:flex-1 lg:w-[11.5rem]">
        <div className="text-sm font-medium">Subscriptions &amp; Bills</div>
        <div className="text-muted-foreground truncate text-xs">
          {data && !empty ? `${month}, ${data.totals.count} repeating` : month}
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-8 min-w-0 flex-1 max-md:order-last max-md:basis-full" />
      ) : isError ? (
        <span className="text-muted-foreground min-w-0 flex-1 text-[13px] max-md:order-last max-md:basis-full">
          The money app helper did not answer.
        </span>
      ) : empty || !data || !m ? (
        <span className="text-muted-foreground min-w-0 flex-1 text-[13px] max-md:order-last max-md:basis-full">
          Nothing repeating found yet. One shows up once it has come back a few months in a row.
        </span>
      ) : (
        <div className="grid min-w-0 flex-1 grid-cols-4 gap-x-4 max-md:order-last max-md:basis-full max-md:grid-cols-3 max-md:gap-x-2">
          <Stat label="Left to pay">
            <PrivacyAmount value={m.leftTotal} currency={currency} />
          </Stat>
          <Stat label={`Paid, ${m.paidCount} of ${m.count}`}>
            <PrivacyAmount value={m.paidTotal} currency={currency} />
          </Stat>
          <Stat label="A month">
            <PrivacyAmount value={data.totals.monthly} currency={currency} />
          </Stat>
          <div className="min-w-0 max-md:hidden">
            <Stat label="A year">
              <PrivacyAmount value={data.totals.yearly} currency={currency} />
            </Stat>
          </div>
        </div>
      )}

      <span className="flex shrink-0 items-center gap-1 text-[12.5px] underline-offset-4">
        Open
        <Icons.ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </span>
    </Link>
  );
}
