import { describe, expect, it } from "vitest";

import {
  KITS,
  LAWN_STARTERS,
  OTHER_STARTERS,
  PROPERTY_STARTERS,
  VEHICLE_STARTERS,
  startersFor,
  starterJob,
} from "./starters";
import {
  MONTH_DAYS,
  everyText,
  hasMiles,
  lastText,
  miles,
  nextDueText,
  nextYearDay,
  rowText,
  shortDay,
  tabName,
  yearDayText,
} from "./upkeep";

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

describe("a job on a day each year", () => {
  const spring = { months: null, miles: null, on: { month: 4, day: 15 } };
  it("says the day in words", () => {
    expect(yearDayText({ month: 4, day: 15 })).toBe("Apr 15");
    expect(everyText(spring)).toBe("yearly on Apr 15");
  });
  it("shows no last-done day for a yearly job never marked", () => {
    const base = { id: "j", name: "Crabgrass preventer", ...spring, status: {} };
    expect(rowText({ ...base, last: null } as never, "2026-10-08")).toBe(
      "yearly on Apr 15 · not done yet",
    );
    expect(
      rowText({ ...base, last: { date: "2026-04-12", miles: null } } as never, "2026-10-08"),
    ).toBe("yearly on Apr 15 · last Apr 12");
    const oil = { id: "o", name: "Oil", months: 6, miles: 5000, on: null, last: null, status: {} };
    expect(rowText(oil as never, "2026-10-08")).toBe("every 5k mi or 6 mo · last not set yet");
  });
  it("finds the day to look for next, like the service", () => {
    const on = { month: 10, day: 15 };
    expect(nextYearDay(on, null, "2026-10-08")).toBe("2026-10-15");
    expect(nextYearDay(on, "2026-09-20", "2026-10-08")).toBe("2027-10-15");
    expect(nextYearDay(on, "2026-09-10", "2026-10-08")).toBe("2026-10-15");
    expect(nextYearDay({ month: 9, day: 7 }, null, "2026-10-08")).toBe("2027-09-07");
    expect(nextYearDay({ month: 9, day: 8 }, null, "2026-10-08")).toBe("2026-09-08");
    expect(nextYearDay({ month: 12, day: 25 }, null, "2027-01-02")).toBe("2026-12-25");
    expect(nextYearDay({ month: 1, day: 5 }, "2026-12-20", "2026-12-28")).toBe("2028-01-05");
  });
  it("words the next due under the Done window from the day typed", () => {
    expect(
      nextDueText({ ...spring, on: { month: 10, day: 5 } }, "2026-10-08", null, "2026-10-08"),
    ).toBe("Next due Oct 5, 2027");
    expect(nextDueText(spring, "", null, "2026-10-08")).toBe("");
  });
});

describe("the Chicago lawn kit", () => {
  it("is a kit with unique names, real days, and none with months or miles", () => {
    expect(KITS.lawn.list).toBe(LAWN_STARTERS);
    const names = LAWN_STARTERS.map((s) => s.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const s of LAWN_STARTERS) {
      expect(s.yearly).toBeTruthy();
      expect(s.months ?? s.miles).toBeUndefined();
      const { month, day } = s.yearly!;
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(MONTH_DAYS[month - 1]);
    }
  });
  it("runs through the year in order, from the mower in March to the last mow in November", () => {
    const days = LAWN_STARTERS.map((s) => s.yearly!.month * 100 + s.yearly!.day);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(LAWN_STARTERS[0].name).toBe("Mower tune-up");
    expect(LAWN_STARTERS[LAWN_STARTERS.length - 1].name).toBe("Last mow");
  });
  it("ticks the core jobs, leaves the optional ones, and never collides with the house list", () => {
    const ticked = LAWN_STARTERS.filter((s) => s.on).map((s) => s.name);
    expect(ticked).toEqual([
      "Crabgrass preventer",
      "Spring feed",
      "Grub preventer",
      "Aerate and overseed",
      "Fall feed",
      "Leaf cleanup",
      "Winterizer feed",
    ]);
    const house = new Set(PROPERTY_STARTERS.map((s) => s.name.toLowerCase()));
    expect(LAWN_STARTERS.some((s) => house.has(s.name.toLowerCase()))).toBe(false);
  });
  it("hands the service the day, not a rule of months", () => {
    expect(starterJob(LAWN_STARTERS[2])).toEqual({
      name: "Crabgrass preventer",
      months: null,
      miles: null,
      on: { month: 4, day: 15 },
    });
  });
});
