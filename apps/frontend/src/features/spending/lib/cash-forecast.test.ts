import { describe, expect, it } from "vitest";
import { cardWhy, plainName, stepPath } from "./cash-forecast";

describe("cash forecast", () => {
  it("steps on the day the balance changes", () => {
    expect(stepPath([100, 100, 50, 150], { w: 30, h: 100, min: 0, max: 200 })).toBe("M 0.00 50.00 H 10.00 H 20.00 V 75.00 H 30.00 V 25.00");
    expect(stepPath([], { w: 30, h: 100, min: 0, max: 200 })).toBe("");
  });
  it("names a payment without the bank's words", () => {
    expect(plainName("Rent received: Zelle payment from FELICIA CRUZ 306")).toBe("Rent received");
    expect(plainName("Mortgage paid (on the Rental page): DIRECT DEBIT US BANK")).toBe("Mortgage paid");
    expect(plainName("DEBIT CARD PURCHASE TMOBILE*AUTO PAY 800-937-8997 WA")).toBe("Tmobile");
    expect(plainName("CISCO SYSTEMS IN PAYROLL PPD ID: 9111111101")).toBe("Cisco Systems In Payroll");
    expect(plainName("DIRECT DEPOSIT CISCO SYSTEMPAYROLL (Cash)")).toBe("Cisco Systempayroll (Cash)");
    expect(cardWhy("statement")).toBe("statement due");
  });
});

import { niceScale } from "./cash-forecast";
describe("cash forecast scale", () => {
  it("ends on round numbers", () => {
    expect(niceScale(2446, 34002)).toEqual({ min: 0, max: 35000 });
    expect(niceScale(21000, 29300)).toEqual({ min: 21000, max: 30000 });
  });
});
