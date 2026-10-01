import { describe, expect, it } from "vitest";
import { dueLabel, statusLabel, transactionsHref, upcoming, type Stream } from "@/features/spending/lib/subscriptions";

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
  it("the transactions link searches the payee's first words", () => {
    expect(transactionsHref(base)).toBe("/activities?tab=spending&q=Youtube%20Premium");
    expect(transactionsHref(mk({ name: "Rose Pest Solutions Il", last: null }))).toBe("/activities?tab=spending&q=Rose%20Pest%20Solutions%20Il");
  });
});
