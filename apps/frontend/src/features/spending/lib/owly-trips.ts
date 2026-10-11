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
