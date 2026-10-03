import { render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  AmountDisplay,
  FormattingProvider,
  NativeAmounts,
  useAmountFormatting,
  useDisplayCurrency,
  useNumberFormatting,
  type DisplayCurrencySetting,
} from "@wealthfolio/ui";

// The sidebar's USD / VND switch: the app's formatters show every amount in dong at the app's rate, a form
// wrapped in NativeAmounts keeps its own currency, and USD leaves every amount as it was.
const VND: DisplayCurrencySetting = {
  currency: "VND",
  rate: (from) => (from === "USD" ? 25_984 : null),
};

function wrap(setting: DisplayCurrencySetting | null) {
  return ({ children }: { children: ReactNode }) => (
    <FormattingProvider locale="en-US" displayCurrency={setting}>
      {children}
    </FormattingProvider>
  );
}

describe("app-wide display currency", () => {
  it("shows dollars in dong, with no cents", () => {
    const { result } = renderHook(() => useAmountFormatting(), { wrapper: wrap(VND) });
    expect(result.current.formatAmount(100, "USD")).toBe("₫2,598,400");
    expect(result.current.formatRoundedAmount(1.5, "USD")).toBe("₫38,976");
    expect(result.current.formatCompactAmount(1_000_000, "USD")).toBe("₫25.98B");
    expect(result.current.formatPrice(150.25, "USD")).toBe("₫3,904,096");
  });

  it("leaves amounts already in dong alone", () => {
    const { result } = renderHook(() => useAmountFormatting(), { wrapper: wrap(VND) });
    expect(result.current.formatAmount(50_000, "VND")).toBe("₫50,000");
  });

  it("shows an amount as it is when the app has no rate for its currency", () => {
    const { result } = renderHook(() => useAmountFormatting(), { wrapper: wrap(VND) });
    expect(result.current.formatAmount(10, "EUR")).toBe("€10.00");
  });

  it("keeps the symbol of the amount's own currency (it sits beside amounts being typed)", () => {
    const { result } = renderHook(() => useAmountFormatting(), { wrapper: wrap(VND) });
    expect(result.current.formatCurrencySymbol("USD")).toBe("$");
  });

  it("converts formatDecimal when it is asked for a currency, in that currency's digits", () => {
    const { result } = renderHook(() => useNumberFormatting(), { wrapper: wrap(VND) });
    expect(
      result.current.formatDecimal(100, {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    ).toBe("₫2,598,400");
    expect(result.current.formatDecimal(1234.5)).toBe("1,234.5");
  });

  it("tells components the shown currency and converts for them", () => {
    const { result } = renderHook(() => useDisplayCurrency(), { wrapper: wrap(VND) });
    expect(result.current.currency).toBe("VND");
    expect(result.current.convert(2, "USD")).toEqual({ value: 51_968, currency: "VND" });
  });

  it("keeps a form's amounts in their own currency inside NativeAmounts", () => {
    render(
      <FormattingProvider locale="en-US" displayCurrency={VND}>
        <AmountDisplay value={100} currency="USD" />
        <NativeAmounts>
          <AmountDisplay value={100} currency="USD" />
        </NativeAmounts>
      </FormattingProvider>,
    );
    expect(screen.getByText("₫2,598,400")).toBeInTheDocument();
    expect(screen.getByText("$100.00")).toBeInTheDocument();
  });

  it("changes nothing on null setting", () => {
    const { result } = renderHook(() => useAmountFormatting(), { wrapper: wrap(null) });
    expect(result.current.formatAmount(100, "USD")).toBe("$100.00");
    expect(result.current.formatAmount(50_000, "VND")).toBe("₫50,000");
    const display = renderHook(() => useDisplayCurrency(), { wrapper: wrap(null) });
    expect(display.result.current.currency).toBeNull();
  });

  it("converts dong to dollars when USD is the display currency", () => {
    const USD: DisplayCurrencySetting = {
      currency: "USD",
      rate: (from) => (from === "VND" ? 1 / 25_984 : null),
    };
    const { result } = renderHook(() => useAmountFormatting(), { wrapper: wrap(USD) });
    expect(result.current.formatAmount(25_984, "VND")).toBe("$1.00");
    expect(result.current.formatAmount(100, "USD")).toBe("$100.00");
    expect(result.current.formatAmount(18_956_000_000, "VND")).toBe("$729,525.86");
  });
});
