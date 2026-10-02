import { describe, expect, it } from "vitest";

import {
  barParts,
  inDays,
  knownPeople,
  listed,
  shortDay,
  yearChoices,
  type GiftOut,
  type TaxesView,
} from "./taxes";

const trading = (over: Partial<TaxesView["trading"]> = {}): TaxesView["trading"] => ({
  accounts: [],
  taxed: 18696.94,
  shortTerm: 18494.16,
  longTerm: 0,
  other: 202.78,
  notTaxed: 29529.67,
  notMine: 62164.03,
  asOf: null,
  error: null,
  ...over,
});

const wire = (over: Partial<GiftOut>): GiftOut => ({
  id: "w",
  date: "2026-02-09",
  amount: 1000,
  account: null,
  gift: null,
  to: "",
  offered: "",
  landedIn: null,
  picked: false,
  ...over,
});

describe("taxes helpers", () => {
  it("gives the split bar only the parts above zero", () => {
    expect(barParts(trading()).map((p) => p.key)).toEqual(["short", "other", "free"]);
    expect(barParts(trading({ shortTerm: -5890.93, longTerm: 1200 })).map((p) => p.key)).toEqual([
      "long",
      "other",
      "free",
    ]);
    expect(barParts(trading({ shortTerm: 0, other: 0, notTaxed: 0 }))).toEqual([]);
  });

  it("offers the two tax years a payment's date can belong to", () => {
    expect(yearChoices({ date: "2026-04-15" })).toEqual([2025, 2026]);
  });

  it("words days, dates and lists plainly", () => {
    expect(inDays(0)).toBe("today");
    expect(inDays(1)).toBe("tomorrow");
    expect(inDays(105)).toBe("105 days");
    expect(shortDay("2027-01-15")).toBe("Jan 15");
    expect(shortDay("2027-04-15", true)).toBe("Apr 15, 2027");
    expect(listed([])).toBe("");
    expect(listed(["Hien"])).toBe("Hien");
    expect(listed(["Hien", "Khoi"])).toBe("Hien and Khoi");
    expect(listed(["A", "B", "C"])).toBe("A, B and C");
  });

  it("lists the people already named for gifts, most money first, once each", () => {
    const rows = [
      wire({ id: "1", amount: 20000, gift: true, to: "Khoi", offered: "Khoi" }),
      wire({ id: "2", amount: 160000, gift: true, to: "Hien", offered: "Hien" }),
      wire({ id: "3", amount: 500, gift: true, to: "khoi" }),
      wire({ id: "4", amount: 9000, gift: false, to: "", offered: "Mai" }),
      wire({ id: "5", amount: 25000 }),
    ];
    expect(knownPeople(rows)).toEqual(["Hien", "Khoi", "Mai"]);
  });
});
