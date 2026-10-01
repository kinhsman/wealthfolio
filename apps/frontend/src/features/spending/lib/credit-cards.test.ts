import { describe, expect, it } from "vitest";

import { asOfLabel, cardName, cardTransactionsHref, pctLabel, usedShare } from "./credit-cards";

describe("credit cards", () => {
  it("share of the limit used: none without a limit, nothing for a credit", () => {
    expect(usedShare({ owed: 1940.65, limit: 22500 })).toBeCloseTo(0.08625);
    expect(usedShare({ owed: -25, limit: 1000 })).toBe(0);
    expect(usedShare({ owed: 100, limit: null })).toBeNull();
    expect(usedShare({ owed: 100, limit: 0 })).toBeNull();
  });

  it("percent words", () => {
    expect(pctLabel(0)).toBe("0%");
    expect(pctLabel(0.0004)).toBe("<0.1%");
    expect(pctLabel(0.01274)).toBe("1.3%");
    expect(pctLabel(0.08625)).toBe("8.6%");
    expect(pctLabel(0.345)).toBe("35%");
  });

  it("the money app's name, with the last four only when it has none", () => {
    expect(cardName({ name: "Chase Freedom", mask: "5257" })).toBe("Chase Freedom ••5257");
    expect(cardName({ name: "Freedom Unlimited ••5257", mask: "5257" })).toBe(
      "Freedom Unlimited ••5257",
    );
    expect(cardName({ name: "Plaid name", mask: "0027" }, "Strata Elite 0027")).toBe(
      "Strata Elite 0027",
    );
    expect(cardName({ name: "Card", mask: null }, "  ")).toBe("Card");
  });

  it("as of: the time today, yesterday, else the date", () => {
    const now = new Date(2026, 9, 1, 15, 0);
    expect(asOfLabel(new Date(2026, 9, 1, 11, 48).toISOString(), now)).toBe("11:48 AM");
    expect(asOfLabel(new Date(2026, 8, 30, 23, 0).toISOString(), now)).toBe("yesterday");
    expect(asOfLabel(new Date(2026, 8, 28, 9, 0).toISOString(), now)).toBe("Sep 28");
    expect(asOfLabel(null, now)).toBeNull();
    expect(asOfLabel("not a date", now)).toBeNull();
  });

  it("opens the card's transactions", () => {
    expect(cardTransactionsHref({ wfAccountId: "48bd2f17-3598" })).toBe(
      "/activities?tab=spending&account=48bd2f17-3598",
    );
  });
});
