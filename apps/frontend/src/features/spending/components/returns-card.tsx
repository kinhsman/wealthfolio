// money-hub patch: the Spending dashboard's Returns card (lib/returns.ts): the money on its way back
// and the returns still waiting. Shown only while something is waiting; "See all" opens the page.
import { Link } from "react-router-dom";

import { DashboardCard } from "@/components/dashboard-card";
import { cn } from "@/lib/utils";
import { PrivacyAmount } from "@wealthfolio/ui";

import { openReturns, returnLine, returnStatus, trackReturnStore, useReturns } from "../lib/returns";
import { StreamLogo } from "./stream-logo";

export function ReturnsCard({ currency = "USD", className }: { currency?: string; className?: string }) {
  const { data } = useReturns();
  const open = openReturns(data?.items ?? []);
  if (!data || !open.length) return null;
  const notes = [data.totals.late ? `${data.totals.late} late` : null, data.totals.toConfirm ? `${data.totals.toConfirm} to confirm` : null].filter(Boolean).join(", ");

  return (
    <div className={className}>
      <DashboardCard
        title="Returns"
        subtitle={`${open.length} waiting`}
        padded={false}
        action={
          <Link to="/spending/returns" className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline">
            See all
          </Link>
        }
      >
        <div className="px-4 pb-3 pt-3 md:px-5">
          <div className="text-2xl font-semibold tabular-nums">
            <PrivacyAmount value={data.totals.waiting} currency={currency} />
          </div>
          <div className="text-muted-foreground text-xs">on its way back{notes ? `, ${notes}` : ""}</div>
        </div>
        <div className="border-border/60 border-t px-4 py-3 md:px-5">
          {open.slice(0, 3).map((x) => {
            const st = returnStatus(x);
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => trackReturnStore.open({ returnId: x.id })}
                className="hover:bg-muted/40 flex w-full items-center gap-2.5 rounded-md py-1.5 text-left transition-colors"
              >
                <StreamLogo s={x} className="h-6 w-6 text-[10px]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-foreground/90 truncate text-xs font-medium">{x.name}</span>
                    {st.tone === "look" ? (
                      <span className={cn("shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium", "bg-[var(--m-warn-soft)] text-[var(--m-warn)]")}>{st.label}</span>
                    ) : null}
                  </div>
                  <div className="text-muted-foreground truncate text-[11px]">{returnLine(x)}</div>
                </div>
                <span className="shrink-0 text-xs tabular-nums">
                  <PrivacyAmount value={x.remaining} currency={x.currency ?? currency} />
                </span>
              </button>
            );
          })}
          {open.length > 3 ? <div className="text-muted-foreground pt-1 text-[11px]">and {open.length - 3} more</div> : null}
        </div>
      </DashboardCard>
    </div>
  );
}
