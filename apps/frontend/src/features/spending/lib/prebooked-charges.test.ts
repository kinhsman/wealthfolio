import { describe, expect, it } from "vitest";

import { earlierCharges, earlierWindow, looksLikeTravel } from "./prebooked-charges";

const row = (over: Record<string, unknown> = {}) => ({
  id: "x",
  activityDate: "2026-10-15T17:00:00Z",
  notes: "Whole Foods",
  eventId: null,
  netAmount: -20,
  cashFlowBucket: "spending",
  assignments: [],
  ...over,
});

describe("looksLikeTravel", () => {
  it("knows the Citi Travel flight", () => {
    expect(looksLikeTravel(row({ notes: "CITI TRAVEL EVA AIR 1066475874" }))).toBe(true);
  });
  it("knows a Travel category even with plain bank text", () => {
    expect(looksLikeTravel(row({ assignments: [{ categoryId: "cat_travel_flights" }] }))).toBe(
      true,
    );
  });
  it("leaves groceries alone", () => {
    expect(looksLikeTravel(row())).toBe(false);
  });
  it("does not trip on words that only contain a travel word", () => {
    expect(looksLikeTravel(row({ notes: "UNITEDHEALTHCARE" }))).toBe(false);
  });
});

describe("earlierCharges", () => {
  it("drops tagged, income and money-in rows", () => {
    const rows = [
      row({ id: "tagged", eventId: "e1" }),
      row({ id: "income", cashFlowBucket: "income", netAmount: 100 }),
      row({ id: "refund", netAmount: 5 }),
      row({ id: "ok" }),
    ];
    expect(earlierCharges(rows).map((r) => r.id)).toEqual(["ok"]);
  });
  it("puts travel first, then newest first", () => {
    const rows = [
      row({ id: "old-shop", activityDate: "2026-08-01T17:00:00Z" }),
      row({ id: "new-shop", activityDate: "2026-10-01T17:00:00Z" }),
      row({ id: "flight", activityDate: "2026-07-01T17:00:00Z", notes: "EVA AIR" }),
    ];
    expect(earlierCharges(rows).map((r) => r.id)).toEqual(["flight", "new-shop", "old-shop"]);
  });
});

describe("earlierWindow", () => {
  it("ends just before the first day and starts 180 days earlier", () => {
    const w = earlierWindow(new Date(2026, 11, 5, 15, 30));
    expect(new Date(w.endDate).getTime()).toBe(new Date(2026, 11, 5).getTime() - 1);
    expect(new Date(w.startDate).getTime()).toBe(new Date(2026, 5, 8).getTime());
  });
});
