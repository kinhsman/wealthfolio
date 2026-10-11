import { describe, expect, it } from "vitest";

import {
  eventOfTrip,
  owlyTripUrl,
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
