import { afterEach, describe, expect, it, vi } from "vitest";

import { askWhichOne, trackChargeStore, trackGroupFor } from "./track-charge";

const categories = [
  { id: "cat_bills", key: "bills", parentId: null },
  { id: "cat_bills_subscriptions", key: "bills_subscriptions", parentId: "cat_bills" },
  { id: "cat_entertainment_streaming", key: "entertainment_streaming", parentId: "cat_entertainment" },
  { id: "cat_bills_phone", key: "bills_phone", parentId: "cat_bills" },
  { id: "cat_housing_utilities", key: "housing_utilities", parentId: "cat_housing" },
  { id: "own_water", key: "water", parentId: "cat_bills" },
  { id: "cat_food", key: "food", parentId: null },
  { id: "cat_housing_maintenance", key: "housing_maintenance", parentId: "cat_housing" },
];

const charge = {
  id: "a1",
  notes: "NETFLIX.COM 866-579",
  amount: "15.49",
  activityDate: "2026-09-12T05:00:00Z",
  accountId: "acc",
  activityType: "WITHDRAWAL",
};

afterEach(() => {
  trackChargeStore.close();
  vi.useRealTimers();
});

describe("which categories ask which subscription or bill a charge is", () => {
  it("subscriptions, bills, and anything else under Bills & Utilities", () => {
    expect(trackGroupFor("cat_bills_subscriptions", categories)).toBe("subscriptions");
    expect(trackGroupFor("cat_entertainment_streaming", categories)).toBe("subscriptions");
    expect(trackGroupFor("cat_bills_phone", categories)).toBe("bills");
    expect(trackGroupFor("cat_housing_utilities", categories)).toBe("bills");
    expect(trackGroupFor("own_water", categories)).toBe("bills");
    expect(trackGroupFor("cat_food", categories)).toBeNull();
    expect(trackGroupFor("cat_housing_maintenance", categories)).toBeNull();
  });

  it("opens the window for money out, after the picker closes, and runs what waits on it", () => {
    vi.useFakeTimers();
    const after = vi.fn();
    expect(askWhichOne({ activity: charge, categoryId: "cat_bills_subscriptions", categories, categoryName: "Subscriptions", after })).toBe(true);
    expect(trackChargeStore.get()).toBeNull();
    vi.runAllTimers();
    expect(trackChargeStore.get()).toMatchObject({ id: "a1", amount: 15.49, date: "2026-09-12", group: "subscriptions" });
    trackChargeStore.close();
    expect(after).toHaveBeenCalledOnce();
  });

  it("leaves money in and other categories alone", () => {
    const refund = { ...charge, activityType: "DEPOSIT" };
    expect(askWhichOne({ activity: refund, categoryId: "cat_bills_subscriptions", categories, categoryName: "Subscriptions" })).toBe(false);
    expect(askWhichOne({ activity: charge, categoryId: "cat_food", categories, categoryName: "Food" })).toBe(false);
    expect(askWhichOne({ activity: undefined, categoryId: "cat_bills_phone", categories, categoryName: "Phone" })).toBe(false);
  });
});
