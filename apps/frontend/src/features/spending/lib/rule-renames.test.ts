import { describe, expect, it } from "vitest";

import type { CategorizationRule } from "../types/rule";
import { renameFor } from "./rule-renames";

const rule = (o: Partial<CategorizationRule>): CategorizationRule => ({
  id: "r1",
  name: "n",
  pattern: "NFLX",
  matchType: "contains",
  priority: 0,
  isGlobal: true,
  createdAt: "",
  updatedAt: "",
  ...o,
});

describe("renameFor", () => {
  const t = {
    notes: "NETFLIX NFLX.COM",
    activityType: "WITHDRAWAL",
    accountId: "a1",
    amount: -15.49,
  };
  it("renames on a match, case blind", () => {
    expect(renameFor([rule({ pattern: "nflx" })], { r1: "Netflix" }, t)).toBe("Netflix");
  });
  it("leaves a transaction alone with no match or no rename", () => {
    expect(renameFor([rule({ pattern: "HULU" })], { r1: "Hulu" }, t)).toBeNull();
    expect(renameFor([rule({})], {}, t)).toBeNull();
  });
  it("respects account, type and amount conditions", () => {
    expect(renameFor([rule({ isGlobal: false, accountId: "a2" })], { r1: "X" }, t)).toBeNull();
    expect(renameFor([rule({ activityType: "DEPOSIT" })], { r1: "X" }, t)).toBeNull();
    expect(
      renameFor([rule({ amountOp: "between", amountValue: 10, amountValue2: 20 })], { r1: "X" }, t),
    ).toBe("X");
    expect(renameFor([rule({ amountOp: "gt", amountValue: 20 })], { r1: "X" }, t)).toBeNull();
  });
  it("the higher priority rename wins", () => {
    const rules = [rule({ id: "a", priority: 1 }), rule({ id: "b", priority: 5 })];
    expect(renameFor(rules, { a: "Low", b: "High" }, t)).toBe("High");
  });
});
