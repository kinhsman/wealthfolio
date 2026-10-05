import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.fn();
const listCategorizationRules = vi.fn();
vi.mock("sonner", () => ({ toast: (...args: unknown[]) => toast(...args) }));
vi.mock("../adapters/rules", () => ({ listCategorizationRules: () => listCategorizationRules() }));

import { offerAfterPicks, type HandPick } from "./offer-after-picks";
import { trackChargeStore } from "./track-charge";

const categories = [
  { id: "cat_bills", key: "bills", parentId: null },
  { id: "cat_bills_subscriptions", key: "bills_subscriptions", parentId: "cat_bills" },
  { id: "cat_food", key: "food", parentId: null },
];

// The Apple Card payment the owner filed as Subscriptions with the selection bar (10-05): a transfer out.
const appleCard = {
  id: "a1",
  notes: "Apple Card",
  amount: "11.08",
  activityDate: "2026-10-01T12:00:00Z",
  accountId: "checking",
  activityType: "TRANSFER_OUT",
};

const pick = (notes: string, categoryId = "cat_bills_subscriptions", categoryName = "Subscriptions"): HandPick => ({
  notes,
  taxonomyId: "spending_categories",
  categoryId,
  categoryName,
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  toast.mockReset();
  listCategorizationRules.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  trackChargeStore.close();
});

describe("offerAfterPicks", () => {
  it("offers the rule for a transfer filed under Subscriptions (the Apple Card payment)", async () => {
    offerAfterPicks([{ ...pick("Apple Card"), activity: appleCard }], categories);
    await settle();
    expect(toast).toHaveBeenCalledWith('Always file "Apple Card" as Subscriptions?', expect.anything());
    expect(trackChargeStore.get()).toBeNull();
  });

  it("waits for the which-subscription window on a money-out charge, then offers", async () => {
    const netflix = { ...appleCard, id: "a2", notes: "NETFLIX.COM 866-579", activityType: "WITHDRAWAL" };
    offerAfterPicks([{ ...pick("NETFLIX.COM 866-579"), activity: netflix }], categories);
    await settle();
    expect(trackChargeStore.get()).toMatchObject({ id: "a2" });
    expect(toast).not.toHaveBeenCalled();
    trackChargeStore.close();
    await settle();
    expect(toast).toHaveBeenCalledWith('Always file "NETFLIX.COM" as Subscriptions?', expect.anything());
  });

  it("offers one rule when several charges say the same words and went to the same category", async () => {
    offerAfterPicks([pick("Apple Card"), pick("APPLE CARD"), pick("Apple Card")], categories);
    await settle();
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith('Always file "Apple Card" as Subscriptions?', expect.anything());
  });

  it("stays quiet for a mixed batch: no single rule to offer", async () => {
    offerAfterPicks([pick("Apple Card"), pick("Spotify")], categories);
    offerAfterPicks([pick("Apple Card"), pick("Apple Card", "cat_food", "Food")], categories);
    await settle();
    expect(toast).not.toHaveBeenCalled();
  });

  it("stays quiet for several charges with no words to pick", async () => {
    offerAfterPicks([pick("6276ASCB02EQFHSU"), pick("6276ASCB02EQFHSU")], categories);
    await settle();
    expect(toast).not.toHaveBeenCalled();
  });

  it("does nothing for no picks", async () => {
    offerAfterPicks([], categories);
    await settle();
    expect(toast).not.toHaveBeenCalled();
  });
});
