import { describe, expect, it } from "vitest";

import { SAVINGS_ROW_ID, type WhereItWentRow } from "./category-rollup";
import { topMovers } from "./why-moved";

const row = (id: string, delta: number): WhereItWentRow => ({
  id, name: id, color: null, icon: null, amount: 100, subCount: 0, txCount: 1, delta, deltaPct: null,
});

describe("topMovers", () => {
  it("lists the categories that pushed the total up, biggest first, and sums the rest", () => {
    const r = topMovers([row("a", 50), row("b", 300), row("c", 20), row("d", -80), row("e", 10), row("f", 5), row(SAVINGS_ROW_ID, 999)], 305, 2);
    expect(r.movers.map((m) => m.id)).toEqual(["b", "a"]);
    expect(r.restCount).toBe(3);
    expect(r.restDelta).toBe(35);
    expect(r.againstDelta).toBe(-80);
  });

  it("follows the total down when spending fell", () => {
    const r = topMovers([row("a", -50), row("b", 30)], -20);
    expect(r.movers.map((m) => m.id)).toEqual(["a"]);
    expect(r.againstDelta).toBe(30);
  });
});
