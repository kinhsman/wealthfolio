import { describe, expect, it } from "vitest";

import type { CashActivity } from "../types/cash-activity";
import { excludedWithDescendants, leftOutByCategory } from "./left-out";

const cats = [
  { id: "a", name: "Counted elsewhere", parentId: null },
  { id: "a1", name: "Mortgage", parentId: "a" },
  { id: "b", name: "Internal Transfer", parentId: null },
  { id: "c", name: "Groceries", parentId: null },
];

const row = (netAmountBase: number, categoryId: string, splits: unknown[] = []) =>
  ({ netAmountBase, assignments: [{ categoryId }], splits }) as unknown as CashActivity;

describe("excludedWithDescendants", () => {
  it("adds subcategories of an excluded category", () => {
    expect(excludedWithDescendants(["a"], cats).sort()).toEqual(["a", "a1"]);
  });
});

describe("leftOutByCategory", () => {
  it("sums money out per excluded category, subcategories rolling up, biggest first", () => {
    const rows = leftOutByCategory(
      [row(-2000, "a1"), row(-500, "a"), row(-0.4, "b"), row(-40, "c"), row(300, "b")],
      ["a", "b"],
      cats,
    );
    expect(rows.map((r) => [r.name, Math.round(r.amount * 100) / 100, r.count])).toEqual([
      ["Counted elsewhere", 2500, 2],
      ["Internal Transfer", 0.4, 1],
    ]);
  });

  it("splits one transaction across the categories of its splits", () => {
    const rows = leftOutByCategory(
      [row(-100, "c", [{ categoryId: "a", amount: 60 }, { categoryId: "c", amount: 40 }])],
      ["a"],
      cats,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBeCloseTo(60);
  });

  it("leaves out categories with nothing in the period", () => {
    expect(leftOutByCategory([], ["a"], cats)).toEqual([]);
  });
});
