// money-hub patch: Returns wording and ordering (lib/returns.ts).
import { describe, expect, it } from "vitest";

import { closedReturns, currencyDigits, marksOf, openReturns, purchaseOf, returnLine, returnStatus, type ReturnItem } from "./returns";

const year = new Date().getFullYear();
const item = (over: Partial<ReturnItem>): ReturnItem => ({
  id: "r1",
  purchaseId: "p1",
  name: "Amazon",
  logoUrl: null,
  useBank: false,
  accountId: "acc",
  purchase: { date: `${year}-09-20`, amount: 60, notes: "Amazon" },
  expected: 60,
  returnedOn: `${year}-09-28`,
  within: 14,
  dueOn: `${year}-10-12`,
  dueInDays: 11,
  waitingDays: 3,
  note: "",
  received: 0,
  remaining: 60,
  status: "waiting",
  refunds: [],
  suggestions: [],
  closedAt: null,
  tookDays: null,
  createdAt: `${year}-09-28T12:00:00Z`,
  ...over,
});
const refund = (id: string, date: string, amount: number) => ({ id, accountId: "acc", date, amount, notes: "Amazon", auto: true, at: `${date}T18:00:00Z` });
const offer = { id: "c9", accountId: "acc", date: `${year}-09-30`, amount: 60, notes: "Amazon", exact: true, store: "same" as const };

describe("returns wording", () => {
  it("says where a return stands", () => {
    expect(returnLine(item({}))).toBe("Sent back Sep 28 · expected by Oct 12, in 11 days");
    expect(returnLine(item({ dueInDays: 1 }))).toBe("Sent back Sep 28 · expected by Oct 12, in 1 day");
    expect(returnLine(item({ dueInDays: 0 }))).toBe("Sent back Sep 28 · expected today");
    expect(returnLine(item({ status: "late", dueInDays: -7 }))).toBe("Sent back Sep 28 · expected Oct 12, 7 days ago");
    expect(returnLine(item({ status: "back", closedAt: `${year}-10-01T18:00:00Z`, tookDays: 3, refunds: [refund("c1", `${year}-10-01`, 60)] }))).toBe(
      "Sent back Sep 28 · back Oct 1, 3 days later",
    );
    expect(returnLine(item({ status: "back", closedAt: `${year}-09-28T18:00:00Z`, tookDays: 0, refunds: [refund("c1", `${year}-09-28`, 60)] }))).toBe(
      "Sent back Sep 28 · back Sep 28, the same day",
    );
    expect(returnLine(item({ status: "settled", closedAt: `${year}-10-02T18:00:00Z` }))).toBe("Sent back Sep 28 · settled Oct 2");
  });

  it("is amber only for what needs a look", () => {
    expect(returnStatus(item({}))).toEqual({ label: "Waiting", tone: "plain" });
    expect(returnStatus(item({ status: "part" }))).toEqual({ label: "Part back", tone: "plain" });
    expect(returnStatus(item({ status: "late" }))).toEqual({ label: "Late", tone: "look" });
    expect(returnStatus(item({ suggestions: [offer] }))).toEqual({ label: "Is this it?", tone: "look" });
    expect(returnStatus(item({ status: "back" }))).toEqual({ label: "Refunded", tone: "fine" });
    expect(returnStatus(item({ status: "settled" }))).toEqual({ label: "Settled", tone: "over" });
  });
});

describe("returns ordering and marks", () => {
  const confirm = item({ id: "a", suggestions: [offer], dueOn: `${year}-10-20` });
  const late = item({ id: "b", status: "late", dueOn: `${year}-09-19` });
  const soon = item({ id: "c", dueOn: `${year}-10-05` });
  const later = item({ id: "d", dueOn: `${year}-10-12` });
  const done = item({ id: "e", purchaseId: "p5", status: "back", closedAt: `${year}-09-24T10:00:00Z`, refunds: [refund("c5", `${year}-09-24`, 60)] });
  const doneLater = item({ id: "f", purchaseId: "p6", status: "settled", closedAt: `${year}-09-30T10:00:00Z` });

  it("puts one to confirm first, then late, then the nearest date; done ones latest first", () => {
    expect(openReturns([later, done, soon, late, confirm]).map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
    expect(closedReturns([done, later, doneLater]).map((x) => x.id)).toEqual(["f", "e"]);
  });

  it("marks the purchase and each refund; an open return wins the purchase over a closed one", () => {
    const again = item({ id: "g", purchaseId: "p5" });
    const marks = marksOf([again, done]);
    expect(marks.get("p5")).toEqual({ item: again, role: "purchase" });
    expect(marks.get("c5")).toEqual({ item: done, role: "refund" });
    expect(marks.get("nothing")).toBeUndefined();
  });

  it("reads a purchase off a transaction", () => {
    expect(purchaseOf({ id: "t1", accountId: "acc", activityDate: "2026-09-20T17:00:00+00:00", amount: "-31.97", notes: null })).toEqual({
      id: "t1",
      accountId: "acc",
      date: "2026-09-20",
      amount: 31.97,
      notes: "",
    });
  });
});

// Dong (owner, 10-03: the ACB and MB accounts are kept in VND).
describe("a return paid in dong", () => {
  it("starts from the charge in its own currency, and dong has no cents", () => {
    expect(purchaseOf({ id: "t2", accountId: "acb", activityDate: "2026-10-03T17:00:00+00:00", amount: "-520000", currency: "VND", notes: "SHOPEE" })).toEqual({
      id: "t2", accountId: "acb", date: "2026-10-03", amount: 520000, currency: "VND", notes: "SHOPEE",
    });
    expect(currencyDigits("VND")).toBe(0);
    expect(currencyDigits("USD")).toBe(2);
    expect(currencyDigits("not a code")).toBe(2);
  });
});
