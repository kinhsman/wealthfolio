import { describe, expect, it } from "vitest";
import { chargeLink, receiptSplit, receiptState, shortCategory, storeName } from "./receipts";

const item = (categoryId: string, price: number) => ({ n: 0, name: "", what: "", code: null, price, taxable: false, categoryId });

describe("receipts", () => {
  it("shows what was filed, else what the lines say, biggest first", () => {
    const filed = { how: "split" as const, lines: [{ categoryId: "h", amount: "134.72" }, { categoryId: "g", amount: "44.24" }], charge: 178.96, at: "" };
    expect(receiptSplit({ filed, items: [] })).toEqual([{ categoryId: "h", amount: 134.72 }, { categoryId: "g", amount: 44.24 }]);
    expect(receiptSplit({ filed: null, items: [item("g", 10), item("h", 99.99), item("h", -20), item("x", -1)] })).toEqual([
      { categoryId: "h", amount: 79.99 },
      { categoryId: "g", amount: 10 },
    ]);
  });

  it("says where a receipt stands", () => {
    expect(receiptState({ status: "filed", filed: { how: "split", lines: [{ categoryId: "a", amount: "1" }, { categoryId: "b", amount: "2" }], charge: 3, at: "" } }).text).toBe("Split 2 ways");
    expect(receiptState({ status: "waiting", filed: null }).tone).toBe("plain");
    expect(receiptState({ status: "held", filed: null }).tone).toBe("look");
  });

  it("names the store and the category plainly", () => {
    expect(storeName("COSTCO WHOLESALE")).toBe("Costco Wholesale");
    expect(storeName("Trader Joe's")).toBe("Trader Joe's");
    expect(storeName(null)).toBe("Receipt");
    expect(shortCategory([{ id: "h", name: "Housing > Home maintenance" }], "h")).toBe("Home maintenance");
  });

  it("links to the charge in Transactions by its day and amount", () => {
    expect(chargeLink({ chargeDate: "2026-10-03", filed: null, total: 178.96 })).toBe(
      "/activities?tab=spending&from=2026-10-03&to=2026-10-03&amountMin=178.96&amountMax=178.96",
    );
    expect(chargeLink({ chargeDate: null, filed: null, total: 5 })).toBeNull();
  });
});
