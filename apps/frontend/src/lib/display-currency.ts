// money-hub patch: "Show in USD" for an account kept in another currency (owner, 2026-10-02: "add a
// switch to USD for these foreign accounts, the app already have an exchange rate configure"). The
// account stays in its own currency (VND for ACB and MB, read from their alert emails); only what is
// shown changes: its value, its entries in the account page, the Spending list and Recent activity,
// at the app's latest rate (Settings, Exchange rates). Kept per account as `meta.showInBase`.
import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getExchangeRates } from "@/adapters";
import { useAccounts } from "@/hooks/use-accounts";
import { useSettingsContext } from "@/lib/settings-provider";
import type { Account, ExchangeRate } from "@/lib/types";

function parseMeta(meta?: string | null): Record<string, unknown> {
  if (!meta) return {};
  try {
    const parsed = JSON.parse(meta) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function showsInBase(account?: Pick<Account, "meta"> | null): boolean {
  return parseMeta(account?.meta).showInBase === true;
}

export function setShowInBaseInMeta(meta: string | null | undefined, on: boolean): string {
  const parsed = parseMeta(meta);
  if (on) parsed.showInBase = true;
  else delete parsed.showInBase;
  return JSON.stringify(parsed);
}

/** How many `to` one `from` is worth, from the app's latest rates (either direction), or null. */
export function rateBetween(rates: ExchangeRate[] | undefined, from: string, to: string): number | null {
  if (from.toUpperCase() === to.toUpperCase()) return 1;
  for (const r of rates ?? []) {
    const rate = Number(r.rate);
    if (!rate) continue;
    if (r.fromCurrency.toUpperCase() === from.toUpperCase() && r.toCurrency.toUpperCase() === to.toUpperCase()) return rate;
    if (r.fromCurrency.toUpperCase() === to.toUpperCase() && r.toCurrency.toUpperCase() === from.toUpperCase()) return 1 / rate;
  }
  return null;
}

export type Shown = { amount: number; currency: string; converted: boolean };

/**
 * A function that turns an amount of one account into what to show: in the base currency when that
 * account has Show in USD on and a rate is known, else as it is.
 */
export function useShownAmount(): (amount: number, currency: string, accountId?: string | null) => Shown {
  const { accounts } = useAccounts({ filterActive: false, includeArchived: true });
  const { settings } = useSettingsContext();
  const base = settings?.baseCurrency ?? "USD";
  const flagged = useMemo(() => new Set(accounts.filter((a) => showsInBase(a)).map((a) => a.id)), [accounts]);
  const { data: rates } = useQuery({
    queryKey: ["money-hub", "latest-exchange-rates"],
    queryFn: getExchangeRates,
    staleTime: 10 * 60_000,
    enabled: flagged.size > 0,
  });
  return useCallback(
    (amount: number, currency: string, accountId?: string | null) => {
      if (!accountId || !flagged.has(accountId) || !currency || currency.toUpperCase() === base.toUpperCase()) {
        return { amount, currency, converted: false };
      }
      const rate = rateBetween(rates, currency, base);
      return rate == null ? { amount, currency, converted: false } : { amount: amount * rate, currency: base, converted: true };
    },
    [flagged, rates, base],
  );
}
