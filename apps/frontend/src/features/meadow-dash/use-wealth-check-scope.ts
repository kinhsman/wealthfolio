// money-hub patch: what the Wealth check counts. Every account and every property / loan / other held item on the
// Net worth tab, each with its own "left out" flag: accounts in their meta, held items in their metadata
// (lib/wealth-check.ts). Shared by the Wealth check card and the gear panel that switches things off.
import { useMemo } from "react";

import { useAccounts } from "@/hooks/use-accounts";
import { useAlternativeHoldings } from "@/hooks/use-alternative-assets";
import { useLatestValuations } from "@/hooks/use-latest-valuations";
import {
  accountNetWorthShare,
  isHoldingLeftOut,
  isLeftOutOfWealthCheck,
  netWorthWithoutItems,
} from "@/lib/wealth-check";
import type { Account } from "@/lib/types";
import type { ParsedNetWorth } from "@/pages/net-worth/components/utils";

export interface ScopeAccount {
  account: Account;
  /** What the account adds to net worth (a card owes, so it is negative). */
  share: number;
  leftOut: boolean;
}

export interface ScopeItem {
  id: string;
  name: string;
  /** Positive magnitude, as the breakdown shows it. */
  value: number;
  liability: boolean;
  leftOut: boolean;
}

// Cash and card lines are accounts already, listed under Accounts.
const isAccountLine = (assetId: string) => assetId.startsWith("CASH:") || assetId.startsWith("CREDIT_CARD:");

export function useWealthCheckScope(data: ParsedNetWorth) {
  const { accounts } = useAccounts({ filterActive: false, includeArchived: false });
  const { latestValuations, isLoading: valuationsLoading } = useLatestValuations(
    useMemo(() => accounts.map((a) => a.id), [accounts]),
  );
  const { data: holdings } = useAlternativeHoldings();

  // A card has no stored valuation, so what it adds to net worth comes from its own line in the breakdown
  // (CREDIT_CARD:<id> owes, CASH:<id> holds), the same numbers the server counted.
  const lineShares = useMemo(() => {
    const shares = new Map<string, number>();
    for (const category of data.assets.breakdown) {
      for (const child of category.children ?? []) {
        if (child.assetId?.startsWith("CASH:")) shares.set(child.assetId.slice(5), child.value);
      }
    }
    for (const liability of data.liabilities.breakdown) {
      if (liability.assetId?.startsWith("CREDIT_CARD:")) {
        const id = liability.assetId.slice(12);
        shares.set(id, (shares.get(id) ?? 0) - liability.value);
      }
    }
    return shares;
  }, [data]);

  const accountRows = useMemo<ScopeAccount[]>(() => {
    const byAccount = new Map((latestValuations ?? []).map((v) => [v.accountId, v]));
    return accounts
      .map((account) => {
        const valued = account.accountType !== "CREDIT_CARD" && byAccount.has(account.id);
        return {
          account,
          share: valued
            ? accountNetWorthShare(account, byAccount.get(account.id))
            : (lineShares.get(account.id) ?? 0),
          leftOut: isLeftOutOfWealthCheck(account),
        };
      })
      .filter((row) => row.share !== 0 || row.leftOut)
      .sort((a, b) => Math.abs(b.share) - Math.abs(a.share));
  }, [accounts, latestValuations, lineShares]);

  const items = useMemo<ScopeItem[]>(() => {
    const flags = new Map((holdings ?? []).map((h) => [h.id, isHoldingLeftOut(h.metadata)]));
    const lines = [
      ...data.assets.breakdown.flatMap((category) => category.children ?? []).map((c) => ({ ...c, liability: false })),
      ...data.liabilities.breakdown.map((l) => ({ ...l, liability: true })),
    ];
    return lines
      .filter((line) => line.assetId && !isAccountLine(line.assetId))
      .map((line) => ({
        id: line.assetId!,
        name: line.name,
        value: line.value,
        liability: line.liability,
        leftOut: flags.get(line.assetId!) === true,
      }))
      .sort((a, b) => b.value - a.value);
  }, [data, holdings]);

  const counted = useMemo(() => {
    const withoutAccounts = accountRows
      .filter((row) => row.leftOut)
      .reduce((sum, row) => sum - row.share, data.netWorth);
    return netWorthWithoutItems(withoutAccounts, items.filter((i) => i.leftOut));
  }, [accountRows, items, data.netWorth]);

  const leftOutCount = accountRows.filter((r) => r.leftOut).length + items.filter((i) => i.leftOut).length;

  return { accountRows, items, counted, leftOutCount, isLoading: valuationsLoading };
}
