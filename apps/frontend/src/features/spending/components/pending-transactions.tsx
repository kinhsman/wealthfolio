// money-hub patch: bank entries that have not posted yet (owner, 2026-09-30: Origin showed a
// pending Jewel-Osco charge the money app did not; "pending is visible but not editable at all").
// Read-only: no checkbox, no menu, no category, no click. They are never imported, so they
// count in no total and no balance; once the bank posts one it comes in as a normal entry and
// leaves this list on the next bank sync (server/drive-backup/lib/plaidSync.js pendingTxns).
// Since 10-02 they sit at the top of the Transactions table itself, in its columns (owner: "make the
// pending charge the same table, they just cant edit it"), not in a card beside it.
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import type { Account } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card, Icons, PrivacyAmount, TableCell, TableRow, useDateFormatting } from "@wealthfolio/ui";

import { useMerchantFor } from "../lib/merchants";
import { AccountLogo, AccountMark } from "./account-mark";
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

const NOT_POSTED = "Not posted by the bank yet. Editable once it posts.";

function PendingPill() {
  return (
    <span className="text-muted-foreground shrink-0 rounded-full border border-dashed px-1.5 py-px text-[10px] font-medium uppercase tracking-wide">
      Pending
    </span>
  );
}

function PendingVsPosted({ className }: { className?: string }) {
  // money-hub patch: what each one posts as, beside what it was (lib/pending-changes.ts).
  return (
    <Link
      to="/spending/pending-changes"
      className={cn(
        "shrink-0 whitespace-nowrap text-xs text-[var(--m-forest,var(--foreground))] underline-offset-4 hover:underline",
        className,
      )}
    >
      Pending vs posted
    </Link>
  );
}

function usePendingView(p: PendingTransaction, account: Account | undefined) {
  const { formatDate } = useDateFormatting();
  const merchant = useMerchantFor(p.notes || p.bankText, account, p.amount < 0 ? "WITHDRAWAL" : "DEPOSIT");
  const name = p.notes || p.bankText;
  return {
    merchant,
    name,
    bankLine: p.notes && p.bankText && p.bankText !== p.notes ? p.bankText : null,
    // The year only when it is not this one, like the posted rows.
    day: formatDate(`${p.date}T12:00:00`, {
      month: "short",
      day: "numeric",
      ...(p.date.slice(0, 4) !== String(new Date().getFullYear()) ? { year: "numeric" } : {}),
    }),
    amountClass: p.amount < 0 ? "text-destructive/70" : "text-success/70",
    amount: (
      <>
        {p.amount < 0 ? "-" : "+"}
        <PrivacyAmount value={Math.abs(p.amount)} currency={p.currency} />
      </>
    ),
  };
}

/** The table's lead-in for the pending rows, laid out like a day header. */
export function PendingHeaderRow({ count, columnCount }: { count: number; columnCount: number }) {
  return (
    <TableRow className="bg-muted/40 hover:bg-muted/40">
      <TableCell className="px-3 py-1.5" />
      <TableCell colSpan={columnCount - 3} className="px-3 py-1.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-xs font-medium">Pending</span>
          <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
          <span className="text-muted-foreground min-w-0 truncate text-xs max-lg:hidden">{NOT_POSTED}</span>
        </div>
      </TableCell>
      <TableCell colSpan={2} className="px-3 py-1.5 text-right">
        <PendingVsPosted />
      </TableCell>
    </TableRow>
  );
}

/** One pending charge in the table's own columns, read-only: a clock where the checkbox goes, the
 *  Pending tag where the category goes, no menu. */
export function PendingRow({
  p,
  account,
  showAccount,
  showDate,
}: {
  p: PendingTransaction;
  account: Account | undefined;
  showAccount: boolean;
  showDate: boolean;
}) {
  const v = usePendingView(p, account);
  return (
    <TableRow className="hover:bg-transparent" title={NOT_POSTED}>
      <TableCell className="w-10 px-3 py-2">
        <Icons.Clock className="text-muted-foreground/70 h-4 w-4" aria-label="Pending" />
      </TableCell>
      {showDate && <TableCell className="text-muted-foreground w-28 whitespace-nowrap px-3 py-2 text-xs tabular-nums">{v.day}</TableCell>}
      <TableCell className="max-w-0! px-3 py-2">
        <div className="flex items-center gap-2">
          {v.merchant ? (
            <MerchantLogo url={v.merchant.logoUrl} name={v.merchant.name} whole={v.merchant.source === "bank"} className="opacity-80" />
          ) : null}
          <span className={cn("text-foreground/75 min-w-0 truncate text-sm", v.bankLine && "max-w-[50%] shrink-0")}>{v.name}</span>
          {v.bankLine ? <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">{v.bankLine}</span> : null}
        </div>
      </TableCell>
      {showAccount && (
        <TableCell className="w-40 px-3 py-2 opacity-80 max-lg:w-12">
          <AccountMark account={account} fallbackName={p.accountId} />
        </TableCell>
      )}
      <TableCell className="hidden w-44 px-3 py-2 sm:table-cell">
        <div className="flex items-center gap-2">
          <PendingPill />
          {!showDate && <span className="text-muted-foreground text-xs tabular-nums">{v.day}</span>}
        </div>
      </TableCell>
      <TableCell className={cn("w-28 whitespace-nowrap px-3 py-2 text-right text-sm font-medium tabular-nums", v.amountClass)}>
        {v.amount}
      </TableCell>
      <TableCell className="w-10 px-3 py-2" />
    </TableRow>
  );
}

function PendingCard({ p, account, showAccount }: { p: PendingTransaction; account: Account | undefined; showAccount: boolean }) {
  const v = usePendingView(p, account);
  return (
    <Card className="border-dashed p-2.5" title={NOT_POSTED}>
      <div className="flex items-center gap-2.5">
        {v.merchant ? (
          <MerchantLogo url={v.merchant.logoUrl} name={v.merchant.name} whole={v.merchant.source === "bank"} className="h-9 w-9 opacity-80" />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-foreground/75 min-w-0 flex-1 truncate text-sm font-medium">{v.name}</span>
            <span className={cn("shrink-0 text-sm font-medium tabular-nums", v.amountClass)}>{v.amount}</span>
          </div>
          {v.bankLine ? <div className="text-muted-foreground mt-0.5 truncate text-[11px]">{v.bankLine}</div> : null}
          <div className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px]">
            <PendingPill />
            <span className="shrink-0">{v.day}</span>
            {showAccount && (
              <>
                <span aria-hidden="true">·</span>
                <AccountLogo account={account} className="h-3.5 w-3.5 text-[7px]" />
                <span className="min-w-0 truncate">{account?.name ?? p.accountId}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

/** The phone list's pending cards, above the posted ones, headed like a day. */
export function PendingCards({
  items,
  accountById,
  showAccount,
}: {
  items: PendingTransaction[];
  accountById: Map<string, Account>;
  showAccount: boolean;
}) {
  if (!items.length) return null;
  return (
    <section aria-label="Pending transactions" className="space-y-2">
      <div className="flex items-baseline gap-2 px-1 pt-2">
        <span className="text-muted-foreground text-xs font-medium">Pending</span>
        <span className="text-muted-foreground text-xs tabular-nums">{items.length}</span>
        <PendingVsPosted className="ml-auto" />
      </div>
      {items.map((p) => (
        <PendingCard key={p.id} p={p} account={accountById.get(p.accountId)} showAccount={showAccount} />
      ))}
    </section>
  );
}
