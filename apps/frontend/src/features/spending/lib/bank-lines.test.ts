import { describe, expect, it, vi } from "vitest";

import type { CashActivity, CashActivitySearchRequest } from "../types/cash-activity";
import { bankLineFor, bankWordsFor, netOf, searchWithBankFields } from "./bank-lines";

const row = (id: string, notes: string, netAmount: number, currency = "USD", netAmountBase: number | null = netAmount) =>
  ({ id, notes, netAmount, netAmountBase, currency }) as unknown as CashActivity;

describe("bank lines", () => {
  it("hides a bank line that only repeats the payee", () => {
    const lines = { a: ["CITY OF CHICAGO WATER BILL 1364743", ""], b: ["Costco  ", ""] } as Record<string, [string, string]>;
    expect(bankLineFor(lines, row("a", "City Of Chicago", -1))).toBe("CITY OF CHICAGO WATER BILL 1364743");
    expect(bankLineFor(lines, row("b", "costco", -1))).toBeNull();
    expect(bankLineFor(lines, row("c", "x", -1))).toBeNull();
  });

  it("nets per currency without float drift, converted only across several", () => {
    expect(netOf([row("a", "", -0.1), row("b", "", -0.2)])).toEqual({
      byCurrency: [{ currency: "USD", amount: -0.3 }],
      converted: null,
    });
    const two = netOf([row("a", "", -10), row("b", "", 5, "EUR", 6)]);
    expect(two.byCurrency).toHaveLength(2);
    expect(two.converted?.amount).toBe(-4);
  });

  it("keeps payee matches plus bank-field matches, paged and netted", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ids: ["b"] }))) as typeof fetch;
    const all = [row("a", "City Of Chicago", -224.2), row("b", "Costco", -50), row("c", "Aldi", -5)];
    const server = vi.fn(async (r: CashActivitySearchRequest) => ({
      items: r.search ? [] : all.slice(r.offset ?? 0, (r.offset ?? 0) + (r.limit ?? 50)),
      totalCount: all.length,
      baseCurrency: "USD",
    }));
    const r = await searchWithBankFields({ search: "chicago", offset: 0, limit: 50 }, server);
    expect(r.items.map((a) => a.id)).toEqual(["a", "b"]);
    expect(r.totalCount).toBe(2);
    expect(r.net?.byCurrency).toEqual([{ currency: "USD", amount: -274.2 }]);
    expect(server.mock.calls[0][0].search).toBeUndefined();
  });
});

describe("bank words with the owner's note", () => {
  it("joins the bank's words and the note, either may be missing", () => {
    const lines = { a: ["X", "CITY OF CHICAGO | City Of Chicago"] } as Record<string, [string, string]>;
    expect(bankWordsFor(lines, "a", { a: "front porch" })).toBe("CITY OF CHICAGO | City Of Chicago | front porch");
    expect(bankWordsFor(lines, "b", { b: "cash to mom" })).toBe("cash to mom");
    expect(bankWordsFor(lines, "c", {})).toBeNull();
  });
});
