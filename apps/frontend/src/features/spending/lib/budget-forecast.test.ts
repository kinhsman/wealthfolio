import { describe, expect, it } from "vitest";

import { addMonthsISO, forecastFrom, forecastParts } from "./budget-forecast";
import type { Stream } from "./subscriptions";

const stream = (name: string, extra: Partial<Stream> = {}): Stream =>
  ({
    key: name,
    name,
    every: "month",
    status: "active",
    usual: 100,
    next: "2026-10-10",
    charges: [],
    ...extra,
  }) as unknown as Stream;
const OCT = {
  monthStart: "2026-10-01",
  monthEnd: "2026-10-31",
  histStart: "2026-07-01",
  histEnd: "2026-09-30",
  historyDays: 92,
};
const mortgageCharges = ["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"].map((date, i) => ({
  id: `m${i}`,
  date,
  amount: 2505.76,
}));

describe("budget forecast, bills apart", () => {
  it("Oct 1, mortgage just paid: not counted twice", () => {
    const parts = forecastParts(
      [
        stream("US Bank", { usual: 2505.76, next: "2026-11-01", charges: mortgageCharges }),
        stream("ComEd", {
          usual: 157,
          next: "2026-10-03",
          charges: [{ id: "c1", date: "2026-09-03", amount: 157 }],
        }),
        stream("T-Mobile", {
          usual: 95.18,
          billUsual: 608.1,
          sharedOn: true,
          next: "2026-10-23",
          charges: [{ id: "t1", date: "2026-09-23", amount: 608.1 }],
        }),
        stream("Membership Fee", {
          every: "year",
          usual: 561.25,
          next: "2027-09-03",
          charges: [{ id: "f1", date: "2026-09-03", amount: 561.25 }],
        }),
        stream("Peoples Gas", {
          status: "stopped",
          usual: 185,
          next: "2026-07-03",
          charges: [{ id: "g1", date: "2026-07-03", amount: 185 }],
        }),
        stream("Home insurance", {
          escrow: { rentalId: "r" } as unknown as Stream["escrow"],
          every: "year",
          usual: 2320.43,
          next: "2026-10-12",
        }),
      ],
      { ...OCT, historyOutflow: 19954 },
    );
    // Due still: ComEd and your part of T-Mobile; not the mortgage (next month), not the yearly fee, not
    // the stopped gas, not the insurance paid inside the mortgage.
    expect(parts.billsLeft.map((b) => `${b.name} ${b.date} ${b.amount}`)).toEqual([
      "ComEd 2026-10-03 157",
      "T-Mobile 2026-10-23 95.18",
    ]);
    expect(parts.billsLeftTotal).toBe(252.18);
    // Out of the 3 months: 3 mortgages, ComEd, your part of T-Mobile, the fee, the gas.
    expect(parts.billsInHistory).toBeCloseTo(3 * 2505.76 + 157 + 95.18 + 561.25 + 185, 2);
    expect(parts.everydayDaily).toBeCloseTo((19954 - parts.billsInHistory) / 92, 6);
    // Spent $2,505.76 (the mortgage) + bills still due + 30 everyday days.
    expect(forecastFrom(2505.76, parts, 30)).toBeCloseTo(
      2505.76 + 252.18 + parts.everydayDaily * 30,
      6,
    );
    // Wealthfolio's forecast counted the mortgage again inside the average: about $2,500 more.
    expect(2505.76 + (19954 / 92) * 30 - forecastFrom(2505.76, parts, 30)).toBeGreaterThan(2500);
  });

  it("a monthly bill due twice in the month counts twice; a late one this month still counts", () => {
    const parts = forecastParts(
      [
        stream("Weekly-ish", { next: "2026-10-01" }),
        stream("Late", { next: "2026-09-28" }),
        stream("Late this month", { next: "2026-10-02" }),
      ],
      { ...OCT, monthEnd: "2026-11-01", historyOutflow: 0 },
    );
    expect(parts.billsLeft.map((b) => `${b.name} ${b.date}`)).toEqual([
      "Weekly-ish 2026-10-01",
      "Late this month 2026-10-02",
      "Late 2026-10-28",
      "Weekly-ish 2026-11-01",
    ]);
    expect(parts.everydayDaily).toBe(0);
  });

  it("never below zero when the bills are more than what Spending counted", () => {
    const parts = forecastParts(
      [stream("Big", { charges: [{ id: "b", date: "2026-08-01", amount: 5000 }] })],
      { ...OCT, historyOutflow: 1000 },
    );
    expect(parts.everydayDaily).toBe(0);
  });

  it("month steps keep the day, or the month's last", () => {
    expect(addMonthsISO("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsISO("2026-10-03", 12)).toBe("2027-10-03");
  });
});
