import { describe, expect, it } from "vitest";

import { agoText, fitter, greatCircle, lateText, trackFor, watchNow, type TrackAnswer } from "./flight-track";
import type { Booking } from "./trips";

const eva = {
  id: "b1",
  kind: "flight",
  legs: [
    { title: "ORD to TPE", sub: "EVA Air BR 55", start: "2026-12-05T23:30", end: "2026-12-07T05:25" },
    { title: "TPE to DAD", sub: "EVA Air BR 383", start: "2026-12-07T09:45", end: "2026-12-07T11:40" },
  ],
} as unknown as Booking;

describe("flight tracking", () => {
  it("asks only near a flight, in the airport's own time", () => {
    const dep = Date.UTC(2026, 11, 6, 5, 30); // 11:30 PM Chicago
    expect(watchNow(eva, Date.UTC(2026, 9, 19))).toBe(false);
    expect(watchNow(eva, dep - 60 * 60_000)).toBe(true);
    expect(watchNow(eva, dep - 3 * 3_600_000)).toBe(false);
    expect(watchNow(eva, Date.UTC(2026, 11, 7, 4, 0))).toBe(true); // second leg, in the air
    expect(watchNow({ ...eva, kind: "stay" } as Booking, dep)).toBe(false);
  });

  it("finds a journey leg's track by airport and printed time", () => {
    const answer = { setUp: true, creditsLeft: 1, legs: [{ from: "TPE", start: "2026-12-07T09:45", index: 1 }] } as unknown as TrackAnswer;
    expect(trackFor(answer, { from: "TPE", dep: "2026-12-07T09:45" })?.index).toBe(1);
    expect(trackFor(answer, { from: "ORD", dep: "2026-12-05T23:30" })).toBeNull();
    expect(trackFor(undefined, { from: "TPE", dep: "2026-12-07T09:45" })).toBeNull();
  });

  it("says early or late against the booked landing", () => {
    const arr = Date.UTC(2026, 11, 6, 21, 25);
    expect(lateText(arr + 3 * 60_000, arr)).toBe("on time");
    expect(lateText(arr - 12 * 60_000, arr)).toBe("12 min early");
    expect(lateText(arr + 65 * 60_000, arr)).toBe("1h 5m late");
    expect(lateText(arr, null)).toBeNull();
    expect(agoText(Date.now() - 130 * 60_000)).toBe("2h 10m ago");
  });

  it("draws a Pacific crossing without wrapping round the world", () => {
    const ord: [number, number] = [41.978, -87.905];
    const tpe: [number, number] = [25.08, 121.233];
    const pts = greatCircle(ord, tpe);
    expect(pts[0][0]).toBeCloseTo(41.978, 3);
    expect(pts.at(-1)![1]).toBeCloseTo(121.233, 3);
    expect(Math.max(...pts.map((p) => p[0]))).toBeGreaterThan(60); // goes up over Alaska
    const fit = fitter(pts, 300, 64, 12);
    const xs = pts.map((p) => fit(p)[0]);
    for (const x of xs) expect(x).toBeGreaterThanOrEqual(11.9), expect(x).toBeLessThanOrEqual(288.1);
    // Monotone east-west: no jump across the date line.
    const steps = xs.slice(1).map((x, i) => Math.abs(x - xs[i]));
    expect(Math.max(...steps)).toBeLessThan(40);
  });
});
