import { describe, expect, it } from "vitest";

import type { Merchant } from "@/features/spending/lib/merchants";

import { bookingLogo, merchantLogoFor } from "./booking-logo";
import type { Booking } from "./trips";

const hilton: Merchant = { id: "h", name: "Hilton", pattern: "hilton", patterns: ["hilton"], logoUrl: "/m/h.png" };
const frontier: Merchant = { id: "f", name: "Frontier", pattern: "frontier", logoUrl: "/m/f.png" };
const viaBank: Merchant = { id: "b", name: "Citi", pattern: "citi", logoUrl: null, useBank: true };

const stay = { id: "s", kind: "stay", title: "Tru by Hilton Plano Hwy 75", place: null } as unknown as Booking;
const flight = { id: "f", kind: "flight", title: "Frontier flight to Dallas", place: null } as unknown as Booking;
const eva = { id: "e", kind: "flight", title: "EVA Air flight to Da Nang", place: null } as unknown as Booking;

describe("merchantLogoFor", () => {
  it("finds a merchant named anywhere in the lines", () => {
    expect(merchantLogoFor(["Tru by Hilton Plano", null], [hilton])).toBe("/m/h.png");
    expect(merchantLogoFor(["Hotel in Dallas"], [hilton])).toBeNull();
    expect(merchantLogoFor(["Tru by Hilton"], undefined)).toBeNull();
  });
  it("ignores a merchant that uses the bank's logo", () => {
    expect(merchantLogoFor(["Citi Travel"], [viaBank])).toBeNull();
  });
});

describe("bookingLogo", () => {
  it("shows the owner's merchant on a stay", () => {
    expect(bookingLogo(stay, ["Check in"], [hilton], "pk_x")).toEqual({ own: "/m/h.png", airline: null });
  });
  it("lets the owner's merchant win over the airline's logo on a flight", () => {
    const l = bookingLogo(flight, ["Frontier F9 1227"], [frontier], "pk_abcdefghij");
    expect(l.own).toBe("/m/f.png");
    expect(l.airline).toContain("flyfrontier.com");
  });
  it("falls back to the airline on a flight, and to nothing on a stay", () => {
    expect(bookingLogo(eva, ["EVA Air BR 55"], [hilton], "pk_abcdefghij")).toMatchObject({ own: null });
    expect(bookingLogo(eva, ["EVA Air BR 55"], [hilton], "pk_abcdefghij").airline).toContain("evaair.com");
    expect(bookingLogo(eva, ["EVA Air BR 55"], [hilton], null).airline).toBeNull();
    expect(bookingLogo({ ...stay, title: "Hotel in Dallas" } as Booking, [], [hilton], "pk_x")).toEqual({
      own: null,
      airline: null,
    });
  });
});
