import { describe, expect, it } from "vitest";

import {
  barParts,
  fixWords,
  inDays,
  knownPeople,
  listed,
  shortDay,
  sumLines,
  typedAmount,
  yearChoices,
  type GiftOut,
  type TaxEstimate,
  type TaxSetup,
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

  const estimate = (over: Partial<TaxEstimate> = {}): TaxEstimate => ({
    status: "single",
    income: {
      wages: 127400,
      short: 18494.16,
      long: 0,
      lossUsed: 0,
      lossCarried: 0,
      interest: 476.9,
      rental: { rent: 21300, costs: 10415.9, extra: 0, net: 10884.1, used: 10884.1, held: 0 },
      total: 157255.16,
    },
    deduction: { kind: "itemized", amount: 16830.16, standard: 16100 },
    federal: { taxable: 140425, tax: 26300, investment: 0, total: 26300, rate: 0.24 },
    state: { tax: 7447.54, exemption: 2925, credit: 191.81 },
    paid: {
      federalWithheld: 17940,
      stateWithheld: 5980,
      federalSent: 0,
      stateSent: 0,
      federal: 17940,
      state: 5980,
    },
    balance: { federal: 8360, state: 1467.54, total: 9827.54, back: 0 },
    safe: {
      ok: false,
      by: "current",
      required: 23670,
      paid: 17940,
      shortfall: 5730,
      perPaycheck: 955,
      paychecksLeft: 6,
      lumpBy: "2027-01-15",
      priorKnown: false,
      priorJointGuess: false,
    },
    stubDate: "2026-09-25",
    stubAge: 7,
    dueBy: "2027-04-15",
    tradingMissing: false,
    ...over,
  });
  const setup: TaxSetup = {
    status: "single",
    stub: { date: "2026-09-25", wages: 98000, federal: 13800, state: 4600 },
    full: null,
    last: null,
    rentalExtra: 0,
    hold: false,
    hasRental: true,
    paydays: 26,
    paydaysLeft: 6,
  };
  const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  it("lays the estimate out as a sum that ends at what is left to set aside", () => {
    const e = estimate();
    const lines = sumLines(e, 2026, setup);
    expect(lines.map((l) => l.label)).toEqual([
      "Pay for the year",
      "Trading profit, held under a year",
      "Interest and dividends",
      "Rental, after its costs",
      "Income",
      "Deduction, itemized",
      "Federal tax",
      "Illinois tax",
      "Taken out of paychecks by Dec 31",
    ]);
    expect(lines[0].hint).toBe("the Sep 25 stub, carried to 26 paychecks");
    // The income lines add up to the income line, and the taxes less what is paid to the set-aside.
    const income = lines.slice(0, 4).reduce((t, l) => t + l.value, 0);
    expect(income).toBeCloseTo(e.income.total, 2);
    const left = lines[6].value + lines[7].value + lines[8].value;
    expect(left).toBeCloseTo(e.balance.total, 2);
    expect(lines.filter((l) => l.total).map((l) => l.label)).toEqual([
      "Income",
      "Federal tax",
      "Illinois tax",
    ]);
  });

  it("adds the lines a year only sometimes has: a long-term gain, a used loss, money sent, a standard deduction", () => {
    const e = estimate({
      income: { ...estimate().income, long: 4000, lossUsed: 3000, lossCarried: 5000, rental: null },
      deduction: { kind: "standard", amount: 16100, standard: 16100 },
      federal: { ...estimate().federal, investment: 760 },
      paid: { ...estimate().paid, federalSent: 2000, stateSent: 500 },
    });
    const lines = sumLines(e, 2026, {
      ...setup,
      full: { wages: 140000, federal: null, state: null },
    });
    const by = Object.fromEntries(lines.map((l) => [l.label, l]));
    expect(by["Pay for the year"].hint).toBe("your own full-year figure");
    expect(by["Trading profit, held over a year"].value).toBe(4000);
    expect(by["Trading loss"].value).toBe(-3000);
    expect(by["Standard deduction"].value).toBe(-16100);
    expect(by["Federal tax"].hint).toBe("with the 3.8% on investment income");
    expect(by["Sent for 2026"].value).toBe(-2500);
    expect(by["Rental, after its costs"]).toBeUndefined();
  });

  it("words the fix in full and in keywords", () => {
    const safe = estimate().safe;
    expect(fixWords(safe, usd)).toBe(
      "$955.00 more from each of the 6 paychecks left, or one payment of $5,730.00 by Jan 15",
    );
    expect(fixWords(safe, usd, true)).toBe(
      "$955.00 more per paycheck (6 left), or $5,730.00 by Jan 15",
    );
    expect(fixWords({ ...safe, perPaycheck: null, paychecksLeft: 0 }, usd)).toBe(
      "one payment of $5,730.00 by Jan 15",
    );
  });

  it("reads an amount the way it is typed", () => {
    expect(typedAmount("$98,000.50")).toBe("98000.50");
    expect(typedAmount(" 1 234 ")).toBe("1234");
    expect(typedAmount("")).toBe("");
  });
});
