// money-hub patch: the Wealth check card on the Net worth tab (owner, 10-03). The PAW / UAW rule of thumb
// from The Millionaire Next Door: expected net worth = age x pre-tax yearly income / 10. A PAW holds at least
// double that, a UAW half or less. All worked out in the browser from numbers the app already has.

export type WealthStatus = "paw" | "middle" | "uaw";

export const PAW_MULTIPLE = 2;
export const UAW_MULTIPLE = 0.5;

export function expectedNetWorth(age: number, yearlyIncome: number): number {
  return (age * yearlyIncome) / 10;
}

export function wealthRatio(netWorth: number, expected: number): number | null {
  return expected > 0 ? netWorth / expected : null;
}

export function wealthStatus(ratio: number): WealthStatus {
  if (ratio >= PAW_MULTIPLE) return "paw";
  if (ratio <= UAW_MULTIPLE) return "uaw";
  return "middle";
}

function parseMeta(meta: string | null | undefined): Record<string, unknown> {
  if (!meta) return {};
  try {
    const parsed = JSON.parse(meta) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The account's own switch (meta.wealthCheckExclude): left out of the Wealth check's net worth. */
export function isLeftOutOfWealthCheck(account: { meta?: string | null }): boolean {
  return parseMeta(account.meta).wealthCheckExclude === true;
}

export function setWealthCheckExcludeInMeta(meta: string | null | undefined, on: boolean): string {
  const parsed = parseMeta(meta);
  if (on) parsed.wealthCheckExclude = true;
  else delete parsed.wealthCheckExclude;
  return JSON.stringify(parsed);
}

/** What an account adds to net worth, the way the server counts it (net_worth_service.rs): a card is its
 *  cash balance (negative = owed), every other account its total value. Base currency. */
export function accountNetWorthShare(
  account: { accountType: string },
  valuation: { totalValueBase: number; cashBalanceBase: number } | undefined,
): number {
  if (!valuation) return 0;
  return account.accountType === "CREDIT_CARD" ? valuation.cashBalanceBase : valuation.totalValueBase;
}

/** Net worth with the left-out accounts taken out. Accounts without a valuation yet count as zero. */
export function netWorthWithout(
  netWorth: number,
  leftOut: { accountType: string; id: string }[],
  valuations: { accountId: string; totalValueBase: number; cashBalanceBase: number }[],
): number {
  const byAccount = new Map(valuations.map((v) => [v.accountId, v]));
  return leftOut.reduce(
    (sum, account) => sum - accountNetWorthShare(account, byAccount.get(account.id)),
    netWorth,
  );
}

/** A property, loan or other held item's own switch (its metadata.wealthCheckExclude, saved as text). */
export function isHoldingLeftOut(metadata: Record<string, unknown> | null | undefined): boolean {
  const flag = metadata?.wealthCheckExclude;
  return flag === true || flag === "true";
}

/** Net worth with left-out properties, loans and the like taken out: an asset leaves, a loan is added back. */
export function netWorthWithoutItems(
  netWorth: number,
  leftOut: { value: number; liability: boolean }[],
): number {
  return leftOut.reduce((sum, item) => sum + (item.liability ? item.value : -item.value), netWorth);
}
