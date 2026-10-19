import { describe, expect, it } from "vitest";

import { carrierOf, carriersText, durationText, journeysOf, routeOf } from "./itinerary";

const eva = [
  { title: "ORD to TPE", sub: "EVA Air BR 55", start: "2026-10-29T00:30", end: "2026-10-30T05:25" },
  { title: "TPE to DAD", sub: "EVA Air BR 383", start: "2026-10-30T09:45", end: "2026-10-30T11:40" },
];

describe("routeOf / carrierOf", () => {
  it("reads the airports and the flight number", () => {
    expect(routeOf("ORD to TPE")).toEqual({ from: "ORD", to: "TPE" });
    expect(routeOf("Taipei to Da Nang")).toBeNull();
    expect(carrierOf("EVA Air BR 55")).toEqual({ carrier: "EVA Air", number: "BR55" });
    expect(carrierOf("Frontier F9 1227")).toEqual({ carrier: "Frontier", number: "F9 1227".replace(" ", "") });
    expect(carrierOf("Frontier")).toEqual({ carrier: "Frontier", number: "" });
    // The owner's real Frontier booking names the airline and no code.
    expect(carrierOf("Frontier 3243")).toEqual({ carrier: "Frontier", number: "F93243" });
    expect(carrierOf("United Airlines 1234")).toEqual({ carrier: "United Airlines", number: "UA1234" });
    expect(carrierOf("Some Air 12")).toEqual({ carrier: "Some Air 12", number: "" });
    expect(carrierOf("Gate 12")).toEqual({ carrier: "Gate 12", number: "" });
  });
});

describe("journeysOf", () => {
  it("chains a connection into one journey with its layover and stop", () => {
    const [j] = journeysOf(eva);
    expect(journeysOf(eva)).toHaveLength(1);
    expect(j.rich).toBe(true);
    expect(j.stops).toEqual(["TPE"]);
    expect(j.layovers).toEqual([260]);
    expect(carriersText(j)).toBe("EVA Air");
    // 12:30 AM Chicago (CDT, UTC-5) = 05:30 UTC Oct 29; 11:40 AM Da Nang (UTC+7) = 04:40 UTC Oct 30: 23h 10m.
    expect(j.minutes).toBe(23 * 60 + 10);
    expect(durationText(j.minutes!)).toBe("23h 10m");
    // 12:30 AM Chicago to 5:25 AM Taipei(UTC+8) next day = 21:25 UTC Oct 29: 15h 55m.
    expect(j.legs[0].minutes).toBe(15 * 60 + 55);
    expect(j.legs[1].minutes).toBe(2 * 60 + 55);
  });

  it("keeps a round trip as two journeys", () => {
    const js = journeysOf([
      { title: "ORD to DFW", sub: "Frontier F9 1227", start: "2026-10-30T06:05", end: "2026-10-30T08:40" },
      { title: "DFW to ORD", sub: "Frontier F9 1228", start: "2026-11-01T19:40", end: "2026-11-01T22:25" },
    ]);
    expect(js).toHaveLength(2);
    expect(js.map((j) => j.stops)).toEqual([[], []]);
    expect(js[0].minutes).toBe(155);
  });

  it("is not rich when a leg names no airports", () => {
    const [j] = journeysOf([{ title: "Flight home", sub: "", start: "2026-11-01T19:40", end: null }]);
    expect(j.rich).toBe(false);
    expect(j.minutes).toBeNull();
  });
});

describe("durationText", () => {
  it("writes hours and minutes", () => {
    expect([durationText(55), durationText(240), durationText(260)]).toEqual(["55m", "4h", "4h 20m"]);
  });
});
