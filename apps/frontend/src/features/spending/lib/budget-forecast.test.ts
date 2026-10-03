import { describe, expect, it } from "vitest";

import {
  addMonthsISO,
  againstBudget,
  dueInMonth,
  forecastParts,
  oneOffLine,
  paceWithFixed,
  paidInMonth,
  withoutCharges,
} from "./budget-forecast";
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
    // Nothing switched to fixed: spent $2,505.76 (the mortgage) + bills still due + 30 everyday days.
    const sums = againstBudget(4000, 2505.76, parts, 30);
    expect(sums.fixed).toBe(0);
    expect(sums.others).toBeCloseTo(2505.76 + 252.18 + parts.everydayDaily * 30, 6);
    expect(sums.over).toBeCloseTo(sums.others - 4000, 6);
    // Wealthfolio's forecast counted the mortgage again inside the average: about $2,500 more.
    expect(2505.76 + (19954 / 92) * 30 - sums.others).toBeGreaterThan(2500);
  });

  it("Exclude from forecast: the mortgage comes off the $4,000, everything else is forecast against the rest", () => {
    const streams = [
      stream("US Bank", {
        usual: 2505.76,
        next: "2026-11-01",
        excludeFromForecast: true,
        charges: mortgageCharges,
      }),
      stream("ComEd", {
        usual: 157,
        next: "2026-10-03",
        charges: [{ id: "c1", date: "2026-09-03", amount: 157 }],
      }),
    ];
    const parts = forecastParts(streams, { ...OCT, historyOutflow: 19954 });
    expect(parts.fixedNames).toEqual(["US Bank"]);
    expect(parts.fixedPaid.map((b) => `${b.date} ${b.amount}`)).toEqual(["2026-10-01 2505.76"]);
    expect(parts.fixedDue).toEqual([]);
    expect(parts.billsLeft.map((b) => b.name)).toEqual(["ComEd"]);
    // The mortgage is still a bill of the 3 months: out of the everyday day.
    expect(parts.billsInHistory).toBeCloseTo(3 * 2505.76 + 157, 2);
    const sums = againstBudget(4000, 2505.76, parts, 30);
    expect(sums.fixed).toBe(2505.76);
    expect(sums.room).toBeCloseTo(1494.24, 2);
    expect(sums.spentOthers).toBe(0);
    expect(sums.others).toBeCloseTo(157 + parts.everydayDaily * 30, 6);
    // The verdict is the same as with the mortgage forecast by date; only the way it is said changes.
    const asBill = againstBudget(
      4000,
      2505.76,
      forecastParts([{ ...streams[0], excludeFromForecast: false }, streams[1]], {
        ...OCT,
        historyOutflow: 19954,
      }),
      30,
    );
    expect(sums.over).toBeCloseTo(asBill.over, 6);
    // Fixed paid is never more than what was spent (paid from an account Spending does not count).
    expect(againstBudget(4000, 100, parts, 30).fixed).toBe(100);
  });

  it("a fixed bill not paid yet this month comes off the budget at its usual amount", () => {
    const parts = forecastParts(
      [stream("Rent", { usual: 1800, next: "2026-10-05", excludeFromForecast: true })],
      { ...OCT, historyOutflow: 0 },
    );
    expect(parts.fixedDue.map((b) => `${b.date} ${b.amount}`)).toEqual(["2026-10-05 1800"]);
    const sums = againstBudget(4000, 0, parts, 30);
    expect([sums.fixed, sums.room, sums.others]).toEqual([1800, 2200, 0]);
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
    // Late from September: once, from the month's first day (it used to be moved to Oct 28).
    expect(parts.billsLeft.map((b) => `${b.name} ${b.date}${b.late ? ` was ${b.late}` : ""}`)).toEqual([
      "Weekly-ish 2026-10-01",
      "Late 2026-10-01 was 2026-09-28",
      "Late this month 2026-10-02",
      "Weekly-ish 2026-11-01",
    ]);
    expect(parts.everydayDaily).toBe(0);
  });

  it("a yearly bill late from last month still comes this month, once", () => {
    const parts = forecastParts([stream("Yearly", { every: "year", next: "2026-09-28", usual: 80 })], {
      ...OCT,
      historyOutflow: 0,
    });
    expect(parts.billsLeft.map((b) => `${b.name} ${b.date} ${b.amount}`)).toEqual(["Yearly 2026-10-01 80"]);
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

describe("paid where the app cannot see it (owner, 10-03)", () => {
  it("paid on the calendar, never taken off what Spending counted", () => {
    const loan = stream("Vietnam loan", {
      usual: 500,
      next: "2026-11-14",
      charges: [
        { id: "acb1", date: "2026-08-14", amount: 500 },
        { id: "paid:p1", date: "2026-09-14", amount: 500, outside: true },
        { id: "paid:p2", date: "2026-10-02", amount: 500, outside: true },
      ],
    });
    const parts = forecastParts([loan], { ...OCT, historyOutflow: 9000 });
    expect(parts.billsInHistory).toBe(500); // only the ACB payment is in Spending's history
    expect(parts.billsLeft).toEqual([]);
    expect(paidInMonth(loan, OCT.monthStart, OCT.monthEnd).map((b) => b.amount)).toEqual([500]);
    // A fixed bill paid that way: not taken off this month's spending either.
    const fixed = forecastParts([{ ...loan, excludeFromForecast: true } as Stream], { ...OCT, historyOutflow: 9000 });
    expect(fixed.fixedPaid).toEqual([]);
  });
});

describe("pace with fixed bills", () => {
  const fixedParts = forecastParts(
    [
      stream("US Bank", {
        usual: 2505.76,
        next: "2026-11-01",
        excludeFromForecast: true,
        charges: mortgageCharges,
      }),
    ],
    { ...OCT, historyOutflow: 19954 },
  );

  it("the mortgage counts on its day; the rest of the budget follows the usual month", () => {
    expect(fixedParts.fixedHistory.map((b) => b.date)).toEqual([
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
    ]);
    const even = paceWithFixed(fixedParts, 4000, 31, null);
    // Oct 1: the mortgage plus a 31st of what is left; Oct 31: the whole budget.
    expect(even(1)).toBeCloseTo(2505.76 + 1494.24 / 31, 6);
    expect(even(31)).toBeCloseTo(4000, 6);
    // With nothing else spent yet, the 1st is under pace, not $866 over.
    expect(2505.76 - even(1)).toBeLessThan(0);
    const shaped = paceWithFixed(
      fixedParts,
      4000,
      31,
      Array.from({ length: 32 }, (_, d) => (d >= 15 ? 1 : 0)),
    );
    expect(shaped(14)).toBeCloseTo(2505.76, 6);
    expect(shaped(15)).toBeCloseTo(4000, 6);
  });

  it("the usual month's shape leaves the fixed bills out", () => {
    const days = [
      { date: "2026-07-01", income: 0, outflow: 2550 },
      { date: "2026-07-02", income: 0, outflow: 30 },
      { date: "2026-08-01", income: 0, outflow: 100 },
    ];
    expect(withoutCharges(days, fixedParts.fixedHistory).map((d) => d.outflow)).toEqual([
      2550 - 2505.76,
      30,
      0,
    ]);
    expect(withoutCharges(days, [])).toBe(days);
  });
});

describe("everyday rate leaves one-off big days out", () => {
  it("the line is far above the usual days, from the days themselves", () => {
    // 92 days: 60 empty, 28 at $40, 2 at $100, a $1,004 cash advance and a $1,203 Apple buy.
    const days = [...Array(60).fill(0), ...Array(28).fill(40), 100, 100, 1004, 1203.09];
    // Quartiles (Python's exclusive way): q1 0, q3 40, so the line is 40 + 3 x 40 = 160.
    expect(oneOffLine(days)).toBe(160);
    expect(oneOffLine(Array(20).fill(50))).toBe(Infinity); // too few days to tell
    expect(oneOffLine(Array(60).fill(0))).toBe(Infinity); // nothing spent: no line
  });

  it("counts a big day up to the line, after taking that day's bills off", () => {
    const histDays: { date: string; outflow: number }[] = [];
    for (let i = 0; i < 92; i += 1) {
      const date = new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10);
      histDays.push({ date, outflow: i % 3 === 0 ? 40 : 0 });
    }
    histDays[15].outflow = 1004; // a cash advance
    histDays[0].outflow += 2505.76; // the mortgage on Jul 1, a bill
    const parts = forecastParts(
      [
        stream("US Bank", {
          usual: 2505.76,
          next: "2026-11-01",
          excludeFromForecast: true,
          charges: mortgageCharges,
        }),
      ],
      { ...OCT, historyOutflow: 0, historyByDay: histDays },
    );
    expect(parts.cappedDays).toBe(1);
    // Days: 30 at $40 (Jul 1 is $40 once the mortgage is off), 61 empty, the $1,004 day: q1 0, q3 40.
    expect(parts.everydayCap).toBe(160);
    expect(parts.everydayDaily).toBeCloseTo((30 * 40 + 160) / 92, 6);
    // Without the days, the old average (everything less the bills, per day).
    const plain = forecastParts([], { ...OCT, historyOutflow: 1000, historyDays: 92 });
    expect([plain.everydayDaily, plain.everydayCap, plain.cappedDays]).toEqual([
      1000 / 92,
      Infinity,
      0,
    ]);
  });
});

describe("paid and left to pay this month (Subscriptions & Bills page)", () => {
  const OCT1 = ["2026-10-01", "2026-10-31"] as const;
  it("paid: this month's charges, a credit back counts against them", () => {
    const s = stream("Prime", {
      charges: [
        { id: "a", date: "2026-09-19", amount: 139 },
        { id: "b", date: "2026-10-03", amount: 139 },
        { id: "c", date: "2026-10-09", amount: -20.71, extra: true, credit: true },
      ],
    });
    expect(paidInMonth(s, ...OCT1).map((b) => b.amount)).toEqual([139, -20.71]);
  });

  it("shared in Owly: your part as it was split, the whole charge when it was not", () => {
    const s = stream("T-Mobile", {
      sharedOn: true,
      usual: 95.18,
      billUsual: 608.1,
      charges: [
        { id: "t1", date: "2026-10-02", amount: 427.18 },
        { id: "t2", date: "2026-10-20", amount: 123.77 },
      ],
      shared: {
        service: "T-Mobile",
        count: 2,
        latest: null,
        myUsual: 95.18,
        plan: [
          { id: "t1", date: "2026-10-02", amount: 427.18, friends: 332, mine: 95.18, people: [], ok: true, tooMuch: false },
          { id: "t2", date: "2026-10-20", amount: 123.77, friends: 218, mine: -94.23, people: [], ok: false, tooMuch: true },
        ],
      },
    });
    expect(paidInMonth(s, ...OCT1).map((b) => b.amount)).toEqual([95.18, 123.77]);
  });

  it("hidden and escrow ones count nowhere; a stopped one is never still due", () => {
    const charges = [{ id: "x", date: "2026-10-05", amount: 50 }];
    expect(paidInMonth(stream("Hidden", { hidden: true, charges }), ...OCT1)).toEqual([]);
    expect(paidInMonth(stream("Escrow", { escrow: {} as Stream["escrow"], charges }), ...OCT1)).toEqual([]);
    expect(dueInMonth(stream("Escrow", { escrow: {} as Stream["escrow"] }), ...OCT1)).toEqual([]);
    expect(dueInMonth(stream("Stopped", { status: "stopped", next: "2026-10-12" }), ...OCT1)).toEqual([]);
  });

  it("paid this month moves its next date on: not still due", () => {
    const s = stream("US Bank", { usual: 2505.76, next: "2026-11-01", charges: [{ id: "m", date: "2026-10-01", amount: 2505.76 }] });
    expect(paidInMonth(s, ...OCT1).map((b) => b.amount)).toEqual([2505.76]);
    expect(dueInMonth(s, ...OCT1)).toEqual([]);
  });

  it("dueInMonth handles weekly and custom intervals", () => {
    const weekly = stream("Gym", { every: "1 week", usual: 10, next: "2026-10-07" });
    // In October (Oct 1 to Oct 31): Oct 7, Oct 14, Oct 21, Oct 28
    expect(dueInMonth(weekly, ...OCT1).map((b) => b.date)).toEqual(["2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28"]);

    const biweekly = stream("Box", { every: "2 weeks", usual: 25, next: "2026-10-05" });
    // Oct 5, Oct 19
    expect(dueInMonth(biweekly, ...OCT1).map((b) => b.date)).toEqual(["2026-10-05", "2026-10-19"]);
  });
});
