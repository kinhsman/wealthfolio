import { describe, expect, it } from "vitest";

import { dayScale } from "./spending-by-period-card";

describe("dayScale", () => {
  it("keeps the biggest bar as the top when no day is far above the rest", () => {
    const sorted = [10, 12, 14, 15, 16, 18, 20, 22, 25, 30];
    const { top, outliers } = dayScale(sorted, 18);
    expect(outliers).toBe(false);
    expect(top).toBeGreaterThanOrEqual(30);
  });

  it("cuts a day over four times a middle day even when bill days lift the 85th percentile", () => {
    // Three bill days (400, 520, 3138) lift the 85th percentile; the middle day is 30.
    const sorted = [8, 12, 15, 20, 25, 30, 35, 40, 45, 60, 400, 520, 3138];
    const { top, outliers } = dayScale(sorted, 120);
    expect(outliers).toBe(true);
    expect(top).toBeLessThan(400);
  });

  it("does not cut with fewer than four days", () => {
    expect(dayScale([5, 6, 900], 100).outliers).toBe(false);
  });
});
