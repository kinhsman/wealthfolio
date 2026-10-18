import { describe, expect, it } from "vitest";

import { airlineOf, airlineLogoUrl } from "./airlines";

describe("airlineOf", () => {
  it("reads the name first", () => {
    expect(airlineOf("EVA Air BR 55", "ORD to TPE")).toBe("BR");
    expect(airlineOf("Frontier F9 1227")).toBe("F9");
    expect(airlineOf("", "EVA Air flight to Da Nang")).toBe("BR");
  });
  it("reads a bare flight number", () => {
    expect(airlineOf("F9 1227")).toBe("F9");
    expect(airlineOf("UA1234")).toBe("UA");
    expect(airlineOf("Seat 12A, DL 45")).toBe("DL");
    expect(airlineOf("6E 204")).toBe("6E");
  });
  it("does not guess from airports, cities or seats", () => {
    expect(airlineOf("ORD to DFW", "Flight to Dallas")).toBeNull();
    expect(airlineOf("Seat 12A", null, undefined)).toBeNull();
    expect(airlineOf("Gate B12")).toBeNull();
  });
  it("builds the logo address from the key that was set", () => {
    expect(airlineLogoUrl("BR", "pk_abc123XYZ_-")).toBe(
      "https://img.logo.dev/evaair.com?token=pk_abc123XYZ_-&size=64&format=png",
    );
    expect(airlineLogoUrl("BR", null)).toBeNull();
    expect(airlineLogoUrl("ZZ", "pk_abc123XYZ_-")).toBeNull();
    expect(airlineOf("ZZ 123")).toBeNull();
  });
});
