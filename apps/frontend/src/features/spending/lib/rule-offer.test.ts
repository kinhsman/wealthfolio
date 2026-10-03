import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.fn();
const listCategorizationRules = vi.fn();
vi.mock("sonner", () => ({ toast: (...args: unknown[]) => toast(...args) }));
vi.mock("../adapters/rules", () => ({ listCategorizationRules: () => listCategorizationRules() }));

import { offerRule, rulePatternFrom } from "./rule-offer";

describe("rulePatternFrom", () => {
  it("stops at the first reference number", () => {
    expect(rulePatternFrom("ATM CASH DEPOSIT 09/23 5831 N MILWAUKEE AVE")).toBe("ATM CASH DEPOSIT");
    expect(rulePatternFrom("Costco")).toBe("Costco");
    expect(rulePatternFrom("WALGREENS #1234")).toBe("WALGREENS");
  });

  it("keeps the letters of a word with a date glued on (ACB)", () => {
    expect(rulePatternFrom("FAMILY-031026-10:03:04 6276ASCB02EQFHSU .")).toBe("FAMILY");
    expect(
      rulePatternFrom("LAM THANH SANG CHUYEN TIEN GD 6276MSCBD2PGWQKG 031026-06:17:42 ."),
    ).toBe("LAM THANH SANG CHUYEN TIEN GD");
  });

  it("drops a dangling dash before the number (MB)", () => {
    expect(rulePatternFrom("LAM THANH SANG chuyen tien (LAM THANH SANG - 48438917)")).toBe(
      "LAM THANH SANG chuyen tien (LAM THANH SANG",
    );
  });

  it("leaves a short glued prefix out, as before", () => {
    expect(rulePatternFrom("AMZN Mktp US*2K4AB1C2")).toBe("AMZN Mktp");
  });

  it("gives nothing for labelled or number-first text", () => {
    expect(rulePatternFrom("Friend (Nga): Zelle 25.00")).toBeNull();
    expect(rulePatternFrom("6276ASCB02EQFHSU")).toBeNull();
    expect(rulePatternFrom("")).toBeNull();
  });
});

describe("offerRule", () => {
  beforeEach(() => {
    toast.mockReset();
    listCategorizationRules.mockReset().mockResolvedValue([]);
  });

  const pick = {
    taxonomyId: "spending_categories",
    categoryId: "c_family",
    categoryName: "Family",
  };

  it("offers a rule for an ACB entry", async () => {
    await offerRule({ notes: "FAMILY-031026-10:03:04 6276ASCB02EQFHSU .", ...pick });
    expect(toast).toHaveBeenCalledWith('Always file "FAMILY" as Family?', expect.anything());
  });

  it("still offers when no words could be picked", async () => {
    await offerRule({ notes: "6276ASCB02EQFHSU", ...pick });
    expect(toast).toHaveBeenCalledWith(
      "Always file transactions like this as Family?",
      expect.anything(),
    );
    expect(listCategorizationRules).not.toHaveBeenCalled();
  });

  it("stays quiet for labelled text and when the same rule exists", async () => {
    await offerRule({ notes: "Rent received: CRUZ 1650", ...pick });
    listCategorizationRules.mockResolvedValue([{ presetId: null, pattern: "family" }]);
    await offerRule({ notes: "FAMILY-031026-10:03:04", ...pick });
    expect(toast).not.toHaveBeenCalled();
  });
});
