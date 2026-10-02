// money-hub patch: bank entries that have not posted yet (owner, 2026-09-30: Origin showed a
// pending Jewel-Osco charge the money app did not; "pending is visible but not editable at all").
// Read-only: no checkbox, no menu, no category, no click. They are never imported, so they
// count in no total and no balance; once the bank posts one it comes in as a normal entry and
// leaves this list on the next bank sync (server/drive-backup/lib/plaidSync.js pendingTxns).
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import type { Account } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PrivacyAmount, useDateFormatting } from "@wealthfolio/ui";

import { useMerchantFor } from "../lib/merchants";
import { MerchantLogo } from "./merchant-logo";

export interface PendingTransaction {
  id: string;
  accountId: string;
  date: string;
  notes: string;
  bankText: string;
  amount: number;
  currency: string;
}

export function usePendingTransactions() {
  return useQuery({
    queryKey: ["money-hub", "plaid", "pending"],
    queryFn: async (): Promise<PendingTransaction[]> => {
      const res = await fetch("/api/money-hub/plaid/pending", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

function PendingPill() {
  return (
    <span className="text-muted-foreground shrink-0 rounded-full border border-dashed px-1.5 py-px text-[10px] font-medium uppercase tracking-wide">
      Pending
    </span>
  );
}

function PendingItem({
  p,
  account,
  showAccount,
  isMobile,
}: {
  p: PendingTransaction;
  account: Account | undefined;
  showAccount: boolean;
  isMobile: boolean;
}) {
  const { formatDate } = useDateFormatting();
  const merchant = useMerchantFor(p.notes || p.bankText, account, p.amount < 0 ? "WITHDRAWAL" : "DEPOSIT");
  const day = formatDate(`${p.date}T12:00:00`, { month: "short", day: "numeric" });
  const amount = (
    <span
      className={cn(
        "shrink-0 text-sm font-medium tabular-nums",
        p.amount < 0 ? "text-destructive/70" : "text-success/70",
      )}
    >
      {p.amount < 0 ? "-" : "+"}
      <PrivacyAmount value={Math.abs(p.amount)} currency={p.currency} />
    </span>
  );
  const meta = (
    <div className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px]">
      <span className="shrink-0">{day}</span>
      {showAccount && account && (
        <>
          <span aria-hidden="true">·</span>
          <span className="min-w-0 truncate">{account.name}</span>
        </>
      )}
    </div>
  );
  const body = (
    <div className="flex items-center gap-2.5">
      {merchant ? (
        <MerchantLogo
          url={merchant.logoUrl}
          name={merchant.name}
          whole={merchant.source === "bank"}
          className={cn(isMobile ? "h-9 w-9" : "h-7 w-7", "opacity-70")}
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-foreground/80 min-w-0 truncate text-sm font-medium">
            {p.notes || p.bankText}
          </span>
          <PendingPill />
          <span className="flex-1" />
          {amount}
        </div>
        {meta}
      </div>
    </div>
  );
  // Each one a dashed tile, faded: not posted yet (Meadow's pending state).
  return <div className="rounded-xl border border-dashed border-[var(--m-line,var(--border))] px-2.5 py-2 opacity-90">{body}</div>;
}

export function PendingTransactions({
  items,
  accountById,
  showAccount,
  isMobile,
}: {
  items: PendingTransaction[];
  accountById: Map<string, Account>;
  showAccount: boolean;
  isMobile: boolean;
}) {
  if (!items.length) return null;
  // money-hub patch: its own card in the Activity page's side column (owner, 10-02 canvas design): the
  // heading and its one line inside, each charge a dashed tile.
  return (
    <section
      aria-label="Pending transactions"
      data-m="card"
      className="flex flex-col gap-2 rounded-[20px] border border-[var(--m-line,var(--border))] bg-[var(--m-surface,var(--card))] px-[18px] py-3.5 max-md:px-3 max-md:py-2.5"
    >
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-medium">Pending</h2>
        <span className="text-muted-foreground text-[13px] tabular-nums">{items.length}</span>
        {/* money-hub patch: what each one posts as, beside what it was (lib/pending-changes.ts). */}
        <Link to="/spending/pending-changes" className="ml-auto shrink-0 text-[12.5px] text-[var(--m-forest,var(--foreground))] underline-offset-4 hover:underline">
          Pending vs posted
        </Link>
      </div>
      <p className="text-muted-foreground -mt-1 text-[12.5px]">Not posted by the bank yet. Editable once it posts.</p>
      <div className="flex flex-col gap-1.5">
        {items.map((p) => (
          <PendingItem key={p.id} p={p} account={accountById.get(p.accountId)} showAccount={showAccount} isMobile={isMobile} />
        ))}
      </div>
    </section>
  );
}
