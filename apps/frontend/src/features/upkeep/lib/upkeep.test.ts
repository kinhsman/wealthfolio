import { describe, expect, it } from "vitest";

import {
  OTHER_STARTERS,
  PROPERTY_STARTERS,
  VEHICLE_STARTERS,
  startersFor,
  starterJob,
} from "./starters";
import { everyText, hasMiles, lastText, miles, nextDueText, shortDay, tabName } from "./upkeep";

describe("everyText", () => {
  it("says yearly for a plain 12 months", () => {
    expect(everyText({ months: 12, miles: null })).toBe("yearly");
  });
  it("joins miles and months", () => {
    expect(everyText({ months: 6, miles: 5000 })).toBe("every 5k mi or 6 mo");
    expect(everyText({ months: 24, miles: 15000 })).toBe("every 15k mi or 2 yr");
  });
  it("handles one rule alone and half thousands", () => {
    expect(everyText({ months: null, miles: 7500 })).toBe("every 7.5k mi");
    expect(everyText({ months: 3, miles: null })).toBe("every 3 mo");
    expect(everyText({ months: 36, miles: null })).toBe("every 3 yr");
  });
});

describe("shortDay", () => {
  it("leaves the year off in this year and adds it in another", () => {
    expect(shortDay("2026-06-03", "2026-10-08")).toBe("Jun 3");
    expect(shortDay("2027-06-09", "2026-10-08")).toBe("Jun 9, 2027");
  });
});

describe("lastText", () => {
  const base = { id: "j", name: "Oil", months: 6, miles: 5000, status: {} } as never;
  it("asks for the day when none is set", () => {
    expect(lastText({ ...(base as object), last: null } as never, "2026-10-08")).toBe(
      "not set yet",
    );
  });
  it("shows the miles only when there are some", () => {
    const withMiles = { ...(base as object), last: { date: "2026-06-03", miles: 57900 } } as never;
    expect(lastText(withMiles, "2026-10-08")).toBe("Jun 3 · 57,900 mi");
    const noMiles = { ...(base as object), last: { date: "2026-06-03", miles: null } } as never;
    expect(lastText(noMiles, "2026-10-08")).toBe("Jun 3");
  });
});

describe("nextDueText", () => {
  it("adds the months to the day typed and clamps to the end of a short month", () => {
    expect(nextDueText({ months: 6, miles: null }, "2026-08-31", null, "2026-10-08")).toBe(
      "Next due Feb 28, 2027",
    );
  });
  it("adds the miles to the odometer", () => {
    expect(nextDueText({ months: 6, miles: 5000 }, "2026-10-08", 60000, "2026-10-08")).toBe(
      "Next due 65,000 mi or Apr 8, 2027",
    );
  });
  it("says nothing when there is nothing to add", () => {
    expect(nextDueText({ months: null, miles: 5000 }, "2026-10-08", null, "2026-10-08")).toBe("");
    expect(nextDueText({ months: 6, miles: null }, "", null, "2026-10-08")).toBe("");
  });
});

describe("names and kinds", () => {
  it("prefers the short label on a tab", () => {
    expect(tabName({ label: "Civic", name: "2019 Honda Civic EX" })).toBe("Civic");
    expect(tabName({ label: "", name: "Home" })).toBe("Home");
  });
  it("only a vehicle has miles", () => {
    expect(hasMiles("vehicle")).toBe(true);
    expect(hasMiles("property")).toBe(false);
  });
  it("groups thousands", () => {
    expect(miles(57900)).toBe("57,900");
  });
});

describe("starters", () => {
  it("picks the list for the asset kind", () => {
    expect(startersFor("property")).toBe(PROPERTY_STARTERS);
    expect(startersFor("vehicle")).toBe(VEHICLE_STARTERS);
    expect(startersFor("collectible")).toBe(OTHER_STARTERS);
  });
  it("every starter has a rule, and only a car's have miles", () => {
    for (const s of [...PROPERTY_STARTERS, ...VEHICLE_STARTERS, ...OTHER_STARTERS]) {
      expect(s.months || s.miles).toBeTruthy();
    }
    for (const s of [...PROPERTY_STARTERS, ...OTHER_STARTERS]) expect(s.miles).toBeUndefined();
  });
  it("hands the service nulls for a missing rule", () => {
    expect(starterJob({ name: "Tire rotation", miles: 7500, on: true })).toEqual({
      name: "Tire rotation",
      months: null,
      miles: 7500,
    });
  });
});
