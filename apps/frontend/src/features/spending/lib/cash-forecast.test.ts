import { describe, expect, it } from "vitest";

import type { Account } from "@/lib/types";

import { cardWhy, forecastLabel, plainName, stepPath, type ForecastEvent } from "./cash-forecast";
import type { Merchant } from "./merchants";

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

describe("cash forecast names and logos (owner, 10-03: some of the bank icons are missing)", () => {
  const acct = (id: string, name: string, group: string, accountType: string, logoUrl: string | null) =>
    ({ id, name, group, accountType, meta: JSON.stringify({ source: "plaid", ...(logoUrl ? { logoUrl } : {}) }) }) as unknown as Account;
  const accounts = [
    acct("prime", "Prime", "Chase", "CREDIT_CARD", "https://x/chase.webp"),
    acct("strata", "Strata Elite", "Citibank", "CREDIT_CARD", null),
    acct("fid", "F-CASH", "Fidelity", "CASH", "https://x/fid.webp"),
  ];
  const merchants = [
    { id: "z", name: "Zelle", pattern: "Zelle", patterns: ["Zelle"], logoUrl: "/z.png" },
    { id: "u", name: "US Bank", pattern: "US BANK", patterns: ["US BANK"], logoUrl: "/u.png" },
  ] as Merchant[];
  const ev = (e: Partial<ForecastEvent>): ForecastEvent => ({ date: "2026-10-20", name: "", amount: -1, why: "out", estimated: true, ...e });
  it("draws a card with its bank's logo and names it like the Credit cards card", () => {
    expect(forecastLabel(ev({ name: "Chase Amazon ••9150", card: "p1", accountId: "prime", mask: "9150", why: "statement" }), merchants, accounts))
      .toEqual({ label: "Prime ••9150", logo: { url: "https://x/chase.webp", name: "Chase", whole: true } });
    // No logo on the account: the bank's from the connection.
    expect(forecastLabel(ev({ name: "Strata Elite", card: "p2", accountId: "strata", mask: "0027", bankLogo: "https://x/citi.png" }), merchants, accounts).logo)
      .toEqual({ url: "https://x/citi.png", name: "Citibank", whole: true });
    // A forecast from before the service carried the account: the plain card sign, as before.
    expect(forecastLabel(ev({ name: "Freedom ••5257", card: "p3" }), merchants, accounts)).toEqual({ label: "Freedom ••5257", logo: null });
  });
  it("shows the bank on its own interest, a merchant's logo and name otherwise", () => {
    expect(forecastLabel(ev({ name: "FIDELITY GOVERNMENT MONEY MARKET - DIVIDEND RECEIVED", accountId: "fid", activityType: "INTEREST", why: "in" }), merchants, accounts))
      .toEqual({ label: "Fidelity interest", logo: { url: "https://x/fid.webp", name: "Fidelity", whole: true } });
    expect(forecastLabel(ev({ name: "Mortgage paid (on the Rental page): DIRECT DEBIT US BANK HOME MMTG PYMT (Cash)", accountId: "fid", activityType: "WITHDRAWAL" }), merchants, accounts))
      .toEqual({ label: "US Bank", logo: { url: "/u.png", name: "US Bank", whole: false } });
    expect(forecastLabel(ev({ name: "DEBIT CARD PURCHASE TMOBILE*AUTO PAY" }), merchants, accounts)).toEqual({ label: "Tmobile", logo: null });
  });
});
