import { describe, expect, it } from "vitest";
import { bucketsOf, periodLabel, periodsBetween, spendOf, summaryOf } from "./drill";

const row = (activityDate: string, amount: string, activityType = "WITHDRAWAL") => ({ activityDate, amount, activityType }) as never;

describe("store and category pages", () => {
  it("counts money back against spending", () => {
    expect(spendOf(row("2026-09-01", "-12.50"))).toBe(12.5);
    expect(spendOf(row("2026-09-01", "31.97", "CREDIT"))).toBe(-31.97);
  });
  it("lists every period, empty ones too", () => {
    expect(periodsBetween("2026-08-01", "2026-10-03", "month")).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(periodsBetween("2025-11-01", "2026-10-03", "quarter")).toEqual(["2025-Q4", "2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"]);
    expect(periodsBetween("2025-11-01", "2026-10-03", "year")).toEqual(["2025", "2026"]);
  });
  it("adds up each period and the totals", () => {
    const rows = [row("2026-08-03", "100"), row("2026-08-20", "50"), row("2026-10-01", "40", "CREDIT"), row("2026-10-02", "200")];
    expect(bucketsOf(rows, { from: "2026-08-01", to: "2026-10-03", grain: "month" }).map((b) => [b.key, b.spent, b.count])).toEqual([
      ["2026-08", 150, 2], ["2026-09", 0, 0], ["2026-10", 160, 2],
    ]);
    expect(summaryOf(rows)).toEqual({ spent: 310, back: 40, count: 4, average: 116.67, largest: 200, first: "2026-08-03", last: "2026-10-02" });
  });
  it("names periods", () => {
    expect(periodLabel("2026-10", "month")).toBe("Oct");
    expect(periodLabel("2026-Q3", "quarter")).toBe("Q3 '26");
  });
});
