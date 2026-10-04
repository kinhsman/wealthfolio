import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ stored: "USD" as string }));
const getExchangeRates = vi.hoisted(() => vi.fn());

vi.mock("@/adapters", () => ({ getExchangeRates }));
vi.mock("@/hooks/use-persistent-state", () => ({
  usePersistentState: () => [state.stored, vi.fn()],
}));

import { useAppCurrency, useAppCurrencySetting } from "./app-currency";

// The sidebar's three choices: USD and VND show every amount in that currency at the app's rate; Original
// shows each amount in the currency it is kept in (no setting, no rate asked for, nothing handed to the Rental page).
const RATES = [
  { id: "1", fromCurrency: "USD", toCurrency: "VND", rate: 25_984, source: "YAHOO", timestamp: "2026-10-02" },
];

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("app currency choice", () => {
  beforeEach(() => {
    getExchangeRates.mockReset();
    getExchangeRates.mockResolvedValue(RATES);
    delete document.documentElement.dataset.displayCurrency;
    delete document.documentElement.dataset.displayRate;
  });

  it("reads the three choices, USD for anything else", () => {
    for (const [stored, shown] of [
      ["USD", "USD"],
      ["VND", "VND"],
      ["ORIGINAL", "ORIGINAL"],
      ["EUR", "USD"],
    ]) {
      state.stored = stored;
      expect(renderHook(() => useAppCurrency(), { wrapper }).result.current[0]).toBe(shown);
    }
  });

  it("converts at the app's rate on USD and VND", async () => {
    state.stored = "VND";
    const { result } = renderHook(() => useAppCurrencySetting("USD"), { wrapper });
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.currency).toBe("VND");
    expect(result.current?.rate("USD")).toBe(25_984);
    expect(document.documentElement.dataset.displayCurrency).toBe("VND");
    expect(document.documentElement.dataset.displayRate).toBe("25984");
  });

  it("translates nothing on Original: no setting, no rate fetched, nothing handed to the Rental page", async () => {
    state.stored = "ORIGINAL";
    const { result } = renderHook(() => useAppCurrencySetting("USD"), { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current).toBeNull();
    expect(getExchangeRates).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.displayCurrency).toBeUndefined();
    expect(document.documentElement.dataset.displayRate).toBeUndefined();
  });
});
