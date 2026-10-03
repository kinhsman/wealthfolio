import { describe, expect, it } from "vitest";
import { amazonReturnState, amazonSummary, type AmazonLink } from "./amazon";

const link = (patch: Partial<AmazonLink>): AmazonLink => ({
  orderId: "114-1", url: "https://www.amazon.com/gp/your-account/order-details?orderID=114-1", how: "shipment",
  placed: "2026-09-26", delivered: null, label: null, count: null, items: [], orderTotal: 24.3, returns: [], ...patch,
});

describe("Amazon order line", () => {
  it("names the first item and how many more", () => {
    expect(amazonSummary(link({ items: [{ name: "Live Wise Vitamin…", qty: 1 }, { name: "Milk frother…", qty: 2 }] }))).toBe("Live Wise Vitamin… +1");
    expect(amazonSummary(link({ items: [{ name: "Gift Card", qty: 1 }] }))).toBe("Gift Card");
  });
  it("says the kind when Amazon names no product", () => {
    expect(amazonSummary(link({ label: "Coffee Accessories", count: 1 }))).toBe("Coffee Accessories");
    expect(amazonSummary(link({ label: "Lawn Care", count: 2 }))).toBe("2 Lawn Care items");
    expect(amazonSummary(link({}))).toBe("Amazon order 114-1");
  });
  it("says where a return stands", () => {
    const r = { item: "x", refund: 10, requested: "2026-07-01", dropped: null, refunded: null };
    expect(amazonReturnState(r)).toBe("Return started");
    expect(amazonReturnState({ ...r, dropped: "2026-07-02" })).toBe("Sent back");
    expect(amazonReturnState({ ...r, refunded: "2026-07-03" })).toBe("Refunded");
  });
});
