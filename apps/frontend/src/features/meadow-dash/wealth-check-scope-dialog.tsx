// money-hub patch: the gear on the Net worth tab opens this panel: everything the Wealth check counts, each with
// a switch (owner, 10-03: "a small setting panel ... listing all account that is currently linked ... switch off
// toggle conveniently there"). Off = left out of the Wealth check only; the net worth on the page does not change.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { updateAccount, updateAlternativeAssetMetadata } from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import { setWealthCheckExcludeInMeta } from "@/lib/wealth-check";
import { CompactAmount } from "@/pages/net-worth/components/compact-amount";
import type { ParsedNetWorth } from "@/pages/net-worth/components/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@wealthfolio/ui/components/ui/dialog";
import { Switch } from "@wealthfolio/ui/components/ui/switch";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";

import { useWealthCheckScope } from "./use-wealth-check-scope";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ParsedNetWorth;
  currency: string;
}

export function WealthCheckScopeDialog({ open, onOpenChange, data, currency }: Props) {
  const queryClient = useQueryClient();
  const { accountRows, items, counted, leftOutCount } = useWealthCheckScope(data);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(id: string, save: () => Promise<unknown>) {
    setBusy(id);
    try {
      await save();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [QueryKeys.ACCOUNTS] }),
        queryClient.invalidateQueries({ queryKey: [QueryKeys.ALTERNATIVE_HOLDINGS] }),
      ]);
    } catch {
      toast({ title: "Could not save that switch. Please try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  const row = (
    id: string,
    name: string,
    detail: string,
    amount: number,
    leftOut: boolean,
    save: (counted: boolean) => Promise<unknown>,
  ) => (
    <li key={id} className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className={`truncate text-sm ${leftOut ? "text-muted-foreground line-through" : ""}`}>{name}</div>
        <div className="text-muted-foreground text-xs">{detail}</div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className={`text-sm tabular-nums ${leftOut ? "text-muted-foreground" : ""}`}>
          <CompactAmount value={amount} currency={currency} />
        </span>
        <Switch
          checked={!leftOut}
          disabled={busy === id}
          aria-label={`${name} counts in Wealth check`}
          onCheckedChange={(on) => void run(id, () => save(on))}
        />
      </div>
    </li>
  );

  const section = (title: string, rows: React.ReactNode[]) =>
    rows.length ? (
      <section>
        <h3 className="text-muted-foreground/70 pb-1 text-xs font-semibold uppercase tracking-wide">{title}</h3>
        <ul className="divide-y divide-[var(--m-line)]">{rows}</ul>
      </section>
    ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>What counts in Wealth check</DialogTitle>
          <DialogDescription>
            Switch something off to take it out of the Wealth check. Your net worth above does not change.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          {section(
            "Accounts",
            accountRows.map(({ account, share, leftOut }) =>
              row(
                account.id,
                account.name,
                account.accountType === "CREDIT_CARD" ? "Card" : account.accountType === "CASH" ? "Cash" : "Investments",
                share,
                leftOut,
                (on) => updateAccount({ ...account, meta: setWealthCheckExcludeInMeta(account.meta, !on) }),
              ),
            ),
          )}
          {section(
            "Properties, loans and other",
            items.map((item) =>
              row(
                item.id,
                item.name,
                item.liability ? "Loan or debt" : "Asset",
                item.liability ? -item.value : item.value,
                item.leftOut,
                (on) => updateAlternativeAssetMetadata(item.id, { wealthCheckExclude: on ? "" : "true" }),
              ),
            ),
          )}
        </div>
        <div className="border-t border-[var(--m-line)] pt-3 text-sm">
          <span className="text-muted-foreground">Counted in Wealth check: </span>
          <span className="font-semibold tabular-nums">
            <CompactAmount value={counted} currency={currency} />
          </span>
          {leftOutCount > 0 ? (
            <span className="text-muted-foreground"> ({leftOutCount} left out)</span>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
