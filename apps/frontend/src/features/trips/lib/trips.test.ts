import { describe, expect, it } from "vitest";

import {
  bookedTotals,
  byDay,
  chargeSearchWindow,
  dayRows,
  matchBookings,
  nightsBetween,
  rangeText,
  rowNote,
  timeOf,
  tripSearchWindow,
  tripState,
  visibleRows,
  type Booking,
  type SearchRow,
  type TripCharge,
} from "./trips";

const base: Booking = {
  id: "b",
  eventId: "ev",
  kind: "other",
  title: "Thing",
  sub: "",
  start: null,
  end: null,
  legs: [],
  confirmation: null,
  place: null,
  party: null,
  total: null,
  currency: "USD",
  paid: "unknown",
  freeCancelUntil: null,
  facts: [],
  activityId: null,
  note: "",
  source: null,
  createdAt: "",
  updatedAt: "",
};
const b = (o: Partial<Booking>): Booking => ({ ...base, ...o });

describe("dates", () => {
  it("reads a time only when the stamp has one", () => {
    expect(timeOf("2026-10-30T06:05")).toBe("6:05 AM");
    expect(timeOf("2026-10-30T22:25")).toBe("10:25 PM");
    expect(timeOf("2026-10-30T00:10")).toBe("12:10 AM");
    expect(timeOf("2026-10-30")).toBe("");
    expect(timeOf(null)).toBe("");
  });

  it("counts nights and names the range", () => {
    expect(nightsBetween("2026-10-30", "2026-11-01")).toBe(2);
    expect(rangeText({ startDate: "2026-10-30", endDate: "2026-11-01" }, "2026-10-15")).toBe(
      "Oct 30 to Nov 1",
    );
    expect(rangeText({ startDate: "2026-10-30", endDate: "2026-10-30" }, "2026-10-15")).toBe(
      "Oct 30",
    );
  });

  it("says where a trip stands against today", () => {
    const ev = { startDate: "2026-10-30", endDate: "2026-11-01" };
    expect(tripState(ev, "2026-10-15")).toBe("upcoming");
    expect(tripState(ev, "2026-10-31")).toBe("active");
    expect(tripState(ev, "2026-11-01")).toBe("active");
    expect(tripState(ev, "2026-11-02")).toBe("past");
  });

  it("gives the search windows", () => {
    expect(tripSearchWindow({ startDate: "2026-10-30", endDate: "2026-11-01" })).toEqual({
      from: "2026-07-02",
      to: "2026-11-15",
    });
    expect(chargeSearchWindow("2026-09-19")).toEqual({ from: "2026-09-09", to: "2026-09-22" });
  });
});

describe("dayRows", () => {
  const stay = b({ id: "s", kind: "stay", title: "Hotel", start: "2026-10-30", end: "2026-11-01" });
  const fly = b({
    id: "f",
    kind: "flight",
    title: "Frontier",
    start: "2026-10-30T06:05",
    end: "2026-11-01T22:25",
    legs: [
      { title: "ORD to DFW", sub: "F9 1227", start: "2026-10-30T06:05", end: "2026-10-30T08:40" },
      { title: "DFW to ORD", sub: "F9 1228", start: "2026-11-01T19:40", end: "2026-11-01T22:25" },
    ],
  });
  const dinner = b({ id: "d", kind: "food", title: "Dinner", start: "2026-10-31T19:30" });
  const undated = b({ id: "u", title: "Parking" });

  it("turns a stay into a check in and a check out, a flight into its legs, and skips the undated", () => {
    const rows = dayRows([stay, fly, dinner, undated]);
    expect(rows.map((r) => `${r.day} ${r.label} ${r.sub}`)).toEqual([
      "2026-10-30 ORD to DFW F9 1227",
      "2026-10-30 Hotel Check in",
      "2026-10-31 Dinner ",
      "2026-11-01 DFW to ORD F9 1228",
      "2026-11-01 Hotel Check out",
    ]);
  });

  it("puts a timed row before an untimed one on the same day, and groups by day", () => {
    const groups = byDay(dayRows([stay, fly]));
    expect(groups.map((g) => g.day)).toEqual(["2026-10-30", "2026-11-01"]);
    expect(groups[0].rows[0].booking.id).toBe("f");
    expect(groups[0].rows[0].lead).toBe(true);
    expect(groups[1].rows[0].lead).toBe(false);
  });
});

describe("money", () => {
  it("adds up what is booked and what is paid, leaving another currency out", () => {
    const t = bookedTotals([
      b({ total: 115.98, paid: "now" }),
      b({ total: 121.86, paid: "now" }),
      b({ total: 88.4, paid: "later" }),
      b({ total: 50, currency: "EUR" }),
      b({ total: null }),
    ]);
    expect(t).toEqual({ total: 326.24, other: 1, paid: 237.84, later: 88.4, count: 5 });
  });
});

describe("matchBookings", () => {
  const charge = (id: string, amount: number): TripCharge => ({
    id,
    label: id,
    date: "2026-09-19",
    amount,
    currency: "USD",
  });

  it("keeps a charge the owner tied, and pairs a unique same amount", () => {
    const m = matchBookings(
      [
        b({ id: "1", total: 115.98, paid: "now" }),
        b({ id: "2", total: 121.86, paid: "now", activityId: "c9" }),
      ],
      [charge("c1", 115.98), charge("c9", 99)],
    );
    expect(m.byBooking.get("1")?.id).toBe("c1");
    expect(m.byBooking.get("2")?.id).toBe("c9");
    expect(m.loose).toEqual([]);
  });

  it("pairs nothing when two charges or two bookings share an amount", () => {
    const two = matchBookings(
      [b({ id: "1", total: 50, paid: "now" })],
      [charge("a", 50), charge("b", 50)],
    );
    expect(two.byBooking.size).toBe(0);
    const rival = matchBookings(
      [b({ id: "1", total: 50, paid: "now" }), b({ id: "2", total: 50, paid: "now" })],
      [charge("a", 50)],
    );
    expect(rival.byBooking.size).toBe(0);
    expect(rival.loose.length).toBe(1);
  });

  it("does not pair a pay-later booking or one in another currency", () => {
    const m = matchBookings(
      [
        b({ id: "1", total: 50, paid: "later" }),
        b({ id: "2", total: 50, paid: "now", currency: "EUR" }),
      ],
      [charge("a", 50)],
    );
    expect(m.byBooking.size).toBe(0);
  });
});

describe("search rows", () => {
  const row = (o: Partial<SearchRow>): SearchRow => ({
    key: "k",
    mailboxId: "m",
    mailbox: "me@gmail.com",
    msgId: "1",
    from: "Frontier",
    subject: "Trip",
    date: "2026-09-12",
    kind: "flight",
    code: null,
    amountMatch: false,
    noise: false,
    link: null,
    onTrip: null,
    ...o,
  });

  it("hides alerts unless asked, and filters by type", () => {
    const rows = [
      row({ key: "a" }),
      row({ key: "b", kind: "stay" }),
      row({ key: "c", noise: true }),
    ];
    expect(visibleRows(rows, "all", false).map((r) => r.key)).toEqual(["a", "b"]);
    expect(visibleRows(rows, "all", true).map((r) => r.key)).toEqual(["a", "b", "c"]);
    expect(visibleRows(rows, "stay", false).map((r) => r.key)).toEqual(["b"]);
  });

  it("notes the most useful thing first", () => {
    expect(rowNote(row({ onTrip: { bookingId: "x", eventId: "e" }, amountMatch: true })).text).toBe(
      "On a trip",
    );
    expect(rowNote(row({ noise: true })).text).toBe("Not a booking");
    expect(rowNote(row({ amountMatch: true, code: "HX7QPL" })).text).toBe("Same amount");
    expect(rowNote(row({ code: "HX7QPL" })).text).toBe("HX7QPL");
    expect(rowNote(row({})).text).toBe("Flight");
  });
});
