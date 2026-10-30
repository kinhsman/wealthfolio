import { describe, expect, it } from "vitest";

import { clockOf } from "./change-text";
import { changeForRow, changeShort, spanText, type Booking, type FlightChange } from "./trips";

const change = (patch: Partial<FlightChange> = {}): FlightChange => ({
  id: "m1:c1", at: "", emailDate: "2026-10-30T20:44:00.000Z", kind: "delay", leg: "ORD to DFW", sub: "Frontier 3243",
  was: "2026-10-30T20:13", now: "2026-10-30T20:42", minutes: 29, applied: true, summary: "", from: "Frontier Airlines", link: null, ...patch,
});
const booking = (changes: FlightChange[]) => ({ changes }) as unknown as Booking;
const before = Date.parse("2026-10-30T12:00:00");

describe("flight changes", () => {
  it("says it in a few words", () => {
    expect(changeShort(change())).toBe("Delayed 29 min");
    expect(changeShort(change({ minutes: 65 }))).toBe("Delayed 1 h 5 min");
    expect(changeShort(change({ minutes: -20, now: "2026-10-30T19:53" }))).toBe("Leaves 20 min earlier");
    expect(changeShort(change({ kind: "cancelled", applied: false, minutes: null, now: null }))).toBe("Cancelled");
    expect(changeShort(change({ kind: "gate", applied: false }))).toBe("Gate change");
    expect(spanText(120)).toBe("2 hours");
    expect(clockOf("2026-10-30T20:42")).toBe("8:42 PM");
    expect(clockOf("2026-10-30T00:05")).toBe("12:05 AM");
  });

  it("belongs to the row whose flight it moved, while it still matters", () => {
    const b = booking([change()]);
    expect(changeForRow(b, ["2026-10-30T20:42"], before)?.id).toBe("m1:c1");
    expect(changeForRow(b, ["2026-11-01T16:35"], before)).toBeNull();                       // the other journey
    expect(changeForRow(b, ["2026-10-30T20:42"], Date.parse("2026-10-31T12:00:00"))).toBeNull(); // long gone
    expect(changeForRow(booking([]), ["2026-10-30T20:42"], before)).toBeNull();
    const cancelled = change({ kind: "cancelled", applied: false, now: null, was: "2026-10-30T20:13" });
    expect(changeForRow(booking([cancelled]), ["2026-10-30T20:13"], before)?.kind).toBe("cancelled");
    const two = booking([change({ id: "a" }), change({ id: "b", now: "2026-10-30T21:00", minutes: 47 })]);
    expect(changeForRow(two, ["2026-10-30T21:00"], before)?.id).toBe("b");
  });
});
