import { describe, expect, it } from "vitest";
import type { CashActivity } from "../types/cash-activity";
import { canSetCountsAs } from "./counts-as";

const entry = (sourceSystem: string | null | undefined) => ({ sourceSystem }) as unknown as CashActivity;

describe("canSetCountsAs", () => {
  it("is offered on entries a bank import made", () => {
    expect(canSetCountsAs(entry("PLAID"))).toBe(true);
  });

  it("is offered on banks read from their alert emails (MB, ACB)", () => {
    expect(canSetCountsAs(entry("EMAIL"))).toBe(true);
  });

  it("is not offered on entries made by hand or by another feature", () => {
    expect(canSetCountsAs(entry("MANUAL"))).toBe(false);
    expect(canSetCountsAs(entry("OWLY"))).toBe(false);
    expect(canSetCountsAs(entry(null))).toBe(false);
    expect(canSetCountsAs(entry(undefined))).toBe(false);
  });
});
