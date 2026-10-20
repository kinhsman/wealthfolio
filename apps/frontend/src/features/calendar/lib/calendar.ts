// money-hub patch: the Calendar page's days (owner, 2026-10-20: "the money app has many things attached to a date
// ... just calendar, i open it and see everything related to that day"). Each part of the app that knows a date
// gives its items here, as they already are on their own page (nothing is worked out twice): bills and
// subscriptions as the bill calendar places them, paydays from the cash forecast, card payments from the bank,
// trips from their bookings, maintenance jobs, returns, tax dates, and people's days and holidays (lib/dates.ts).
import { billMonth } from "@/features/spending/lib/bill-calendar";
import { cardWhy, type CashForecast } from "@/features/spending/lib/cash-forecast";
import { cardName, type CreditCardsView } from "@/features/spending/lib/credit-cards";
import { cleanPayee } from "@/features/spending/lib/payee-name";
import { openReturns, type ReturnsView } from "@/features/spending/lib/returns";
import type { Stream } from "@/features/spending/lib/subscriptions";
import type { SpendingEvent } from "@/features/spending/types/event";
import type { TaxesView } from "@/features/taxes/lib/taxes";
import { dayOf, dayRows, type Booking } from "@/features/trips/lib/trips";
import { tabName, type UpkeepView } from "@/features/upkeep/lib/upkeep";

import type { Occurrence } from "./dates";

export type Layer =
  | "people"
  | "holidays"
  | "bills"
  | "income"
  | "cards"
  | "trips"
  | "upkeep"
  | "returns"
  | "taxes";

/** Each kind of item, in the order a day lists them; its colour is one of the theme's category colours. */
export const LAYERS: { key: Layer; label: string; short: string; color: string }[] = [
  { key: "people", label: "Birthdays & dates", short: "People", color: "var(--m-cat-6)" },
  { key: "holidays", label: "Holidays", short: "Holidays", color: "var(--m-cat-1)" },
  { key: "trips", label: "Trips", short: "Trips", color: "var(--m-cat-3)" },
  { key: "bills", label: "Bills & subscriptions", short: "Bills", color: "var(--m-cat-5)" },
  { key: "cards", label: "Card payments", short: "Cards", color: "var(--m-cat-10)" },
  { key: "income", label: "Paydays & money in", short: "Money in", color: "var(--m-up)" },
  { key: "upkeep", label: "Maintenance", short: "Upkeep", color: "var(--m-cat-4)" },
  { key: "returns", label: "Returns", short: "Returns", color: "var(--m-cat-2)" },
  { key: "taxes", label: "Taxes", short: "Taxes", color: "var(--m-cat-9)" },
];
export const LAYER = Object.fromEntries(LAYERS.map((l) => [l.key, l])) as Record<
  Layer,
  (typeof LAYERS)[number]
>;
const ORDER = Object.fromEntries(LAYERS.map((l, i) => [l.key, i])) as Record<Layer, number>;

export interface CalItem {
  id: string;
  date: string;
  layer: Layer;
  title: string;
  sub: string;
  /** Money on the day: out for a bill or card, in for a payday; null when there is none. */
  amount: number | null;
  /** Where it lives in the app. */
  href: string;
  /** Paid, done or past: drawn quieter. */
  done: boolean;
  /** Late: past its day and not done. */
  late: boolean;
  /** Its picture: a subscription's own logo, a merchant or bank picture, or none (the layer's icon). */
  stream?: Stream;
  logo?: { url: string | null; name: string; whole: boolean } | null;
  /** A booking's kind (flight, stay, ...), for its icon. */
  booking?: Booking["kind"];
  /** A person's day or a holiday. */
  occ?: Occurrence;
}

/** A trip from its first day to its last, drawn as a band under the days. */
export interface CalSpan {
  id: string;
  start: string;
  end: string;
  title: string;
  href: string;
}

// ------------------------------------------------------------------ days --

const pad = (n: number) => String(n).padStart(2, "0");
export const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAY_MS = 86_400_000;
const noon = (iso: string) => new Date(`${iso}T12:00:00`);
export const addDays = (iso: string, n: number) =>
  isoOf(new Date(noon(iso).getTime() + n * DAY_MS));
export const daysBetween = (a: string, b: string) =>
  Math.round((noon(b).getTime() - noon(a).getTime()) / DAY_MS);

/** The month `offset` months from `today`'s: its first and last day, where the 1st sits, its name. */
export function monthOf(today: string, offset: number) {
  const [y, m] = today.split("-").map(Number);
  const first = new Date(y, m - 1 + offset, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const thisYear = first.getFullYear() === y;
  return {
    start: isoOf(first),
    end: isoOf(last),
    days: last.getDate(),
    firstWeekday: first.getDay(),
    label: first.toLocaleDateString("en-US", {
      month: "long",
      ...(thisYear ? {} : { year: "numeric" }),
    }),
    year: first.getFullYear(),
  };
}

/** "Tue, Nov 3", with the year when it is not this year's. */
export function longDay(iso: string, today?: string): string {
  return noon(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(today && iso.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}),
  });
}

/** "today", "tomorrow", "in 12 days", "3 days ago". */
export function inDays(iso: string, today: string): string {
  const n = daysBetween(today, iso);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

const inside = (date: string, from: string, to: string) => date >= from && date <= to;

// --------------------------------------------------------------- sources --

/** Bills and subscriptions, month by month, exactly as the bill calendar places them (paid and coming). */
export function billItems(
  items: Stream[] | undefined,
  today: string,
  from: string,
  to: string,
): CalItem[] {
  if (!items?.length) return [];
  const byKey = new Map(items.map((s) => [s.key, s]));
  const out: CalItem[] = [];
  const [ty, tm] = today.split("-").map(Number);
  const [fy, fm] = from.split("-").map(Number);
  const [ey, em] = to.split("-").map(Number);
  for (let off = (fy - ty) * 12 + (fm - tm); off <= (ey - ty) * 12 + (em - tm); off += 1) {
    const m = billMonth(items, today, off);
    for (const [date, bills] of m.byDay) {
      if (!inside(date, from, to)) continue;
      bills.forEach((b, i) =>
        out.push({
          id: `bill:${b.key}:${date}:${i}`,
          date,
          layer: "bills",
          title: b.name,
          sub: b.paid
            ? "Paid"
            : b.late
              ? `Was due ${longDay(b.late)}`
              : date < today
                ? "Not in yet"
                : "Due",
          amount: b.amount,
          href: "/spending/subscriptions",
          done: b.paid,
          late: !b.paid && (!!b.late || date < today),
          stream: byKey.get(b.key),
        }),
      );
    }
  }
  return out;
}

/** Paydays and other money in that repeats, from the cash forecast (its 90 days ahead). */
export function incomeItems(f: CashForecast | undefined, from: string, to: string): CalItem[] {
  return (f?.events ?? [])
    .filter((e) => e.why === "in" && inside(e.date, from, to))
    .map((e, i) => ({
      id: `in:${e.date}:${i}`,
      date: e.date,
      layer: "income" as const,
      title: cleanPayee(e.name) || e.name,
      sub: [e.parts && e.parts > 1 ? `${e.parts} deposits` : null, e.estimated ? "expected" : null]
        .filter(Boolean)
        .join(", "),
      amount: Math.abs(e.amount),
      href: "/cash",
      done: false,
      late: false,
    }));
}

/** Each card's payment on the bank's due date. */
export function cardItems(
  v: CreditCardsView | undefined,
  today: string,
  from: string,
  to: string,
): CalItem[] {
  return (v?.cards ?? []).flatMap((c) => {
    const d = c.due;
    if (!d?.dueDate || !inside(d.dueDate, from, to)) return [];
    const paid = d.paid || !(Number(d.statementBalance) > 0);
    return [
      {
        id: `card:${c.wfAccountId}:${d.dueDate}`,
        date: d.dueDate,
        layer: "cards" as const,
        title: `${cardName(c)} payment`,
        sub: paid ? "Paid" : d.overdue || d.dueDate < today ? "Overdue" : cardWhy("statement"),
        amount: paid ? null : Number(d.statementBalance) || null,
        href: "/cash",
        done: paid,
        late: !paid && (d.overdue || d.dueDate < today),
        logo: c.bankLogo ? { url: c.bankLogo, name: c.name, whole: true } : null,
      },
    ];
  });
}

/** A trip's bookings as the days they happen on (Trips page's own rows), and the trip as a band. */
export function tripItems(
  bookings: Booking[] | undefined,
  events: SpendingEvent[] | undefined,
  travelTypeIds: Set<string>,
  from: string,
  to: string,
): { items: CalItem[]; spans: CalSpan[] } {
  const trips = (events ?? []).filter((e) => travelTypeIds.has(e.eventTypeId));
  const names = new Map(trips.map((e) => [e.id, e.name]));
  const items = dayRows(bookings ?? [])
    .filter((r) => inside(r.day, from, to))
    .map((r) => ({
      id: `trip:${r.key}`,
      date: r.day,
      layer: "trips" as const,
      title: r.label,
      sub: [r.time, r.sub, names.get(r.booking.eventId)].filter(Boolean).join(" · "),
      amount: null,
      href: `/trips?tab=${r.booking.eventId}`,
      done: false,
      late: false,
      booking: r.booking.kind,
    }));
  const spans = trips
    .map((e) => ({
      id: e.id,
      start: dayOf(e.startDate),
      end: dayOf(e.endDate),
      title: e.name,
      href: `/trips?tab=${e.id}`,
    }))
    .filter((s) => s.end >= from && s.start <= to);
  return { items, spans };
}

/** Maintenance jobs on the day they are due (a miles job: about when its miles run out). */
export function upkeepItems(v: UpkeepView | undefined, from: string, to: string): CalItem[] {
  return (v?.plans ?? []).flatMap((p) =>
    p.jobs
      .filter((j) => j.status.dueOn && j.status.kind !== "new" && inside(j.status.dueOn, from, to))
      .map((j) => ({
        id: `upkeep:${p.assetId}:${j.id}`,
        date: j.status.dueOn as string,
        layer: "upkeep" as const,
        title: j.name,
        sub: [tabName(p), j.status.by === "m" ? "by miles, about" : null, j.status.chip]
          .filter(Boolean)
          .join(" · "),
        amount: null,
        href: `/maintenance?tab=${p.assetId}`,
        done: false,
        late: j.status.kind === "bad",
      })),
  );
}

/** Open returns: the store's drop-off deadline and the day the refund should be in. */
export function returnItems(
  v: ReturnsView | undefined,
  today: string,
  from: string,
  to: string,
): CalItem[] {
  return openReturns(v?.items ?? []).flatMap((r) => {
    const logo = r.logoUrl ? { url: r.logoUrl, name: r.name, whole: false } : null;
    const out: CalItem[] = [];
    const drop = r.steps?.map((s) => s.note).find((n) => n?.kind === "dropOffBy");
    if (drop && inside(drop.date, from, to))
      out.push({
        id: `return:${r.id}:drop`,
        date: drop.date,
        layer: "returns",
        title: `Drop off ${r.name}`,
        sub: "Return deadline",
        amount: null,
        href: "/spending/returns",
        done: false,
        late: drop.date < today,
        logo,
      });
    if (inside(r.dueOn, from, to))
      out.push({
        id: `return:${r.id}:due`,
        date: r.dueOn,
        layer: "returns",
        title: `${r.name} refund`,
        sub: r.status === "late" ? "Refund late" : "Refund expected",
        amount: r.remaining,
        href: "/spending/returns",
        done: false,
        late: r.status === "late",
        logo,
      });
    return out;
  });
}

/** Tax payment dates and the return's own date. */
export function taxItems(v: TaxesView | undefined, from: string, to: string): CalItem[] {
  return (v?.dates ?? [])
    .filter((d) => inside(d.date, from, to))
    .map((d) => ({
      id: `tax:${d.key}`,
      date: d.date,
      layer: "taxes" as const,
      title: d.label,
      sub:
        d.kind === "pay"
          ? "Tax payment"
          : d.kind === "file"
            ? "File the return"
            : "Tax paper expected",
      amount: null,
      href: "/taxes",
      done: d.past,
      late: false,
    }));
}

/** People's days and holidays (the service already placed lunar dates on this year's day). */
export function dateItems(occ: Occurrence[] | undefined, from: string, to: string): CalItem[] {
  return (occ ?? [])
    .filter((o) => inside(o.date, from, to))
    .map((o) => ({
      id: `date:${o.key}`,
      date: o.date,
      layer: o.source === "date" ? ("people" as const) : ("holidays" as const),
      title: o.title,
      sub: [o.sub, o.lunar].filter(Boolean).join(" · "),
      amount: null,
      href: o.personId ? `/calendar?tab=people&person=${o.personId}` : "/calendar?tab=holidays",
      done: false,
      late: false,
      occ: o,
    }));
}

/** Every item by its day, each day in the layers' order (people first), then by title. */
export function byDay(items: CalItem[], shown: Set<Layer>): Map<string, CalItem[]> {
  const map = new Map<string, CalItem[]>();
  for (const it of items) {
    if (!shown.has(it.layer)) continue;
    map.set(it.date, [...(map.get(it.date) ?? []), it]);
  }
  for (const list of map.values())
    list.sort((a, b) => ORDER[a.layer] - ORDER[b.layer] || a.title.localeCompare(b.title));
  return map;
}
