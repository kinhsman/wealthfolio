import { describe, expect, it } from "vitest";
import { chargeLink, receiptSearchIndex, receiptSplit, receiptState, searchReceipts, shortCategory, storeName, type Receipt } from "./receipts";

const item = (categoryId: string, price: number) => ({ n: 0, name: "", what: "", code: null, price, taxable: false, categoryId });

describe("receipts", () => {
  it("shows what was filed, else what the lines say, biggest first", () => {
    const filed = { how: "split" as const, lines: [{ categoryId: "h", amount: "134.72" }, { categoryId: "g", amount: "44.24" }], charge: 178.96, at: "" };
    expect(receiptSplit({ filed, items: [] })).toEqual([{ categoryId: "h", amount: 134.72 }, { categoryId: "g", amount: 44.24 }]);
    expect(receiptSplit({ filed: null, items: [item("g", 10), item("h", 99.99), item("h", -20), item("x", -1)] })).toEqual([
      { categoryId: "h", amount: 79.99 },
      { categoryId: "g", amount: 10 },
    ]);
  });

  it("says where a receipt stands", () => {
    expect(receiptState({ status: "filed", filed: { how: "split", lines: [{ categoryId: "a", amount: "1" }, { categoryId: "b", amount: "2" }], charge: 3, at: "" } }).text).toBe("Split 2 ways");
    expect(receiptState({ status: "waiting", filed: null }).tone).toBe("plain");
    expect(receiptState({ status: "held", filed: null }).tone).toBe("look");
  });

  it("names the store and the category plainly", () => {
    expect(storeName("COSTCO WHOLESALE")).toBe("Costco Wholesale");
    expect(storeName("Trader Joe's")).toBe("Trader Joe's");
    expect(storeName(null)).toBe("Receipt");
    expect(shortCategory([{ id: "h", name: "Housing > Home maintenance" }], "h")).toBe("Home maintenance");
  });

  it("links to the charge in Transactions by its day and amount", () => {
    expect(chargeLink({ chargeDate: "2026-10-03", filed: null, total: 178.96 })).toBe(
      "/activities?tab=spending&from=2026-10-03&to=2026-10-03&amountMin=178.96&amountMax=178.96",
    );
    expect(chargeLink({ chargeDate: null, filed: null, total: 5 })).toBeNull();
  });

  describe("search", () => {
    const cats = [
      { id: "g", name: "Food & Dining > Groceries" },
      { id: "h", name: "Housing > Maintenance & Repairs" },
    ];
    const make = (over: Partial<Receipt>): Receipt => ({
      id: "x", at: "2026-10-01T10:00:00Z", photos: 1, status: "filed", error: null, held: null, check: null, store: null, date: null, total: null, tax: null,
      cardLast4: null, items: [], activityId: null, reviewed: true, chargeDate: null, chosen: false, filed: null, ...over,
    });
    const costco = make({
      id: "costco", store: "COSTCO WHOLESALE", date: "2026-09-19", total: 178.96, tax: 4.5, cardLast4: "4242", source: "photo",
      items: [
        { n: 0, name: "KS PAPER TOWEL", what: "Paper towels", code: "1234567", price: 24.99, taxable: true, categoryId: "h" },
        { n: 1, name: "ORG BANANAS", what: "Bananas", code: null, price: 3.49, taxable: false, categoryId: "g" },
      ],
      filed: { how: "split", lines: [{ categoryId: "h", amount: "134.72" }, { categoryId: "g", amount: "44.24" }], charge: 178.96, at: "" },
    });
    const pho = make({ id: "pho", store: "Phở Nam Lua", date: "2026-04-02", total: 31.5, reviewed: false, source: "gmail", mail: { email: "me@example.com", from: "orders@toasttab.com", subject: "Your receipt from Pho Nam Lua", date: "2026-04-02", link: null } });
    const amazon = make({ id: "amz", store: "Amazon", date: "2026-08-14", total: 43.98, source: "amazon", status: "waiting", items: [{ n: 0, name: "Kitchen faucet", what: "", code: null, price: 43.98, taxable: true, categoryId: "h" }] });
    const index = receiptSearchIndex([costco, pho, amazon], cats);
    const find = (q: string) => searchReceipts(index, q).map((r) => r.id);

    it("shows everything when nothing is typed", () => {
      expect(find("")).toEqual(["costco", "pho", "amz"]);
      expect(find("   $ ")).toEqual(["costco", "pho", "amz"]);
    });

    it("finds a receipt by store, item, code, category, card, source, state and mail", () => {
      expect(find("costco")).toEqual(["costco"]);
      expect(find("bananas")).toEqual(["costco"]);
      expect(find("KS PAPER")).toEqual(["costco"]);
      expect(find("1234567")).toEqual(["costco"]);
      expect(find("maintenance")).toEqual(["costco", "amz"]);
      expect(find("groceries")).toEqual(["costco"]);
      expect(find("4242")).toEqual(["costco"]);
      expect(find("amazon")).toEqual(["amz"]);
      expect(find("gmail")).toEqual(["pho"]);
      expect(find("toasttab")).toEqual(["pho"]);
      expect(find("example.com")).toEqual(["pho"]);
      expect(find("waiting")).toEqual(["amz"]);
      expect(find("split")).toEqual(["costco"]);
      expect(find("to review")).toEqual(["pho"]);
    });

    it("finds an amount with or without the dollar sign and the comma", () => {
      expect(find("178.96")).toEqual(["costco"]);
      expect(find("$178.96")).toEqual(["costco"]);
      expect(find("134.72")).toEqual(["costco"]);
      expect(find("4.5")).toEqual(["costco"]);
      expect(find("43.98")).toEqual(["amz"]);
    });

    it("finds a day however it is typed", () => {
      expect(find("2026-09-19")).toEqual(["costco"]);
      expect(find("sep 19")).toEqual(["costco"]);
      expect(find("september")).toEqual(["costco"]);
      expect(find("9/19/2026")).toEqual(["costco"]);
      expect(find("apr 2")).toEqual(["pho"]);
      expect(find("04/02/2026")).toEqual(["pho"]);
    });

    it("ignores case and accents, and wants every word, in any order", () => {
      expect(find("PHO nam")).toEqual(["pho"]);
      expect(find("phở")).toEqual(["pho"]);
      expect(find("2026 costco")).toEqual(["costco"]);
      expect(find("costco faucet")).toEqual([]);
      expect(find("nothing like this")).toEqual([]);
    });

    it("looks at the day it was snapped when the receipt has no date", () => {
      const undated = receiptSearchIndex([make({ id: "u", store: "Aldi" })], cats);
      expect(searchReceipts(undated, "oct 1").map((r) => r.id)).toEqual(["u"]);
    });
  });
});
