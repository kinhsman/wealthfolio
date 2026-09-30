import { describe, expect, it } from "vitest";
import { keywordsToRule, ruleToKeywords } from "./keywords";

describe("keywords in one rule", () => {
  it("one word stays a plain contains rule", () => {
    expect(keywordsToRule(["Costco"])).toEqual({ pattern: "Costco", matchType: "contains" });
    expect(ruleToKeywords("Costco", "contains")).toEqual(["Costco"]);
  });
  it("several words make a case-blind regex of escaped words, and read back", () => {
    const r = keywordsToRule(["Costco", "Sam's Club", "7-Eleven", "Dunkin' (Donuts)", "A.B|C"]);
    expect(r.matchType).toBe("regex");
    expect(r.pattern).toBe("(?i)Costco|Sam's Club|7-Eleven|Dunkin' \\(Donuts\\)|A\\.B\\|C");
    expect(ruleToKeywords(r.pattern, "regex")).toEqual(["Costco", "Sam's Club", "7-Eleven", "Dunkin' (Donuts)", "A.B|C"]);
    const re = new RegExp(r.pattern.slice(4), "i");
    expect(re.test("SAM'S CLUB #6435")).toBe(true);
    expect(re.test("ab c")).toBe(false);
  });
  it("a real regex is left as a regex", () => {
    expect(ruleToKeywords("(?i)DEPT OF REV|\\bIRS\\b|USATAXPYMT", "regex")).toBeNull();
    expect(ruleToKeywords("(?i)BOOK TRANSFER CREDIT.*(JOINT STOCK|VIETNAM)", "regex")).toBeNull();
    expect(ruleToKeywords("CISCO", "starts_with")).toBeNull();
  });
});
