import { describe, expect, it } from "vitest";

import {
  eventOfTrip,
  matchCharges,
  owlyTripUrl,
  suggestTrips,
  type Charge,
  tripOfEvent,
  tripSummary,
  type OwlyTrip,
  type OwlyTripsAnswer,
} from "./owly-trips";

const trip = (over: Partial<OwlyTrip> = {}): OwlyTrip => ({
  id: 6,
  name: "Dallas - Worlds 2026",
  emoji: null,
  startsOn: null,
  endsOn: null,
  status: "active",
  currency: "USD",
  mixedCurrency: false,
  members: [
    { id: 1, name: "Sang", isOwner: true },
    { id: 2, name: "Thanh", isOwner: false },
  ],
  billCount: 3,
  bills: [
    { id: 83, description: "Hotel", billedOn: "2026-09-19", total: 160.2, currency: "USD", paidBy: "Sang", paidByYou: true },
    { id: 84, description: "Flight", billedOn: "2026-09-19", total: 220.97, currency: "USD", paidBy: "Sang", paidByYou: true },
    { id: 85, description: "Tickets", billedOn: "2026-09-19", total: 334.26, currency: "USD", paidBy: "Sang", paidByYou: true },
  ],
  totalSpent: 715.43,
  you: { paid: 715.43, share: 357.72 },
  owedToYou: 357.71,
  youOwe: 0,
  transfers: [{ from: "Thanh", to: "Sang", amount: 357.71, youOwe: false, owedToYou: true }],
  ...over,
});

const answer: OwlyTripsAnswer = { connected: true, trips: [trip(), trip({ id: 2, name: "Kash bach" })], links: { "ev-dallas": 6 } };

describe("event and trip links", () => {
  it("finds the trip of an event, and the event of a trip", () => {
    expect(tripOfEvent(answer, "ev-dallas")?.name).toBe("Dallas - Worlds 2026");
    expect(eventOfTrip(answer, 6)).toBe("ev-dallas");
  });
  it("says nothing for an event or trip with no link, or when Owly lost the trip", () => {
    expect(tripOfEvent(answer, "ev-other")).toBeNull();
    expect(eventOfTrip(answer, 2)).toBeNull();
    expect(tripOfEvent({ ...answer, links: { "ev-dallas": 99 } }, "ev-dallas")).toBeNull();
    expect(tripOfEvent(undefined, "ev-dallas")).toBeNull();
  });
});

describe("tripSummary", () => {
  it("lists the group total, the owner's share and who owes the owner", () => {
    const s = tripSummary(trip());
    expect(s.note).toBeNull();
    expect(s.facts.map((f) => [f.label, f.amount, f.tone])).toEqual([
      ["Group spent", 715.43, undefined],
      ["Your share", 357.72, undefined],
      ["Thanh owes you", 357.71, "good"],
    ]);
  });
  it("adds the cost after friends pay back only when the card total and a debt are both known", () => {
    expect(tripSummary(trip(), 715.43).facts.at(-1)).toEqual({
      label: "Cost to you after they pay back",
      amount: 357.72,
    });
    expect(tripSummary(trip(), 0).facts.some((f) => f.label.startsWith("Cost to you"))).toBe(false);
    expect(tripSummary(trip({ owedToYou: 0, transfers: [] }), 500).facts.some((f) => f.label.startsWith("Cost to you"))).toBe(false);
    expect(tripSummary(trip({ mixedCurrency: true }), 500).facts.some((f) => f.label.startsWith("Cost to you"))).toBe(false);
  });
  it("shows what the owner owes in a warning tone", () => {
    const s = tripSummary(
      trip({
        owedToYou: 0,
        youOwe: 40,
        transfers: [{ from: "Sang", to: "Thanh", amount: 40, youOwe: true, owedToYou: false }],
      }),
    );
    expect(s.facts.at(-1)).toEqual({ label: "You owe Thanh", amount: 40, tone: "warn" });
  });
  it("says settled or all square when nothing is owed, and no bills when there are none", () => {
    expect(tripSummary(trip({ status: "settled", transfers: [], owedToYou: 0 })).note).toBe("Settled up");
    expect(tripSummary(trip({ transfers: [], owedToYou: 0 })).note).toBe("All square so far");
    expect(tripSummary(trip({ billCount: 0 }))).toEqual({ note: "No bills in Owly yet", facts: [] });
  });
});

describe("owlyTripUrl", () => {
  it("opens the trip on Owly's own page", () => {
    expect(owlyTripUrl("https://owly.sanglam.cc/", 6)).toBe("https://owly.sanglam.cc/trips/6");
    expect(owlyTripUrl(undefined, 6)).toBe("https://owly.sanglam.cc/trips/6");
  });
});

describe("suggestTrips", () => {
  const ev = { id: "ev-new", name: "Dallas trip", startDate: "2026-10-30", endDate: "2026-11-01" };
  const data: OwlyTripsAnswer = {
    connected: true,
    links: {},
    trips: [
      trip(),
      trip({ id: 2, name: "Kash bach", startsOn: "2026-07-26", endsOn: "2026-07-28" }),
      trip({ id: 3, name: "Đà Lạt", startsOn: "2024-03-01", endsOn: "2024-03-05" }),
    ],
  };
  it("suggests the trip that shares a word with the event name, ignoring filler like trip", () => {
    expect(suggestTrips(data, ev).map((s) => [s.trip.id, s.reason])).toEqual([[6, "same name"]]);
    expect(suggestTrips(data, { ...ev, name: "Trip" })).toEqual([]);
  });
  it("matches Vietnamese names without accents and ignores years", () => {
    expect(suggestTrips(data, { ...ev, name: "Da Lat 2026" }).map((s) => s.trip.id)).toEqual([3]);
  });
  it("suggests by dates when Owly dates the trip within a week of the event", () => {
    const hit = suggestTrips(data, { ...ev, name: "Weekend away", startDate: "2026-07-28", endDate: "2026-07-30" });
    expect(hit.map((s) => [s.trip.id, s.reason])).toEqual([[2, "same dates"]]);
  });
  it("never suggests a trip on another event, nor the one already on this event", () => {
    expect(suggestTrips({ ...data, links: { other: 6 } }, ev)).toEqual([]);
    expect(suggestTrips({ ...data, links: { "ev-new": 6 } }, { ...ev, id: "ev-new" })).toEqual([]);
  });
});

describe("matchCharges", () => {
  const charge = (id: string, amount: number, date = "2026-09-19", currency = "USD"): Charge => ({
    id,
    label: id,
    date,
    amount,
    currency,
  });
  it("pairs bills with charges of the same amount and lists what is left on each side", () => {
    const m = matchCharges(trip(), [charge("flight", 220.97), charge("tickets", 334.26), charge("hotel", 121.86), charge("uber", 23.1)]);
    expect(m.matched.map((x) => [x.bill.description, x.charge.id])).toEqual([
      ["Flight", "flight"],
      ["Tickets", "tickets"],
    ]);
    expect(m.billsOnly.map((b) => b.description)).toEqual(["Hotel"]);
    expect(m.chargesOnly.map((c) => c.id)).toEqual(["hotel", "uber"]);
  });
  it("uses a charge once, nearest date first, and ignores bills paid by someone else", () => {
    const t = trip({
      bills: [
        { id: 1, description: "A", billedOn: "2026-09-19", total: 50, currency: "USD", paidBy: "Sang", paidByYou: true },
        { id: 2, description: "B", billedOn: "2026-10-30", total: 50, currency: "USD", paidBy: "Sang", paidByYou: true },
        { id: 3, description: "C", billedOn: "2026-10-30", total: 50, currency: "USD", paidBy: "Thanh", paidByYou: false },
      ],
    });
    const m = matchCharges(t, [charge("far", 50, "2026-09-01"), charge("near", 50, "2026-10-30")]);
    expect(m.matched.map((x) => [x.bill.id, x.charge.id])).toEqual([
      [1, "far"],
      [2, "near"],
    ]);
    expect(m.billsOnly).toEqual([]);
  });
  it("leaves out charges in another currency and trips with no bills list", () => {
    expect(matchCharges(trip(), [charge("eur", 220.97, "2026-09-19", "EUR")]).chargesOnly).toEqual([]);
    expect(matchCharges(trip({ bills: undefined }), [charge("x", 5)])).toEqual({ matched: [], billsOnly: [], chargesOnly: [charge("x", 5)] });
  });
});
