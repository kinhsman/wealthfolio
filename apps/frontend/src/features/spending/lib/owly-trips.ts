// money-hub patch: events linked to Owly trips. The money-hub service reads Owly's trips
// (read only) and keeps which event points at which trip, at /api/money-hub/owly/trips and
// /trip-link (server/drive-backup/lib/owly.js). Owly stays the boss of the split; the bank
// entries tagged to the event stay the boss of what the owner spent.

export interface OwlyTripTransfer {
  from: string;
  to: string;
  amount: number;
  youOwe: boolean;
  owedToYou: boolean;
}

export interface OwlyBill {
  id: number;
  description: string;
  billedOn: string;
  total: number;
  currency: string;
  paidBy: string;
  paidByYou: boolean;
}

export interface OwlyTrip {
  id: number;
  name: string;
  emoji: string | null;
  startsOn: string | null;
  endsOn: string | null;
  status: "active" | "settled";
  currency: string;
  mixedCurrency: boolean;
  members: { id: number; name: string; isOwner: boolean }[];
  billCount: number;
  totalSpent: number;
  you: { paid: number; share: number };
  owedToYou: number;
  youOwe: number;
  transfers: OwlyTripTransfer[];
  /** Absent from an Owly that predates the bills list. */
  bills?: OwlyBill[];
}

export interface OwlyTripsAnswer {
  connected: boolean;
  baseUrl?: string;
  trips: OwlyTrip[];
  /** event id -> Owly trip id */
  links: Record<string, number>;
}

/** The trip an event is linked to, if Owly still has it. */
export function tripOfEvent(data: OwlyTripsAnswer | undefined, eventId: string): OwlyTrip | null {
  const id = data?.links?.[eventId];
  if (id === undefined || id === null) return null;
  return data?.trips.find((t) => t.id === id) ?? null;
}

/** The event a trip is linked to, if any (one trip belongs to one event). */
export function eventOfTrip(data: OwlyTripsAnswer | undefined, tripId: number): string | null {
  const hit = Object.entries(data?.links ?? {}).find(([, id]) => id === tripId);
  return hit ? hit[0] : null;
}

export interface TripFact {
  label: string;
  amount: number;
  /** good = money coming to the owner, warn = the owner owes */
  tone?: "good" | "warn";
}

export interface TripSummary {
  /** Said instead of the numbers when there is nothing to add up yet. */
  note: string | null;
  facts: TripFact[];
}

/**
 * What the strip says, in order: the group's total, the owner's own share, then who owes whom
 * (names as Owly has them), or that all is square. `spentOnCard` (the bank entries tagged to
 * the event) adds the cost to the owner once friends pay back.
 */
export function tripSummary(trip: OwlyTrip, spentOnCard = 0): TripSummary {
  if (trip.billCount === 0) return { note: "No bills in Owly yet", facts: [] };
  const facts: TripFact[] = [
    { label: "Group spent", amount: trip.totalSpent },
    { label: "Your share", amount: trip.you.share },
  ];
  for (const t of trip.transfers) {
    if (t.owedToYou) facts.push({ label: `${t.from} owes you`, amount: t.amount, tone: "good" });
    else if (t.youOwe) facts.push({ label: `You owe ${t.to}`, amount: t.amount, tone: "warn" });
  }
  const square = trip.transfers.every((t) => !t.owedToYou && !t.youOwe);
  if (spentOnCard > 0 && trip.owedToYou > 0 && !trip.mixedCurrency) {
    facts.push({ label: "Cost to you after they pay back", amount: Math.max(0, cents(spentOnCard - trip.owedToYou)) });
  }
  return { note: square ? (trip.status === "settled" ? "Settled up" : "All square so far") : null, facts };
}

/** Money to the cent, so 715.43 - 357.71 is 357.72 and not 357.71999999999997. */
const cents = (n: number) => Math.round(n * 100) / 100;

/** Owly's own page for a trip. */
export function owlyTripUrl(baseUrl: string | undefined, tripId: number): string {
  return `${(baseUrl || "https://owly.sanglam.cc").replace(/\/$/, "")}/trips/${tripId}`;
}

// ---- Step 2: suggest a trip for an event, and match card charges to Owly bills ----

const STOP_WORDS = new Set(["trip", "the", "and", "for", "with", "vacation", "holiday", "weekend", "tour"]);

/** Lower-case words of a name without accents, years, short words and filler like "trip". */
function nameWords(name: string): Set<string> {
  const words = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !STOP_WORDS.has(w));
  return new Set(words);
}

const DAY = 24 * 3600 * 1000;
const dayNumber = (iso: string) => Math.floor(new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime() / DAY);

export interface TripSuggestion {
  trip: OwlyTrip;
  reason: "same name" | "same dates";
}

/**
 * Trips that look like the event: they share a word with its name, or Owly dates the trip within
 * a week of the event's dates. A trip already on another event is never suggested. Best first.
 */
export function suggestTrips(
  data: OwlyTripsAnswer | undefined,
  event: { id?: string | null; name: string; startDate: string; endDate: string },
  limit = 2,
): TripSuggestion[] {
  if (!data?.trips?.length) return [];
  const eventWords = nameWords(event.name);
  const hasDates = !!event.startDate && !!event.endDate;
  const out: (TripSuggestion & { score: number })[] = [];
  for (const trip of data.trips) {
    const taken = eventOfTrip(data, trip.id);
    if (taken !== null && taken !== event.id) continue;
    if (taken === event.id) continue; // already linked to this event
    const shared = [...nameWords(trip.name)].filter((w) => eventWords.has(w)).length;
    const datesMatch =
      hasDates &&
      !!trip.startsOn &&
      !!trip.endsOn &&
      dayNumber(trip.startsOn) <= dayNumber(event.endDate) + 7 &&
      dayNumber(trip.endsOn) >= dayNumber(event.startDate) - 7;
    if (shared > 0) out.push({ trip, reason: "same name", score: 10 + shared });
    else if (datesMatch) out.push({ trip, reason: "same dates", score: 1 });
  }
  return out
    .sort((a, b) => b.score - a.score || b.trip.id - a.trip.id)
    .slice(0, limit)
    .map(({ trip, reason }) => ({ trip, reason }));
}

export interface Charge {
  id: string;
  label: string;
  date: string;
  amount: number;
  currency: string;
}

export interface BillMatch {
  bill: OwlyBill;
  charge: Charge;
}

export interface ChargeMatching {
  matched: BillMatch[];
  /** Bills you paid in Owly with no card charge of the same amount on the event. */
  billsOnly: OwlyBill[];
  /** Charges tagged to the event with no Owly bill of the same amount. */
  chargesOnly: Charge[];
}

/**
 * Pairs the bills you paid in Owly with the card charges tagged to the event: same currency and
 * the same amount to the cent, one to one, the nearest dates first. Bills someone else paid
 * never touch your card, and charges in another currency than the trip's are left out.
 */
export function matchCharges(trip: OwlyTrip, charges: Charge[]): ChargeMatching {
  const bills = (trip.bills ?? []).filter((b) => b.paidByYou);
  const pool = charges.filter((c) => c.currency === trip.currency && c.amount > 0);
  const free = new Set(pool.map((c) => c.id));
  const matched: BillMatch[] = [];
  const billsOnly: OwlyBill[] = [];
  for (const bill of bills) {
    const hits = pool
      .filter((c) => free.has(c.id) && Math.abs(cents(c.amount) - cents(bill.total)) < 0.005)
      .sort(
        (a, b) =>
          Math.abs(dayNumber(a.date) - dayNumber(bill.billedOn)) -
          Math.abs(dayNumber(b.date) - dayNumber(bill.billedOn)),
      );
    if (hits.length === 0) {
      billsOnly.push(bill);
      continue;
    }
    free.delete(hits[0].id);
    matched.push({ bill, charge: hits[0] });
  }
  return { matched, billsOnly, chargesOnly: pool.filter((c) => free.has(c.id)) };
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The dates to read cash activities over: the event and the trip's bills, with room before and after. */
export function chargesWindow(
  event: { startDate: string; endDate: string },
  trip: OwlyTrip | null,
): { startDate: string; endDate: string } | undefined {
  const days = [event.startDate, event.endDate, ...(trip?.bills ?? []).map((b) => b.billedOn)]
    .filter(Boolean)
    .map((d) => dayNumber(d));
  if (days.length === 0) return undefined;
  return {
    startDate: `${isoDay((Math.min(...days) - 21) * DAY)}T00:00:00.000Z`,
    endDate: `${isoDay((Math.max(...days) + 45) * DAY)}T23:59:59.999Z`,
  };
}

export const eventChargesKey = (eventId: string | undefined, window: unknown) =>
  ["spending_transactions", "owly-event-charges", eventId, window] as const;

// ---- Step 3: copy the event's dates onto the Owly trip ----

export type TripDatesState = "same" | "none" | "differs";

/** How the trip's own dates in Owly compare with the event's (plain YYYY-MM-DD, end included). */
export function tripDatesState(trip: OwlyTrip, startDate: string, endDate: string): TripDatesState {
  if (!trip.startsOn || !trip.endsOn) return "none";
  return trip.startsOn.slice(0, 10) === startDate.slice(0, 10) && trip.endsOn.slice(0, 10) === endDate.slice(0, 10)
    ? "same"
    : "differs";
}
