import { describe, expect, it } from "vitest";
import { flattenAssetClasses } from "./flat-asset-classes";

const child = { categoryId: "EQUITY_PUBLIC", categoryName: "Public Stocks", color: "#1", value: 10, percentage: 50 };

describe("flattenAssetClasses", () => {
  it("drops sub-rows and labels each class, keeping ids and values", () => {
    const flat = flattenAssetClasses({
      taxonomyId: "asset_classes",
      taxonomyName: "Asset Classes",
      color: "#0",
      categories: [
        { categoryId: "EQUITY", categoryName: "Equity", color: "#1", value: 10, percentage: 50, children: [child] },
        { categoryId: "CASH", categoryName: "Cash", color: "#2", value: 6, percentage: 30, children: [{ ...child, categoryId: "CASH_BANK_DEPOSITS", categoryName: "Bank Deposits" }] },
        { categoryId: "uuid-1", categoryName: "Options", color: "#3", value: 4, percentage: 20 },
      ],
    });
    expect(flat.categories.map((c) => c.categoryName)).toEqual(["Stocks & ETFs", "Cash", "Stock Options"]);
    expect(flat.categories.map((c) => c.categoryId)).toEqual(["EQUITY", "CASH", "uuid-1"]);
    expect(flat.categories.every((c) => !c.children)).toBe(true);
    expect(flat.categories.map((c) => c.value)).toEqual([10, 6, 4]);
  });
});
