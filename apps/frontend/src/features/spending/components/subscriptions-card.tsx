// money-hub patch: the Spending dashboard's Subscriptions & bills card (lib/subscriptions.ts): what
// the repeating charges add up to, this month's paid and left to pay over a small calendar of the bill
// days (components/bill-calendar.tsx), and the next few due. "See all" opens the page.
import { Link } from "react-router-dom";

import { DashboardCard } from "@/components/dashboard-card";
import { PrivacyAmount } from "@wealthfolio/ui";

import { dueLabel, transactionsHref, upcoming, useSubscriptions } from "../lib/subscriptions";
import { BillMonthPanel } from "./bill-calendar";
import { StreamCategory } from "./stream-category";
import { StreamLogo } from "./stream-logo";

export function SubscriptionsCard({ currency = "USD", fill = false }: { currency?: string; fill?: boolean }) {
  const { data, isLoading, isError } = useSubscriptions();
  const next = upcoming(data?.items ?? []);
  const note = (text: string) => <div className="text-muted-foreground px-4 py-6 text-center text-xs md:px-5">{text}</div>;

  return (
    <DashboardCard
      title="Subscriptions & Bills"
      subtitle={data && data.totals.count > 0 ? `${data.totals.count} repeating` : undefined}
      padded={false}
      fill={fill}
      action={
        <Link
          to="/spending/subscriptions"
          className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
        >
          See all
        </Link>
      }
    >
      {isLoading ? (
        note("Looking for repeating charges.")
      ) : isError ? (
        note("The money app helper did not answer.")
      ) : !data || data.totals.count === 0 ? (
        note("No repeating charges found yet. One shows up once it has come back a few months in a row.")
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 px-4 pb-3 pt-3 md:px-5">
            <div className="min-w-0">
              <div className="text-2xl font-medium tabular-nums">
                <PrivacyAmount value={data.totals.monthly} currency={currency} />
              </div>
              <div className="text-muted-foreground whitespace-nowrap text-xs">
                a month, <PrivacyAmount value={data.totals.yearly} currency={currency} /> a year
              </div>
            </div>
            <div className="text-muted-foreground ml-auto space-y-0.5 whitespace-nowrap text-right text-xs tabular-nums">
              <div>
                Subscriptions <PrivacyAmount value={data.totals.subscriptionsMonthly} currency={currency} />
              </div>
              <div>
                Bills <PrivacyAmount value={data.totals.billsMonthly} currency={currency} />
              </div>
            </div>
          </div>
          <BillMonthPanel
            items={data.items}
            currency={currency}
            className="border-border/60 border-t px-4 py-3 md:px-5"
          />
          {next.length > 0 ? (
            <div id="next-due" className="border-border/60 scroll-mt-4 border-t px-4 py-3 md:px-5">
              <div className="text-muted-foreground text-xs">Next due</div>
              {next.map((s) => (
                <Link
                  key={s.key}
                  to={s.escrow ? "/spending/subscriptions" : transactionsHref(s)}
                  className="hover:bg-muted/40 flex items-center gap-2.5 rounded-md py-1 transition-colors"
                >
                  <StreamLogo s={s} className="h-6 w-6 text-[10px]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-foreground/90 truncate text-xs font-medium">{s.name}</div>
                    <div className="text-muted-foreground flex items-center gap-1 text-[11px]">
                      {/* Its category's icon, the app's own (owner, 10-02); the name shows on hover. */}
                      <StreamCategory categoryId={s.categoryId} iconOnly />
                      <span className="truncate">{dueLabel(s)}</span>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums">
                    <PrivacyAmount value={s.usual} currency={currency} />
                  </span>
                </Link>
              ))}
            </div>
          ) : null}
        </>
      )}
    </DashboardCard>
  );
}
