// money-hub patch: one switch for the whole app, USD or VND (owner, 10-03: "add an app-wide button in the side
// bar to switch values between USD and VND. this will use the app's exchange rate configured, and apply to all
// currency values of any page"). USD is the app as it always was: each amount in its own currency (the ACB and
// MB accounts in dong unless their own "Show in USD" is on). VND shows every amount in dong at the app's latest
// rate (Settings, Exchange rates). Nothing stored changes; only what is shown. Kept per device and profile.
// The formatters do the converting (@wealthfolio/ui FormattingProvider, given this setting by settings-provider);
// the Rental add-on gets the currency and rate with the app's colours (addon-sandbox-theme.ts).
import { useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAmountFormatting, type DisplayCurrencySetting } from "@wealthfolio/ui";
import { getExchangeRates } from "@/adapters";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { rateBetween } from "@/lib/display-currency";

export type AppCurrency = "USD" | "VND";
export const APP_CURRENCIES: AppCurrency[] = ["USD", "VND"];

const KEY = "app-currency";

export function useAppCurrency() {
  const [stored, setCurrency] = usePersistentState<AppCurrency>(KEY, "USD");
  const currency: AppCurrency = stored === "VND" ? "VND" : "USD";
  return [currency, setCurrency] as const;
}

/** The setting for the formatters: null shows each amount in its own currency (USD, the app as it was). */
export function useAppCurrencySetting(baseCurrency: string | undefined): DisplayCurrencySetting | null {
  const [currency] = useAppCurrency();
  const on = currency === "VND";
  const { data: rates } = useQuery({
    // The same latest rates the per-account "Show in USD" reads (lib/display-currency.ts).
    queryKey: ["money-hub", "latest-exchange-rates"],
    queryFn: getExchangeRates,
    staleTime: 10 * 60_000,
    enabled: on,
  });
  const base = (baseCurrency || "USD").toUpperCase();

  const setting = useMemo<DisplayCurrencySetting | null>(() => {
    if (!on || !rates) return null;
    const cache = new Map<string, number | null>();
    return {
      currency,
      rate(from) {
        if (!cache.has(from)) {
          // Straight from the rate list, else through the base currency (EUR -> USD -> VND).
          const direct = rateBetween(rates, from, currency);
          const toBase = direct == null ? rateBetween(rates, from, base) : null;
          const baseOn = toBase == null ? null : rateBetween(rates, base, currency);
          cache.set(from, direct ?? (toBase != null && baseOn != null ? toBase * baseOn : null));
        }
        return cache.get(from) ?? null;
      },
    };
  }, [on, rates, currency, base]);

  // The Rental add-on runs in its own frame: it reads these with the app's colours.
  const usdRate = setting?.rate("USD") ?? null;
  useEffect(() => {
    const html = document.documentElement;
    if (setting && usdRate != null) {
      html.dataset.displayCurrency = setting.currency;
      html.dataset.displayRate = String(usdRate);
    } else {
      delete html.dataset.displayCurrency;
      delete html.dataset.displayRate;
    }
  }, [setting, usdRate]);

  return setting;
}

/** Dollars as the app shows them ("$1,234.56", or dong when the switch says VND), for amounts kept in USD. */
export function useUsd() {
  const { formatAmount } = useAmountFormatting();
  return useCallback((n: number) => formatAmount(n, "USD"), [formatAmount]);
}

/** The same in whole dollars ("$1,235"). */
export function useUsdWhole() {
  const { formatRoundedAmount } = useAmountFormatting();
  return useCallback((n: number) => formatRoundedAmount(n, "USD"), [formatRoundedAmount]);
}
