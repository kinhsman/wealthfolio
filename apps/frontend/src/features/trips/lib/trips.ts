// money-hub patch: Trips (owner, 2026-10-15). A trip is a Travel event; its bookings (flights, stays, dinners,
// tours, cars) live in the money-hub service (server/drive-backup/lib/trips.js) and can be found in the linked
// Gmail. This file is the page's whole contact with that service, plus the small pure helpers that turn the
// bookings into day by day rows and line them up with the bank charges tagged to the event. Nothing here ever
// changes a charge or writes to Owly.
import { useQuery } from "@tanstack/react-query";

import { listCashActivities } from "@/features/spending/adapters/cash-activities";
import { getVisibleSpendingAmount } from "@/features/spending/lib/constants";
import type { SpendingEvent } from "@/features/spending/types/event";

import { carriersText, journeysOf, type Journey } from "./itinerary";

export type Kind = "flight" | "stay" | "food" | "tour" | "car" | "other";
export type Paid = "now" | "later" | "unknown";

export const KIND_LABEL: Record<Kind, string> = {
  flight: "Flight",
  stay: "Stay",
  food: "Food",
  tour: "Tour",
  car: "Car",
  other: "Other",
};

export interface Fact {
  k: string;
  v: string;
}

export interface Leg {
  title: string;
  sub: string;
  start: string | null;
  end: string | null;
}

export interface Source {
  mailboxId: string;
  mailbox: string;
  msgId: string;
  from: string;
  subject: string;
  date: string;
  link: string | null;
}

export interface Booking {
  id: string;
  eventId: string;
  kind: Kind;
  title: string;
  sub: string;
  /** "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM". */
  start: string | null;
  end: string | null;
  legs: Leg[];
  confirmation: string | null;
  place: string | null;
  party: number | null;
  total: number | null;
  currency: string;
  paid: Paid;
  /** A flight only: hours before it leaves that its check-in reminder comes; null = the setting on Settings, Alerts. */
  checkinHours: number | null;
  freeCancelUntil: string | null;
  facts: Fact[];
  activityId: string | null;
  note: string;
  source: Source | null;
  createdAt: string;
  updatedAt: string;
}

/** What a booking form sends; a field left out keeps its value. */
export type BookingInput = Partial<
  Omit<Booking, "id" | "source" | "createdAt" | "updatedAt" | "eventId">
> & { eventId?: string; source?: { mailboxId: string; msgId: string } | null };

/** Hours before takeoff a flight's own check-in reminder can be set to (airlines differ). */
export const CHECKIN_CHOICES = [12, 24, 36, 48, 72, 96];

export interface TripsStatus {
  mailboxes: { id: string; email: string }[];
  ai: boolean;
}

export interface SearchRow {
  key: string;
  mailboxId: string;
  mailbox: string;
  msgId: string;
  from: string;
  subject: string;
  date: string;
  kind: Kind;
  code: string | null;
  amountMatch: boolean;
  noise: boolean;
  /** The email in Gmail, to open it before picking it. */
  link: string | null;
  onTrip: { bookingId: string; eventId: string } | null;
}

export interface SearchAnswer {
  query: string;
  rows: SearchRow[];
  hidden: number;
  errors: string[];
  truncated: boolean;
}

export interface SearchInput {
  q?: string;
  from?: string | null;
  to?: string | null;
  amount?: number | null;
}

export interface EmailRead {
  booking: boolean;
  why?: string;
  kind?: Kind;
  title?: string;
  sub?: string;
  start?: string | null;
  end?: string | null;
  legs?: Leg[];
  confirmation?: string | null;
  place?: string | null;
  party?: number | null;
  total?: number | null;
  currency?: string;
  paid?: Paid;
  freeCancelUntil?: string | null;
  facts?: Fact[];
  lines?: string[];
}

export interface EmailPeek {
  key: string;
  email: {
    from: string;
    subject: string;
    date: string;
    link: string | null;
    mailbox: string;
    body: string;
  };
}

export interface ReadAnswer {
  key: string;
  email: { from: string; subject: string; date: string; link: string | null; mailbox: string };
  read: EmailRead;
}

const BASE = "/api/money-hub/trips";

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `The money app helper said ${res.status}`);
  return data as T;
}

const seg = (s: string) => encodeURIComponent(s);

export const tripsApi = {
  status: () => call<TripsStatus>("GET", "/status"),
  list: () => call<{ bookings: Booking[] }>("GET", "/bookings"),
  add: (eventId: string, input: BookingInput) =>
    call<Booking>("POST", "/bookings", { ...input, eventId }),
  update: (id: string, input: BookingInput) => call<Booking>("PUT", `/bookings/${seg(id)}`, input),
  remove: (id: string) => call<{ removed: string }>("DELETE", `/bookings/${seg(id)}`),
  search: (input: SearchInput) => call<SearchAnswer>("POST", "/search", input),
  peek: (mailboxId: string, msgId: string) =>
    call<EmailPeek>("POST", "/peek", { mailboxId, msgId }),
  read: (mailboxId: string, msgId: string, again = false) =>
    call<ReadAnswer>("POST", "/read", { mailboxId, msgId, again }),
};

export const BOOKINGS_KEY = ["money-hub", "trips", "bookings"] as const;
export const STATUS_KEY = ["money-hub", "trips", "status"] as const;

export function useBookings() {
  return useQuery({
    queryKey: BOOKINGS_KEY,
    queryFn: async () => (await tripsApi.list()).bookings,
    staleTime: 60_000,
  });
}

export function useTripsStatus() {
  return useQuery({ queryKey: STATUS_KEY, queryFn: tripsApi.status, staleTime: 5 * 60_000 });
}

// ------------------------------------------------------------------ dates --

const DAY_MS = 24 * 3600 * 1000;
export const dayOf = (stamp: string) => stamp.slice(0, 10);
export const dayNumber = (iso: string) =>
  Math.floor(new Date(`${dayOf(iso)}T00:00:00Z`).getTime() / DAY_MS);
const isoDay = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => isoDay(dayNumber(iso) + n);

/** "Oct 30", with the year when it is not today's year. */
export function shortDay(iso: string, today?: string): string {
  const withYear = today ? iso.slice(0, 4) !== today.slice(0, 4) : false;
  return new Date(`${dayOf(iso)}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** "Fri, Oct 30". */
export function weekdayDay(iso: string): string {
  return new Date(`${dayOf(iso)}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "6:05 AM" from a stamp that has a time, else "". */
export function timeOf(stamp: string | null | undefined): string {
  const m = /T(\d{2}):(\d{2})$/.exec(stamp ?? "");
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

export const nightsBetween = (start: string, end: string) => dayNumber(end) - dayNumber(start);

export type TripState = "past" | "active" | "upcoming";

export function tripState(
  event: Pick<SpendingEvent, "startDate" | "endDate">,
  today: string,
): TripState {
  if (dayOf(event.endDate) < today) return "past";
  if (dayOf(event.startDate) > today) return "upcoming";
  return "active";
}

/** Days until the trip starts (negative once it has), or until it ends while it is on. */
export const daysTo = (iso: string, today: string) => dayNumber(iso) - dayNumber(today);

/** The trip's range, "Oct 30 to Nov 1". */
export function rangeText(
  event: Pick<SpendingEvent, "startDate" | "endDate">,
  today?: string,
): string {
  const a = dayOf(event.startDate);
  const b = dayOf(event.endDate);
  return a === b ? shortDay(a, today) : `${shortDay(a, today)} to ${shortDay(b, today)}`;
}

// ----------------------------------------------------------------- travel --

/** The Travel event type's id, found by its key or its name. */
export function isTravelType(type: { key?: string | null; name: string }): boolean {
  return type.key === "travel" || type.name.trim().toLowerCase() === "travel";
}

// -------------------------------------------------------------- day rows --

export interface DayRow {
  key: string;
  day: string;
  /** "6:05 AM", or "" when the booking has no time. */
  time: string;
  label: string;
  sub: string;
  kind: Kind;
  booking: Booking;
  /** The row that carries the booking's own details (the first one it makes). */
  lead: boolean;
  /** A flight row that is a whole journey (its connections inside), drawn as an itinerary. */
  journey?: { value: Journey; index: number; count: number };
}

/**
 * The bookings as the days they happen on. A stay is a check in and a check out, a flight with legs is one row per
 * journey (legs that connect are one), anything else is one row. A booking with no date is left out here (the page lists it apart).
 */
export function dayRows(bookings: Booking[]): DayRow[] {
  const rows: DayRow[] = [];
  for (const b of bookings) {
    if (!b.start) continue;
    const make = (k: string, stamp: string, label: string, sub: string, lead: boolean) =>
      rows.push({
        key: `${b.id}:${k}`,
        day: dayOf(stamp),
        time: timeOf(stamp),
        label,
        sub,
        kind: b.kind,
        booking: b,
        lead,
      });
    if (b.kind === "stay" && b.end) {
      make("in", b.start, b.title, "Check in", true);
      make("out", b.end, b.title, "Check out", false);
    } else if (b.kind === "flight" && b.legs.length) {
      const journeys = journeysOf(b.legs);
      journeys.forEach((j, i) => {
        if (!j.rich) {
          j.legs.forEach((leg, k) => {
            const src = b.legs.find((l) => l.start === leg.dep) ?? b.legs[0];
            make(`j${i}.${k}`, leg.dep, src.title, src.sub, i === 0 && k === 0);
          });
          return;
        }
        const last = j.legs[j.legs.length - 1];
        make(`j${i}`, j.dep, `${j.legs[0].from} to ${last.to}`, b.legs.find((l) => l.start === j.dep)?.sub ?? carriersText(j), i === 0);
        rows[rows.length - 1].journey = { value: j, index: i, count: journeys.length };
      });
    } else {
      make("one", b.start, b.title, b.sub, true);
    }
  }
  return rows.sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      (a.time ? 0 : 1) - (b.time ? 0 : 1) ||
      a.booking.start!.localeCompare(b.booking.start!),
  );
}

export interface DayGroup {
  day: string;
  rows: DayRow[];
}

export function byDay(rows: DayRow[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const r of rows) {
    const last = groups.at(-1);
    if (last?.day === r.day) last.rows.push(r);
    else groups.push({ day: r.day, rows: [r] });
  }
  return groups;
}

// ---------------------------------------------------------------- money --

export const cents = (n: number) => Math.round(n * 100) / 100;

export interface BookedTotals {
  /** Sum of the bookings in `currency`, paid or not. */
  total: number;
  /** Bookings in another currency are left out of the sums and counted here. */
  other: number;
  paid: number;
  later: number;
  count: number;
}

export function bookedTotals(bookings: Booking[], currency = "USD"): BookedTotals {
  const out: BookedTotals = { total: 0, other: 0, paid: 0, later: 0, count: bookings.length };
  for (const b of bookings) {
    if (b.total === null) continue;
    if (b.currency !== currency) {
      out.other += 1;
      continue;
    }
    out.total = cents(out.total + b.total);
    if (b.paid === "now") out.paid = cents(out.paid + b.total);
    if (b.paid === "later") out.later = cents(out.later + b.total);
  }
  return out;
}

export interface TripCharge {
  id: string;
  label: string;
  date: string;
  amount: number;
  currency: string;
}

export interface BookingMatch {
  /** booking id -> the charge it lines up with. */
  byBooking: Map<string, TripCharge>;
  /** Charges no booking claims. */
  loose: TripCharge[];
}

/**
 * Lines the bookings up with the charges tagged to the event, for display only. A booking the owner tied to a
 * charge keeps it; the others pair with a charge of the same amount to the cent when exactly one fits. Two
 * charges of that amount, or two bookings asking for it, pair with nothing (a guess is worse than a blank).
 */
export function matchBookings(bookings: Booking[], charges: TripCharge[]): BookingMatch {
  const byBooking = new Map<string, TripCharge>();
  const taken = new Set<string>();
  for (const b of bookings) {
    const c = b.activityId ? charges.find((x) => x.id === b.activityId) : undefined;
    if (c) {
      byBooking.set(b.id, c);
      taken.add(c.id);
    }
  }
  const open = bookings.filter(
    (b) => !byBooking.has(b.id) && b.total !== null && b.paid !== "later",
  );
  for (const b of open) {
    const fits = charges.filter(
      (c) =>
        !taken.has(c.id) &&
        c.currency === b.currency &&
        Math.abs(cents(c.amount) - cents(b.total!)) < 0.005,
    );
    const rivals = open.filter(
      (o) =>
        o.currency === b.currency &&
        o.total !== null &&
        Math.abs(cents(o.total) - cents(b.total!)) < 0.005,
    );
    if (fits.length === 1 && rivals.length === 1) {
      byBooking.set(b.id, fits[0]);
      taken.add(fits[0].id);
    }
  }
  return { byBooking, loose: charges.filter((c) => !taken.has(c.id)) };
}

/** The bank charges tagged to a trip, wherever their dates fall (a flight is bought weeks ahead). */
export function useTripCharges(event: SpendingEvent | undefined) {
  return useQuery<TripCharge[], Error>({
    queryKey: [
      "spending_transactions",
      "trip-charges",
      event?.id,
      event?.startDate,
      event?.endDate,
    ],
    enabled: !!event,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const start = dayOf(event!.startDate);
      const end = dayOf(event!.endDate);
      const rows = await listCashActivities({
        startDate: `${addDays(start, -240)}T00:00:00.000Z`,
        endDate: `${addDays(end, 60)}T23:59:59.999Z`,
      });
      return rows
        .filter((a) => a.eventId === event!.id)
        .map((a) => ({
          id: a.id,
          label: a.notes || a.activityType,
          date: a.activityDate.slice(0, 10),
          amount: getVisibleSpendingAmount(a),
          currency: a.currency,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
    },
  });
}

// ------------------------------------------------------------ search form --

/** The dates a search for a trip covers: from 120 days before it starts to 14 days after it ends. */
export function tripSearchWindow(event: Pick<SpendingEvent, "startDate" | "endDate">) {
  return { from: addDays(dayOf(event.startDate), -120), to: addDays(dayOf(event.endDate), 14) };
}

/** The dates a search for one charge covers: the 10 days before it and 3 after. */
export function chargeSearchWindow(date: string) {
  return { from: addDays(dayOf(date), -10), to: addDays(dayOf(date), 3) };
}

export type TypeChip = "all" | "flight" | "stay" | "food";

export const TYPE_CHIPS: { id: TypeChip; label: string }[] = [
  { id: "all", label: "All" },
  { id: "flight", label: "Flights" },
  { id: "stay", label: "Stays" },
  { id: "food", label: "Food" },
];

export function visibleRows(rows: SearchRow[], chip: TypeChip, showNoise: boolean): SearchRow[] {
  return rows.filter((r) => (showNoise || !r.noise) && (chip === "all" || r.kind === chip));
}

/** What a row says in one or two words, in the order the owner cares: already there, the amount, a code, else the kind. */
export function rowNote(r: SearchRow): { text: string; tone: "good" | "meh" | "warn" } {
  if (r.onTrip) return { text: "On a trip", tone: "good" };
  if (r.noise) return { text: "Not a booking", tone: "warn" };
  if (r.amountMatch) return { text: "Same amount", tone: "good" };
  if (r.code) return { text: r.code, tone: "meh" };
  return { text: KIND_LABEL[r.kind], tone: "meh" };
}

/** A read email as the fields of a new booking. */
export function inputFromRead(read: EmailRead): BookingInput {
  return {
    kind: read.kind,
    title: read.title,
    sub: read.sub,
    start: read.start ?? null,
    end: read.end ?? null,
    legs: read.legs,
    confirmation: read.confirmation ?? null,
    place: read.place ?? null,
    party: read.party ?? null,
    total: read.total ?? null,
    currency: read.currency,
    paid: read.paid,
    freeCancelUntil: read.freeCancelUntil ?? null,
    facts: read.facts,
  };
}
