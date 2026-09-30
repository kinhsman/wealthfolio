// money-hub patch: the Merchants card on Settings, Spending (next to Rules), opening the Merchants page.
import { Link } from "react-router-dom";

import { Icons } from "@wealthfolio/ui";

import { MerchantLogo } from "@/features/spending/components/merchant-logo";
import { useMerchants } from "@/features/spending/lib/merchants";

export function MerchantsOverviewCard() {
  const { data: all = [], isLoading } = useMerchants();
  const merchants = all.filter((m) => !m.source);
  if (isLoading) return <div className="bg-muted/40 h-28 w-full animate-pulse rounded-lg" />;
  return (
    <Link
      to="/settings/spending/merchants"
      aria-label="Open merchants"
      className="bg-card hover:border-foreground/20 group flex flex-col items-stretch overflow-hidden rounded-lg border transition-all hover:shadow-md sm:flex-row"
    >
      <div className="min-w-0 flex-1 p-6">
        <h3 className="text-base font-semibold tracking-tight">Merchants</h3>
        <p className="text-muted-foreground mt-1 text-xs">
          {merchants.length
            ? `${merchants.length} merchant${merchants.length === 1 ? "" : "s"} with your own logo on matching transactions.`
            : "Put your own logo on a merchant's transactions, matched by the words you choose."}
        </p>
        {merchants.length ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {merchants.slice(0, 12).map((m) => (
              <MerchantLogo key={m.id} url={m.logoUrl} name={m.name} className="h-7 w-7" />
            ))}
          </div>
        ) : null}
      </div>
      <div className="bg-muted/30 group-hover:bg-foreground group-hover:text-background text-muted-foreground flex shrink-0 items-center justify-center gap-1.5 border-t px-4 py-3 text-xs font-medium uppercase tracking-widest transition-colors sm:w-24 sm:flex-col sm:gap-2 sm:border-l sm:border-t-0 sm:px-0 sm:py-0">
        <span>Open</span>
        <Icons.ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
