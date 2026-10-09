import { describe, expect, it } from "vitest";

import {
  assetFilterOptions,
  chargeIdsFor,
  claimOf,
  hasRule,
  withRule,
  withoutRule,
  type ChargeLinksView,
  type ChargeRule,
} from "./charge-links";

const rules: ChargeRule[] = [
  { id: "r1", kind: "payee", value: "m_statefarm", label: "State Farm" },
  { id: "r2", kind: "words", value: "geico" },
];

const asset = (id: string, name: string, count: number) => ({
  id,
  kind: "vehicle",
  name,
  links: { rules: [], include: [], exclude: [] },
  count,
  total: 0,
  yearCount: 0,
  yearTotal: 0,
  lost: 0,
  rules: {},
  recent: [],
});

const view: ChargeLinksView = {
  year: "2026",
  assets: [asset("a1", "Honda CRV", 3), asset("a2", "Beach house", 0), asset("a3", "Apartment", 1)],
  claims: {
    c1: { assetId: "a1", ruleId: "r1", via: "rule", amount: 90 },
    c2: { assetId: "a3", ruleId: null, via: "include", amount: 40 },
    c3: { assetId: "a1", ruleId: "r2", via: "rule", amount: 60 },
  },
};

describe("charge links helpers", () => {
  it("hasRule ignores case and spacing", () => {
    expect(hasRule(rules, "words", "  GEICO ")).toBe(true);
    expect(hasRule(rules, "words", "state farm")).toBe(false);
    expect(hasRule(rules, "payee", "m_statefarm")).toBe(true);
  });

  it("withRule adds and withoutRule removes by id, keeping the rest", () => {
    const added = withRule(rules, { kind: "category", value: "cat_utilities" });
    expect(added).toHaveLength(3);
    expect(added[0].id).toBe("r1");
    expect(withoutRule(rules, "r1").map((r) => r.id)).toEqual(["r2"]);
  });

  it("claimOf finds the asset a charge is for", () => {
    expect(claimOf(view, "c2")?.asset.name).toBe("Apartment");
    expect(claimOf(view, "nope")).toBeNull();
    expect(claimOf(undefined, "c1")).toBeNull();
  });

  it("chargeIdsFor returns the charges of the chosen assets only", () => {
    expect(chargeIdsFor(view, new Set(["a1"])).sort()).toEqual(["c1", "c3"]);
    expect(chargeIdsFor(view, new Set(["a1", "a3"])).sort()).toEqual(["c1", "c2", "c3"]);
    expect(chargeIdsFor(view, new Set(["a2"]))).toEqual([]);
  });

  it("assetFilterOptions lists assets that have charges, by name", () => {
    expect(assetFilterOptions(view)).toEqual([
      { value: "a3", label: "Apartment" },
      { value: "a1", label: "Honda CRV" },
    ]);
    expect(assetFilterOptions(undefined)).toEqual([]);
  });
});
