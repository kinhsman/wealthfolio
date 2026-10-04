import { describe, expect, it } from "vitest";

import {
  expectedNetWorth,
  isHoldingLeftOut,
  isLeftOutOfWealthCheck,
  netWorthWithoutItems,
  netWorthWithout,
  setWealthCheckExcludeInMeta,
  wealthRatio,
  wealthStatus,
} from "./wealth-check";

describe("wealth check", () => {
  it("expected net worth is age x income / 10", () => {
    expect(expectedNetWorth(40, 100_000)).toBe(400_000);
    expect(expectedNetWorth(38, 160_000)).toBe(608_000);
  });

  it("PAW at double, UAW at half or less, the middle between", () => {
    expect(wealthStatus(2)).toBe("paw");
    expect(wealthStatus(2.3)).toBe("paw");
    expect(wealthStatus(1.99)).toBe("middle");
    expect(wealthStatus(0.51)).toBe("middle");
    expect(wealthStatus(0.5)).toBe("uaw");
    expect(wealthStatus(-1)).toBe("uaw");
  });

  it("has no ratio without a positive expected amount", () => {
    expect(wealthRatio(100, 0)).toBeNull();
    expect(wealthRatio(800_000, 400_000)).toBe(2);
  });

  it("reads and writes the account switch without touching other meta", () => {
    expect(isLeftOutOfWealthCheck({ meta: undefined })).toBe(false);
    expect(isLeftOutOfWealthCheck({ meta: "not json" })).toBe(false);
    const on = setWealthCheckExcludeInMeta('{"freeCash":true}', true);
    expect(isLeftOutOfWealthCheck({ meta: on })).toBe(true);
    expect(JSON.parse(on)).toEqual({ freeCash: true, wealthCheckExclude: true });
    expect(JSON.parse(setWealthCheckExcludeInMeta(on, false))).toEqual({ freeCash: true });
  });

  it("takes left-out accounts out of net worth, a card by its cash balance", () => {
    const valuations = [
      { accountId: "a", totalValueBase: 50_000, cashBalanceBase: 1_000 },
      { accountId: "card", totalValueBase: -2_000, cashBalanceBase: -2_000 },
    ];
    // Net worth 100k. Leaving out a $50k account leaves 50k.
    expect(netWorthWithout(100_000, [{ id: "a", accountType: "CASH" }], valuations)).toBe(50_000);
    // Leaving out a card that owes 2k adds the debt back.
    expect(netWorthWithout(100_000, [{ id: "card", accountType: "CREDIT_CARD" }], valuations)).toBe(102_000);
    // No valuation yet counts as zero.
    expect(netWorthWithout(100_000, [{ id: "new", accountType: "CASH" }], valuations)).toBe(100_000);
  });

  it("takes a left-out property out and adds a left-out loan back", () => {
    expect(netWorthWithoutItems(138_000, [{ value: 685_000, liability: false }])).toBe(-547_000);
    expect(netWorthWithoutItems(138_000, [{ value: 730_000, liability: true }])).toBe(868_000);
    expect(netWorthWithoutItems(138_000, [])).toBe(138_000);
  });

  it("reads a held item's switch from its metadata", () => {
    expect(isHoldingLeftOut(undefined)).toBe(false);
    expect(isHoldingLeftOut({})).toBe(false);
    expect(isHoldingLeftOut({ wealthCheckExclude: "true" })).toBe(true);
    expect(isHoldingLeftOut({ wealthCheckExclude: "" })).toBe(false);
  });
});
