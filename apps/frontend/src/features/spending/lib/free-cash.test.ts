import { describe, expect, it } from "vitest";

import { countsAsFreeCash, setFreeCashInMeta, shortDate } from "./free-cash";

describe("free cash", () => {
  it("the account's switch wins, else a Plaid bank account that is not a card (same rule as the service)", () => {
    const plaid = JSON.stringify({ source: "plaid" });
    expect(countsAsFreeCash({ accountType: "CASH", meta: plaid })).toBe(true);
    expect(countsAsFreeCash({ accountType: "CREDIT_CARD", meta: plaid })).toBe(false);
    expect(
      countsAsFreeCash({ accountType: "CREDIT_CARD", meta: JSON.stringify({ freeCash: true }) }),
    ).toBe(false);
    expect(
      countsAsFreeCash({ accountType: "CASH", meta: JSON.stringify({ source: "owly" }) }),
    ).toBe(false);
    expect(
      countsAsFreeCash({
        accountType: "SECURITIES",
        meta: JSON.stringify({ source: "wheeltradr" }),
      }),
    ).toBe(false);
    expect(
      countsAsFreeCash({
        accountType: "SECURITIES",
        meta: JSON.stringify({ source: "wheeltradr", freeCash: true }),
      }),
    ).toBe(true);
    expect(
      countsAsFreeCash({
        accountType: "CASH",
        meta: JSON.stringify({ source: "plaid", freeCash: false }),
      }),
    ).toBe(false);
    expect(countsAsFreeCash({ accountType: "CASH", meta: null })).toBe(false);
    expect(countsAsFreeCash({ accountType: "CASH", meta: "not json" })).toBe(false);
  });

  it("the switch keeps the rest of the account's meta", () => {
    const meta = JSON.stringify({
      source: "wheeltradr",
      wheeltradrId: "jtazewn",
      logoUrl: "https://x/y.png",
    });
    expect(JSON.parse(setFreeCashInMeta(meta, true))).toEqual({
      source: "wheeltradr",
      wheeltradrId: "jtazewn",
      logoUrl: "https://x/y.png",
      freeCash: true,
    });
    expect(JSON.parse(setFreeCashInMeta(null, false))).toEqual({ freeCash: false });
  });

  it("dates", () => {
    expect(shortDate("2026-11-01")).toBe("Nov 1");
  });
});
