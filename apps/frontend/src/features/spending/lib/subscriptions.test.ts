import { describe, expect, it } from "vitest";
import {
  dueLabel,
  formatEvery,
  formatEveryLabel,
  formatEveryShort,
  nextChargeAfter,
  parseEvery,
  statusLabel,
  subscriptionCharges,
  subscriptionFilterOptions,
  transactionsHref,
  upcoming,
  type Stream,
} from "@/features/spending/lib/subscriptions";

const base: Stream = {
  key: "p:YOUTUBE PREMIUM", name: "Youtube Premium", logoUrl: null, useBank: false, merchantId: null, group: "subscriptions",
  every: "month", everyLabel: "every month", usual: 25.35, monthly: 25.35, yearly: 304.2, count: 9, first: "2026-01-26",
  last: { date: "2026-09-26", amount: 25.35, id: "t1" }, previousAmount: 25.35, next: "2026-10-26", dueInDays: 25,
  status: "active", doubleCharge: false, variable: false, sure: true, categoryId: null, accountId: null, ids: ["t1"], manualId: null,
};
const mk = (o: Partial<Stream>): Stream => ({ ...base, ...o });

describe("subscriptions wording", () => {
  it("status: green when fine, amber when worth a look, muted when over", () => {
    expect(statusLabel(base)).toEqual({ label: "Active", tone: "fine" });
    expect(statusLabel(mk({ status: "price-up" }))).toEqual({ label: "Price went up", tone: "look" });
    expect(statusLabel(mk({ status: "price-down" }))).toEqual({ label: "Price went down", tone: "fine" });
    expect(statusLabel(mk({ doubleCharge: true }))).toEqual({ label: "Charged twice", tone: "look" });
    expect(statusLabel(mk({ sure: false }))).toEqual({ label: "Not sure yet", tone: "look" });
    expect(statusLabel(mk({ sure: false, confirmed: true }))).toEqual({ label: "Active", tone: "fine" });
    expect(statusLabel(mk({ status: "stopped", doubleCharge: true }))).toEqual({ label: "Stopped", tone: "over" });
  });
  it("due: the date with today, tomorrow, in N days, overdue; stopped tells the last payment", () => {
    const year = new Date().getFullYear();
    const oct26 = `${year}-10-26`;
    expect(dueLabel(mk({ dueInDays: 0, next: oct26 }))).toBe("Due today, Oct 26");
    expect(dueLabel(mk({ dueInDays: 1, next: oct26 }))).toBe("Due tomorrow, Oct 26");
    expect(dueLabel(mk({ dueInDays: 25, next: oct26 }))).toBe("Next Oct 26, in 25 days");
    expect(dueLabel(mk({ dueInDays: -1, next: oct26 }))).toBe("Was due yesterday, Oct 26");
    expect(dueLabel(mk({ dueInDays: -4, next: oct26 }))).toBe("Was due Oct 26, 4 days ago");
    expect(dueLabel(mk({ dueInDays: 230, next: `${year + 1}-05-19` }))).toBe(`Next May 19, ${year + 1}, in 230 days`);
    expect(dueLabel(mk({ status: "stopped" }))).toMatch(/^Last paid Sep 26, 2026$/);
    expect(dueLabel(mk({ status: "stopped", last: null }))).toBe("Never charged");
  });
  it("the next few due come first, stopped and long-overdue ones left out", () => {
    const list = [
      mk({ key: "a", dueInDays: 12, monthly: 5 }),
      mk({ key: "b", dueInDays: 2, monthly: 50 }),
      mk({ key: "c", dueInDays: 2, monthly: 90 }),
      mk({ key: "d", status: "stopped", dueInDays: -200 }),
      mk({ key: "e", dueInDays: -10 }),
      mk({ key: "f", dueInDays: 30 }),
    ];
    expect(upcoming(list).map((s) => s.key)).toEqual(["c", "b", "a"]);
    expect(upcoming(list, 5).map((s) => s.key)).toEqual(["c", "b", "a", "f"]);
  });
  it("the transactions link turns on the Subscription filter, never a word search", () => {
    expect(transactionsHref(base)).toBe("/activities?tab=spending&subscriptions=p%3AYOUTUBE%20PREMIUM");
    expect(transactionsHref(mk({ key: "manual:abc" }))).toBe("/activities?tab=spending&subscriptions=manual%3Aabc");
  });
  it("the filter's choices: every one with charges, by name, how many; escrow bills left out", () => {
    const ch = (id: string, date: string) => ({ id, date, amount: 10 });
    const list = [
      mk({ key: "y", name: "Youtube", charges: [ch("1", "2026-01-01"), ch("2", "2026-02-01")] }),
      mk({ key: "a1", name: "Apple", everyLabel: "every month", charges: [ch("3", "2026-01-05")] }),
      mk({ key: "a2", name: "Apple", everyLabel: "every year", charges: [ch("4", "2025-06-01")] }),
      mk({ key: "none", name: "Gym", charges: [] }),
      mk({ key: "esc", name: "Property tax", charges: [ch("5", "2026-01-01")], escrow: {} as Stream["escrow"] }),
    ];
    expect(subscriptionFilterOptions(list)).toEqual([
      { value: "a1", label: "Apple (every month)", count: 1 },
      { value: "a2", label: "Apple (every year)", count: 1 },
      { value: "y", label: "Youtube", count: 2 },
    ]);
    // Every charge of the chosen ones, whatever words found them, and the days they span.
    expect(subscriptionCharges(list, new Set(["y", "a2", "gone"]))).toEqual({ ids: ["1", "2", "4"], from: "2025-06-01", to: "2026-02-01" });
    expect(subscriptionCharges(list, new Set(["gone"]))).toEqual({ ids: [], from: null, to: null });
  });
  it("a payment marked paid by hand is no transaction: not in the filter or its list (owner, 10-03)", () => {
    const loan = mk({
      key: "manual:loan",
      name: "Vietnam loan",
      charges: [
        { id: "acb1", date: "2026-08-15", amount: 500 },
        { id: "paid:p1", date: "2026-09-14", amount: 500, outside: true },
      ],
    });
    const cash = mk({ key: "manual:cash", name: "Cash only", charges: [{ id: "paid:p2", date: "2026-09-01", amount: 20, outside: true }] });
    expect(subscriptionFilterOptions([loan, cash])).toEqual([{ value: "manual:loan", label: "Vietnam loan", count: 1 }]);
    expect(subscriptionCharges([loan, cash], new Set(["manual:loan", "manual:cash"]))).toEqual({ ids: ["acb1"], from: "2026-08-15", to: "2026-08-15" });
  });
});

describe("next charge from a charge's date", () => {
  it("one period on, by How often (owner, 10-03: changing it must move the date)", () => {
    expect(nextChargeAfter("2025-06-13", "month")).toBe("2025-07-13");
    expect(nextChargeAfter("2025-06-13", "quarter")).toBe("2025-09-13");
    expect(nextChargeAfter("2025-06-13", "half-year")).toBe("2025-12-13");
    expect(nextChargeAfter("2025-06-13T17:00:00Z", "year")).toBe("2026-06-13");
  });
  it("on to the charge still to come when asked, never a date gone by", () => {
    expect(nextChargeAfter("2025-06-13", "month", true, "2026-10-03")).toBe("2026-10-13");
    expect(nextChargeAfter("2025-06-13", "year", true, "2026-10-03")).toBe("2027-06-13");
    expect(nextChargeAfter("2026-09-30", "month", true, "2026-10-03")).toBe("2026-10-30");
    expect(nextChargeAfter("2026-09-03", "month", true, "2026-10-03")).toBe("2026-10-03");
  });
  it("a 31st stays a 31st where the month has one", () => {
    expect(nextChargeAfter("2026-01-31", "month")).toBe("2026-02-28");
    expect(nextChargeAfter("2026-01-31", "month", true, "2026-03-05")).toBe("2026-03-31");
  });
});

describe("custom frequencies (every # week/month/year)", () => {
  it("parses legacy and custom frequencies", () => {
    expect(parseEvery("month")).toEqual({ count: 1, unit: "month" });
    expect(parseEvery("quarter")).toEqual({ count: 3, unit: "month" });
    expect(parseEvery("half-year")).toEqual({ count: 6, unit: "month" });
    expect(parseEvery("year")).toEqual({ count: 1, unit: "year" });
    expect(parseEvery("week")).toEqual({ count: 1, unit: "week" });
    expect(parseEvery("1 week")).toEqual({ count: 1, unit: "week" });
    expect(parseEvery("2 weeks")).toEqual({ count: 2, unit: "week" });
    expect(parseEvery("3 months")).toEqual({ count: 3, unit: "month" });
    expect(parseEvery("2 years")).toEqual({ count: 2, unit: "year" });
  });

  it("formats key, label and short forms", () => {
    expect(formatEvery(1, "month")).toBe("month");
    expect(formatEvery(3, "month")).toBe("quarter");
    expect(formatEvery(6, "month")).toBe("half-year");
    expect(formatEvery(1, "year")).toBe("year");
    expect(formatEvery(1, "week")).toBe("1 week");
    expect(formatEvery(2, "week")).toBe("2 weeks");
    expect(formatEvery(2, "month")).toBe("2 months");

    expect(formatEveryLabel("month")).toBe("Every month");
    expect(formatEveryLabel("quarter")).toBe("Every 3 months");
    expect(formatEveryLabel("2 weeks")).toBe("Every 2 weeks");
    expect(formatEveryLabel("1 week")).toBe("Every week");
    expect(formatEveryLabel("2 years")).toBe("Every 2 years");

    expect(formatEveryShort("month")).toBe("Monthly");
    expect(formatEveryShort("week")).toBe("Weekly");
    expect(formatEveryShort("year")).toBe("Yearly");
    expect(formatEveryShort("2 weeks")).toBe("Every 2 wks");
    expect(formatEveryShort("3 months")).toBe("Every 3 mo");
  });

  it("calculates next charge dates for weeks and custom intervals", () => {
    expect(nextChargeAfter("2026-09-01", "1 week")).toBe("2026-09-08");
    expect(nextChargeAfter("2026-09-01", "2 weeks")).toBe("2026-09-15");
    expect(nextChargeAfter("2026-09-01", "2 weeks", true, "2026-10-03")).toBe("2026-10-13");
    expect(nextChargeAfter("2026-09-01", "2 months")).toBe("2026-11-01");
    expect(nextChargeAfter("2026-09-01", "2 years")).toBe("2028-09-01");
  });
});
