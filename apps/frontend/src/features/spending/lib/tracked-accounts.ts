// money-hub patch: which accounts Spending tracks (Settings, Spending, Accounts). The Add transaction form
// and the Transactions page only list tracked accounts, so a Cash or Credit card account made from the
// account form used to be missing from Add transaction until its switch was found in Settings (owner,
// 2026-10-04: "created a cash wallet account ... tried to add a transaction but the drop down menu
// doesnt show this account"). The account form now shows the switch, on by default for a new account.
import type { QueryClient } from "@tanstack/react-query";

import { isRentalMeta } from "@/lib/account-display";
import { QueryKeys } from "@/lib/query-keys";

import { getSpendingSettings, updateSpendingSettings } from "../adapters/settings";
import { isSpendingAccountType } from "./constants";
import { invalidateSpendingCaches } from "./invalidation";

/** Only Cash and Credit card accounts can be tracked, and a rental ledger never is (its rent and cost entries are not spending). */
export function canTrackInSpending(accountType: string | undefined, meta?: string | null): boolean {
  return isSpendingAccountType(accountType) && !isRentalMeta(meta);
}

/** The tracked list with one account switched on or off; the other accounts keep their order. */
export function withTrackedAccount(
  ids: readonly string[],
  accountId: string,
  tracked: boolean,
): string[] {
  if (tracked) return ids.includes(accountId) ? [...ids] : [...ids, accountId];
  return ids.filter((id) => id !== accountId);
}

/**
 * What the account form should do about tracking when it saves, or null for "leave it alone".
 * A new account follows its switch (on unless the owner turned it off); an existing one changes only
 * when the owner touched the switch, so an edit can never untrack an account by accident.
 */
export function trackingToApply(args: {
  accountType: string | undefined;
  meta?: string | null;
  isNew: boolean;
  choice: boolean | null;
}): boolean | null {
  if (!canTrackInSpending(args.accountType, args.meta)) return null;
  if (args.isNew) return args.choice ?? true;
  return args.choice;
}

/**
 * Switch one account on or off in Spending's list. Reads the saved list fresh first, so a stale screen
 * cannot overwrite a change made somewhere else; does nothing when it is already as wanted.
 * Takes the query client (not a hook) so it still finishes after the account dialog has closed.
 */
export async function setAccountTracked(
  qc: QueryClient,
  accountId: string,
  tracked: boolean,
): Promise<void> {
  const current = await qc.fetchQuery({
    queryKey: [QueryKeys.SPENDING_SETTINGS],
    queryFn: getSpendingSettings,
    staleTime: 0,
  });
  if (current.accountIds.includes(accountId) === tracked) return;
  const next = await updateSpendingSettings({
    accountIds: withTrackedAccount(current.accountIds, accountId, tracked),
  });
  qc.setQueryData([QueryKeys.SPENDING_SETTINGS], next);
  invalidateSpendingCaches(qc);
  await qc.invalidateQueries({ queryKey: [QueryKeys.ACTIVITY_DATA] });
}
