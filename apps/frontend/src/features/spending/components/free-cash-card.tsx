// money-hub patch: the Spending dashboard's Free cash card (lib/free-cash.ts): the cash that can pay
// the cards, each account it comes from, and what is left once the cards and the bills coming up are
// paid. Which accounts count is each account's own switch (Settings, Accounts); the alert and how far
// ahead bills count live on Settings, Alerts.
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { DashboardCard } from "@/components/dashboard-card";
import { useAccounts } from "@/hooks/use-accounts";
import { accountLogoUrl } from "@/lib/account-logo";
import { cn } from "@/lib/utils";
import { Icons, PrivacyAmount } from "@wealthfolio/ui";

import { shortDate, useFreeCash, type FreeCashView } from "../lib/free-cash";
import { MerchantLogo } from "./merchant-logo";
import { StreamLogo } from "./stream-logo";

// Inline colours: the dark theme turns the green and amber utilities white.
const GREEN = "#16a34a";
const AMBER = "#d97706";

export function FreeCashCard({
  currency = "USD",
  className,
}: {
  currency?: string;
  className?: string;
}) {
  const { data, isLoading, isError } = useFreeCash();
  const { accounts } = useAccounts({ filterActive: false });
  const [showBills, setShowBills] = useState(false);
  const note = (text: string) => (
    <div className="text-muted-foreground px-4 py-6 text-center text-xs md:px-5">{text}</div>
  );

  return (
    <div className={className}>
      <DashboardCard
        title="Free cash"
        subtitle={
          data
            ? `${data.accounts.length} ${data.accounts.length === 1 ? "account" : "accounts"}`
            : undefined
        }
        padded={false}
        action={
          <Link
            to="/settings/accounts"
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
          >
            Choose accounts
          </Link>
        }
      >
        {isLoading ? (
          note("Adding up your cash.")
        ) : isError || !data ? (
          note("The money app helper did not answer.")
        ) : data.accounts.length === 0 ? (
          note("No account counts as free cash yet. Switch one on in Settings, Accounts.")
        ) : (
          <>
            <div className="flex items-end justify-between gap-3 px-4 pb-3 pt-3 md:px-5">
              <div className="min-w-0">
                <div className="text-2xl font-semibold tabular-nums">
                  <PrivacyAmount value={data.totals.cash} currency={currency} />
                </div>
                <div className="text-muted-foreground text-xs">cash you can use</div>
              </div>
              <Verdict v={data} currency={currency} />
            </div>

            <div className="border-border/60 border-t px-2 py-2 md:px-3">
              {data.accounts.map((a) => {
                const account = accounts?.find((x) => x.id === a.id);
                const logo = accountLogoUrl(account);
                return (
                  <div key={a.id} className="flex items-center gap-3 rounded-md px-2 py-1.5">
                    {logo ? (
                      <MerchantLogo url={logo} name={a.name} whole className="h-7 w-7" />
                    ) : (
                      <span className="bg-muted text-muted-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold">
                        {a.name.trim().charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-foreground/90 truncate text-xs font-medium">
                        {account?.name ?? a.name}
                      </div>
                      {!a.known ? (
                        <div className="text-muted-foreground text-[11px]">no balance yet</div>
                      ) : a.pending !== 0 ? (
                        <div className="text-muted-foreground text-[11px] tabular-nums">
                          {a.pending < 0 ? "- " : "+ "}
                          <PrivacyAmount value={Math.abs(a.pending)} currency={currency} /> pending
                        </div>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-xs font-medium tabular-nums">
                      <PrivacyAmount value={a.cash} currency={currency} />
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="border-border/60 space-y-1.5 border-t px-4 py-3 text-xs tabular-nums md:px-5">
              <Line label={data.cards.pending > 0 ? "Cards, with pending" : "Credit cards"}>
                - <PrivacyAmount value={data.totals.cards} currency={currency} />
              </Line>
              <button
                type="button"
                onClick={() => setShowBills((x) => !x)}
                className="hover:text-foreground flex w-full items-baseline justify-between gap-2 text-left"
                aria-expanded={showBills}
              >
                <span className="text-muted-foreground flex min-w-0 items-center gap-1">
                  <Icons.ChevronRight
                    className={cn(
                      "h-3 w-3 shrink-0 transition-transform",
                      showBills && "rotate-90",
                    )}
                  />
                  <span className="truncate">
                    Bills due by {shortDate(data.bills.until)} ({data.bills.items.length})
                  </span>
                </span>
                <span className="shrink-0">
                  - <PrivacyAmount value={data.totals.bills} currency={currency} />
                </span>
              </button>
              {showBills ? <BillsList v={data} currency={currency} /> : null}
              <div className="border-border/60 flex items-baseline justify-between gap-2 border-t pt-1.5 font-medium">
                <span style={data.short ? { color: AMBER } : undefined}>
                  {data.short ? "Short" : "Left over"}
                </span>
                <span style={{ color: data.short ? AMBER : GREEN }}>
                  <PrivacyAmount value={Math.abs(data.totals.left)} currency={currency} />
                </span>
              </div>
            </div>
          </>
        )}
      </DashboardCard>
    </div>
  );
}

/** Covers the cards and the bills, or short, top right. */
function Verdict({ v, currency }: { v: FreeCashView; currency: string }) {
  if (v.short) {
    return (
      <div className="shrink-0 text-right text-xs" style={{ color: AMBER }}>
        <div className="flex items-center justify-end gap-1 font-medium">
          <Icons.AlertTriangle className="h-3.5 w-3.5" />
          Short
        </div>
        <div className="tabular-nums">
          by <PrivacyAmount value={-v.totals.left} currency={currency} />
        </div>
      </div>
    );
  }
  return (
    <div className="shrink-0 text-right text-xs">
      <div className="flex items-center justify-end gap-1 font-medium" style={{ color: GREEN }}>
        <Icons.CheckCircle className="h-3.5 w-3.5" />
        Covered
      </div>
      <div className="text-muted-foreground">cards and bills</div>
    </div>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground min-w-0 truncate">
        <span className="inline-block w-4" />
        {label}
      </span>
      <span className="shrink-0">{children}</span>
    </div>
  );
}

/** The bills counted, by date, and any left out because the charge is already pending on a card. */
function BillsList({ v, currency }: { v: FreeCashView; currency: string }) {
  return (
    <div className="bg-muted/30 space-y-1 rounded-md px-2 py-2">
      {v.bills.items.length === 0 ? (
        <div className="text-muted-foreground px-1 text-[11px]">
          Nothing due in the next {v.bills.days} days.
        </div>
      ) : (
        v.bills.items.map((b) => (
          <div key={`${b.key}:${b.date}`} className="flex items-center gap-2 px-1">
            <StreamLogo s={b} className="h-5 w-5 text-[9px]" />
            <span className="text-foreground/90 min-w-0 flex-1 truncate">{b.name}</span>
            <span className="text-muted-foreground w-12 shrink-0 text-[11px]">
              {shortDate(b.date)}
            </span>
            <span className="w-[4.5rem] shrink-0 text-right">
              <PrivacyAmount value={b.amount} currency={currency} />
            </span>
          </div>
        ))
      )}
      {v.bills.skipped.map((b) => (
        <div
          key={`skip:${b.key}:${b.date}`}
          className="text-muted-foreground flex items-center gap-2 px-1 text-[11px]"
        >
          <StreamLogo s={b} className="h-5 w-5 text-[9px] opacity-60" />
          <span className="min-w-0 flex-1 truncate">{b.name}: pending on a card</span>
        </div>
      ))}
      {v.bills.items.some((b) => b.shared) ? (
        <div className="text-muted-foreground px-1 pt-1 text-[11px]">
          Shared bills count in full:{" "}
          {[...new Set(v.bills.items.filter((b) => b.shared).map((b) => b.name))].join(", ")}.
          Friends pay you back later.
        </div>
      ) : null}
      <Link
        to="/settings/alerts"
        className="text-muted-foreground hover:text-foreground block px-1 pt-1 text-[11px] underline-offset-4 hover:underline"
      >
        Change: Settings, Alerts
      </Link>
    </div>
  );
}
