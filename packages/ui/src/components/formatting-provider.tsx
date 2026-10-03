import * as React from "react";
import { I18nProvider } from "@react-aria/i18n";
import {
  createAmountFormatting,
  createDateFormatting,
  createNumberFormatting,
  type AmountFormatting,
  type DateFormatting,
  type NumberFormatting,
  resolveFormattingLocale,
} from "../lib/formatting";

export interface LocalizationSettings {
  locale: string;
  uiLocale: string;
  timezone?: string;
}

const DEFAULT_LOCALIZATION_SETTINGS: LocalizationSettings = { locale: "en-US", uiLocale: "en" };
const DEFAULT_AMOUNT_FORMATTING = createAmountFormatting(DEFAULT_LOCALIZATION_SETTINGS.locale);
const DEFAULT_NUMBER_FORMATTING = createNumberFormatting(DEFAULT_LOCALIZATION_SETTINGS.locale);
const DEFAULT_DATE_FORMATTING = createDateFormatting(DEFAULT_LOCALIZATION_SETTINGS.locale);

const LocalizationSettingsContext = React.createContext(DEFAULT_LOCALIZATION_SETTINGS);
const AmountFormattingContext = React.createContext(DEFAULT_AMOUNT_FORMATTING);
const NumberFormattingContext = React.createContext(DEFAULT_NUMBER_FORMATTING);
const DateFormattingContext = React.createContext(DEFAULT_DATE_FORMATTING);

// money-hub patch: one currency for every amount in the app (owner, 10-03: "add an app-wide button in the
// side bar to switch values between USD and VND ... apply to all currency values of any page"). Amounts stay
// in their own currency everywhere; only what is shown changes, at the app's exchange rate. The formatters
// below convert before they format, so every page that formats through them follows the switch; a form
// where amounts are typed wraps itself in <NativeAmounts> to keep its own currency.
export interface DisplayCurrencySetting {
  /** The currency to show every amount in. */
  currency: string;
  /** How many `currency` one `from` is worth, or null when the app has no rate (then shown as it is). */
  rate: (from: string) => number | null;
}

export interface DisplayCurrency {
  /** The currency every amount is shown in, or null when each shows in its own. */
  currency: string | null;
  /** An amount as it is shown: in the display currency when a rate is known, else as it is. */
  convert: (value: number, currency: string) => { value: number; currency: string };
}

const SHOW_AS_IS: DisplayCurrency = {
  currency: null,
  convert: (value, currency) => ({ value, currency }),
};

export function createDisplayCurrency(setting: DisplayCurrencySetting | null | undefined): DisplayCurrency {
  if (!setting) return SHOW_AS_IS;
  const target = setting.currency.toUpperCase();
  return {
    currency: target,
    convert(value, currency) {
      const from = (currency || "").toUpperCase();
      // Quote units (GBp, ZAc) and odd codes stay as they are.
      if (!from || from === target || !/^[A-Z]{3}$/.test(from)) return { value, currency };
      const rate = setting.rate(from);
      return rate == null || !Number.isFinite(rate) ? { value, currency } : { value: value * rate, currency: target };
    },
  };
}

function numeric(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const result = typeof value === "number" ? value : Number(value);
  return Number.isFinite(result) ? result : null;
}

/** The app's amount formatters, converting to the display currency first. */
function convertingAmountFormatting(base: AmountFormatting, display: DisplayCurrency): AmountFormatting {
  if (!display.currency) return base;
  const shown = (value: number | string | null | undefined, currency: string) => {
    const amount = numeric(value);
    if (amount == null) return { value, currency };
    return display.convert(amount, currency);
  };
  return {
    ...base,
    formatAmount(value, currency, displayCurrency) {
      const s = shown(value, currency);
      return base.formatAmount(s.value, s.currency, displayCurrency);
    },
    formatCompactAmount(value, currency, displayCurrency, currencyDisplay) {
      const s = shown(value, currency);
      return base.formatCompactAmount(s.value, s.currency, displayCurrency, currencyDisplay);
    },
    formatPrice(value, currency, displayCurrency) {
      const s = shown(value, currency);
      // A price turned into a currency with no cents (VND) reads as a whole amount, not "₫3,903,551.00".
      if (s.currency !== currency && base.currencyFractionDigits(s.currency) === 0) {
        return base.formatAmount(s.value, s.currency, displayCurrency);
      }
      return base.formatPrice(s.value, s.currency, displayCurrency);
    },
    formatRoundedAmount(value, currency) {
      const s = shown(value, currency);
      return base.formatRoundedAmount(s.value, s.currency);
    },
    // The symbol and the digits stay the amount's own: they sit beside amounts being typed in.
  };
}

/** formatDecimal converts too when it is asked for a currency (style "currency"). */
function convertingNumberFormatting(
  base: NumberFormatting,
  display: DisplayCurrency,
  amounts: AmountFormatting,
): NumberFormatting {
  if (!display.currency) return base;
  return {
    ...base,
    formatDecimal(value, options) {
      const amount = numeric(value);
      if (amount == null || options?.style !== "currency" || !options.currency) {
        return base.formatDecimal(value, options);
      }
      const s = display.convert(amount, options.currency);
      if (s.currency === options.currency) return base.formatDecimal(value, options);
      // The new currency's own digits (none for VND), never more than were asked for.
      const digits = Math.min(
        amounts.currencyFractionDigits(s.currency),
        options.maximumFractionDigits ?? 20,
      );
      return base.formatDecimal(s.value, {
        ...options,
        currency: s.currency,
        minimumFractionDigits: Math.min(options.minimumFractionDigits ?? digits, digits),
        maximumFractionDigits: digits,
      });
    },
  };
}

const DisplayCurrencyContext = React.createContext<DisplayCurrency>(SHOW_AS_IS);
/** The formatters as they are, for <NativeAmounts>. */
const NativeAmountFormattingContext = React.createContext(DEFAULT_AMOUNT_FORMATTING);
const NativeNumberFormattingContext = React.createContext(DEFAULT_NUMBER_FORMATTING);

function FormattingRuntime({
  settings,
  displayCurrency,
  children,
}: {
  settings: LocalizationSettings;
  displayCurrency?: DisplayCurrencySetting | null;
  children: React.ReactNode;
}) {
  const nativeAmounts = React.useMemo<AmountFormatting>(
    () => createAmountFormatting(settings.locale),
    [settings.locale],
  );
  const nativeNumbers = React.useMemo<NumberFormatting>(
    () => createNumberFormatting(settings.locale),
    [settings.locale],
  );
  const display = React.useMemo(() => createDisplayCurrency(displayCurrency), [displayCurrency]);
  const amountFormatting = React.useMemo(
    () => convertingAmountFormatting(nativeAmounts, display),
    [nativeAmounts, display],
  );
  const numberFormatting = React.useMemo(
    () => convertingNumberFormatting(nativeNumbers, display, nativeAmounts),
    [nativeNumbers, display, nativeAmounts],
  );
  const dateFormatting = React.useMemo<DateFormatting>(
    () => createDateFormatting(settings.locale, settings.timezone),
    [settings.locale, settings.timezone],
  );

  return (
    <NativeAmountFormattingContext.Provider value={nativeAmounts}>
      <NativeNumberFormattingContext.Provider value={nativeNumbers}>
        <DisplayCurrencyContext.Provider value={display}>
          <AmountFormattingContext.Provider value={amountFormatting}>
            <NumberFormattingContext.Provider value={numberFormatting}>
              <DateFormattingContext.Provider value={dateFormatting}>{children}</DateFormattingContext.Provider>
            </NumberFormattingContext.Provider>
          </AmountFormattingContext.Provider>
        </DisplayCurrencyContext.Provider>
      </NativeNumberFormattingContext.Provider>
    </NativeAmountFormattingContext.Provider>
  );
}

/**
 * Amounts inside show in their own currency whatever the app-wide switch says: for forms and editors,
 * where an amount is typed in its own currency and the amounts beside it must match.
 */
export function NativeAmounts({ children }: { children: React.ReactNode }) {
  const amounts = React.useContext(NativeAmountFormattingContext);
  const numbers = React.useContext(NativeNumberFormattingContext);
  return (
    <DisplayCurrencyContext.Provider value={SHOW_AS_IS}>
      <AmountFormattingContext.Provider value={amounts}>
        <NumberFormattingContext.Provider value={numbers}>{children}</NumberFormattingContext.Provider>
      </AmountFormattingContext.Provider>
    </DisplayCurrencyContext.Provider>
  );
}

function resolveInterfaceLocale(uiLocale: string, formattingLocale: string): string {
  const formatting = new Intl.Locale(formattingLocale);
  const options: Intl.LocaleOptions = {};
  if (formatting.region) options.region = formatting.region;
  if (formatting.calendar) options.calendar = formatting.calendar;
  if (formatting.numberingSystem) options.numberingSystem = formatting.numberingSystem;
  return new Intl.Locale(uiLocale, options).toString();
}

export function FormattingProvider({
  locale,
  uiLocale = "en",
  timezone,
  displayCurrency,
  children,
}: {
  locale: string;
  uiLocale?: string;
  timezone?: string;
  /** Show every amount in this currency (money-hub); omitted, each shows in its own. */
  displayCurrency?: DisplayCurrencySetting | null;
  children: React.ReactNode;
}) {
  const resolvedLocale = resolveFormattingLocale(locale);
  const interfaceLocale = resolveInterfaceLocale(uiLocale, resolvedLocale);
  const settings = React.useMemo(
    () => ({ locale: resolvedLocale, uiLocale, timezone }),
    [resolvedLocale, uiLocale, timezone],
  );
  return (
    <I18nProvider locale={interfaceLocale}>
      <LocalizationSettingsContext.Provider value={settings}>
        <FormattingRuntime settings={settings} displayCurrency={displayCurrency}>
          {children}
        </FormattingRuntime>
      </LocalizationSettingsContext.Provider>
    </I18nProvider>
  );
}

export function useLocalizationSettings(): LocalizationSettings {
  return React.useContext(LocalizationSettingsContext);
}

export function useAmountFormatting(): AmountFormatting {
  return React.useContext(AmountFormattingContext);
}

export function useNumberFormatting(): NumberFormatting {
  return React.useContext(NumberFormattingContext);
}

export function useDateFormatting(): DateFormatting {
  return React.useContext(DateFormattingContext);
}

/** The app-wide display currency: which one, and how to turn an amount into it. */
export function useDisplayCurrency(): DisplayCurrency {
  return React.useContext(DisplayCurrencyContext);
}
