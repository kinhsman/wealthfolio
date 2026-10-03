import { describe, expect, it } from "vitest";
import { badgeText, timeAgo } from "./inbox";
import { plainTitle } from "./notifications-bell";

describe("the bell", () => {
  const now = Date.parse("2026-10-02T20:00:00Z");
  it("says how long ago, short", () => {
    expect(timeAgo("2026-10-02T19:59:40Z", now)).toBe("now");
    expect(timeAgo("2026-10-02T19:44:00Z", now)).toBe("16m");
    expect(timeAgo("2026-10-02T14:00:00Z", now)).toBe("6h");
    expect(timeAgo("2026-09-29T20:00:00Z", now)).toBe("3d");
    expect(timeAgo("2026-09-21T12:00:00Z", now)).toMatch(/Sep\s?21|21\s?Sep/);
    expect(timeAgo("not a date", now)).toBe("");
  });
  it("counts up to 9, then 9+", () => {
    expect(badgeText(3)).toBe("3");
    expect(badgeText(9)).toBe("9");
    expect(badgeText(12)).toBe("9+");
  });
  it("drops the emoji a title starts with", () => {
    expect(plainTitle("💰 Money in: $6,996.20")).toBe("Money in: $6,996.20");
    expect(plainTitle("🗓️ Your week")).toBe("Your week");
    expect(plainTitle("⚠️ Cash is short")).toBe("Cash is short");
    expect(plainTitle("Test: 🔌 Citi")).toBe("Test: 🔌 Citi");
    expect(plainTitle("No emoji")).toBe("No emoji");
  });
});
