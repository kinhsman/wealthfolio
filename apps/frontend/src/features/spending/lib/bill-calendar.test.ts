import { describe, expect, it } from "vitest";

import { billMonth, billSpan } from "./bill-calendar";
import type { Stream } from "./subscriptions";

const stream = (name: string, extra: Partial<Stream> = {}): Stream =>
  ({ key: name, name, every: "month", status: "active", usual: 100, next: "2026-10-10", charges: [], ...extra }) as unknown as Stream;

const items = [
  stream("US Bank", { usual: 2505.76, next: "2026-11-01", charges: [{ id: "m9", date: "2026-09-01", amount: 2505.76 }, { id: "m10", date: "2026-10-01", amount: 2505.76 }] }),
  stream("ComEd", { usual: 157, next: "2026-10-03" }),
  stream("Google Nest", { every: "year", usual: 80, next: "2026-11-11" }),
  stream("Peoples Gas", { status: "stopped", next: "2026-07-03" }),
];

describe("bill calendar month", () => {
  it("this month: paid so far and still to pay, each on its day", () => {
    const m = billMonth(items, "2026-10-02");
    expect([m.start, m.end, m.days, m.firstWeekday]).toEqual(["2026-10-01", "2026-10-31", 31, 4]);
    expect([m.paidTotal, m.leftTotal, m.paidCount, m.count]).toEqual([2505.76, 157, 1, 2]);
    expect(m.byDay.get("2026-10-01")?.map((b) => `${b.name} ${b.paid}`)).toEqual(["US Bank true"]);
    expect(m.byDay.get("2026-10-03")?.map((b) => `${b.name} ${b.paid}`)).toEqual(["ComEd false"]);
  });

  it("a month ahead: where each rhythm lands, nothing paid yet", () => {
    const m = billMonth(items, "2026-10-02", 1);
    expect(m.label).toBe(new Date(2026, 10, 1).toLocaleDateString(undefined, { month: "long" }));
    expect(m.left.map((b) => `${b.name} ${b.date}`)).toEqual(["US Bank 2026-11-01", "ComEd 2026-11-03", "Google Nest 2026-11-11"]);
    expect(m.paid).toEqual([]);
  });

  it("a month back: only what was paid", () => {
    const m = billMonth(items, "2026-10-02", -1);
    expect(m.paid.map((b) => `${b.name} ${b.date}`)).toEqual(["US Bank 2026-09-01"]);
    expect(m.left).toEqual([]);
  });

  it("late from last month: on today's square, said as late", () => {
    const m = billMonth([stream("Water", { next: "2026-09-28" })], "2026-10-02");
    expect(m.byDay.get("2026-10-02")?.map((b) => `${b.name} ${b.late}`)).toEqual(["Water 2026-09-28"]);
  });
});

describe("bill span (the Spending page's range)", () => {
  const today = "2026-10-02";

  it("this month equals the bill calendar's month", () => {
    const m = billMonth(items, today);
    const span = billSpan(items, today, "2026-10-01", today);
    expect(span.open).toBe(true);
    expect([span.paidTotal, span.leftTotal, span.paidCount, span.count]).toEqual([m.paidTotal, m.leftTotal, m.paidCount, m.count]);
  });

  it("last month: what was charged then and nothing left to pay", () => {
    const span = billSpan(items, today, "2026-09-01", "2026-09-30");
    expect([span.open, span.paidTotal, span.leftTotal, span.paidCount, span.count]).toEqual([false, 2505.76, 0, 1, 1]);
    const back = billMonth(items, today, -1);
    expect(span.paidTotal).toBe(back.paidTotal);
  });

  it("a range of months adds them up and keeps this month's left to pay", () => {
    const span = billSpan(items, today, "2026-08-02", today);
    expect([span.open, span.paidTotal, span.leftTotal, span.paidCount, span.count]).toEqual([true, 5011.52, 157, 1, 2]);
  });

  it("a range starting mid-month leaves out the charges before it", () => {
    const span = billSpan(items, today, "2026-09-15", today);
    expect([span.paidTotal, span.paidCount]).toEqual([2505.76, 1]);
  });

  it("a month picked from the calendar (other than this one) has no left to pay", () => {
    const span = billSpan(items, today, "2026-08-01", "2026-08-31");
    expect([span.open, span.paidTotal, span.leftTotal, span.count]).toEqual([false, 0, 0, 0]);
  });
});
