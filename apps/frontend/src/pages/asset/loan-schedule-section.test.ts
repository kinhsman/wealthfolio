import { describe, expect, it } from "vitest";

import { formValuesToMetadata, getDefaultDetailsFormValues, linesFromMetadata, linesToMetadata } from "./alternative-assets/components/asset-details-sheet-schema";
import { AlternativeAssetKind } from "@/lib/types";
import { termLabel } from "./loan-schedule-section";

describe("a loan's term and schedule settings (money-hub, owner 10-03)", () => {
  it("the term as people say it", () => {
    expect(termLabel(240)).toBe("20 years");
    expect(termLabel(30)).toBe("2 years 6 months");
    expect(termLabel(1)).toBe("1 month");
    expect(termLabel(13)).toBe("1 year 1 month");
  });
  it("kept on the liability, and cleared or switched off for good", () => {
    const md = { original_amount: "1200000000", interest_rate: "9", origination_date: "2026-01-15", term_months: "120", repayment: "equal_principal", follow_schedule: "true" };
    const v = getDefaultDetailsFormValues(AlternativeAssetKind.LIABILITY, "Vietnam loan", md, null);
    expect(v).toMatchObject({ termMonths: 120, repayment: "equal_principal", followSchedule: true });
    expect(formValuesToMetadata(v)).toMatchObject({ term_months: "120", repayment: "equal_principal", follow_schedule: "true" });
    // A loan added before: the same payment every month, not following a schedule.
    const old = getDefaultDetailsFormValues(AlternativeAssetKind.LIABILITY, "US Bank", { original_amount: "400000" }, null);
    expect(old).toMatchObject({ termMonths: null, repayment: "annuity", followSchedule: false });
    expect(formValuesToMetadata({ ...v, termMonths: null, followSchedule: false } as typeof v)).toMatchObject({ term_months: "", follow_schedule: "false" });
    // Interest only is kept as it is.
    const io = getDefaultDetailsFormValues(AlternativeAssetKind.LIABILITY, "Vietin", { ...md, repayment: "interest_only" }, null);
    expect(formValuesToMetadata(io)).toMatchObject({ repayment: "interest_only" });
  });
  it("one loan in lines: kept as the bank lists them, a line with no amount left out, none clears them", () => {
    const raw = JSON.stringify([
      { id: "a", number: "862012139429", amount: 4350000000, end: "2026-10-12" },
      { id: "b", number: "869012229524", amount: 1356000000, end: null },
    ]);
    const lines = linesFromMetadata(raw);
    expect(lines.map((l) => [l.number, l.amount, l.end?.getDate() ?? null])).toEqual([
      ["862012139429", 4350000000, 12],
      ["869012229524", 1356000000, null],
    ]);
    expect(JSON.parse(linesToMetadata([...lines, { id: "c", number: "", amount: 0, end: null }]))).toEqual([
      { id: "a", number: "862012139429", amount: 4350000000, end: "2026-10-12" },
      { id: "b", number: "869012229524", amount: 1356000000, end: null },
    ]);
    expect(linesToMetadata([])).toBe("");
    expect(linesFromMetadata("not json")).toEqual([]);
    const v = getDefaultDetailsFormValues(AlternativeAssetKind.LIABILITY, "Vietin", { loan_lines: raw, payment_day: "25" }, null);
    expect(v).toMatchObject({ paymentDay: 25 });
    expect(formValuesToMetadata(v)).toMatchObject({ payment_day: "25", loan_lines: linesToMetadata(lines) });
  });
});
