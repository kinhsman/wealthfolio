// money-hub patch: Trips, the summary on top of a trip: what is booked, how it splits between flights, the stay
// and the rest, and the days to go. On a phone one line and three small numbers, keywords only.
import { Hero, useMoney } from "@/features/meadow-dash/parts";
import type { SpendingEvent } from "@/features/spending/types/event";
import { cn } from "@/lib/utils";
import { Icons } from "@wealthfolio/ui";

import {
  bookedTotals,
  daysTo,
  nightsBetween,
  rangeText,
  tripState,
  weekdayDay,
  dayOf,
  type Booking,
  type Kind,
  type TripCharge,
} from "../lib/trips";
import { KIND_COLOR } from "./parts";

const SPLIT: { id: string; label: string; kinds: Kind[] }[] = [
  { id: "flight", label: "Flights", kinds: ["flight"] },
  { id: "stay", label: "Stay", kinds: ["stay"] },
  { id: "food", label: "Food and fun", kinds: ["food", "tour", "car", "other"] },
];

function whenText(event: SpendingEvent, today: string): string {
  const state = tripState(event, today);
  if (state === "past") return "ended";
  if (state === "active") return `on now, ends in ${daysTo(event.endDate, today)} days`;
  const n = daysTo(event.startDate, today);
  return n === 1 ? "starts tomorrow" : `starts in ${n} days`;
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-[var(--m-mint-tile)] px-3 py-2.5 max-md:px-2 max-md:py-1.5 max-md:text-center">
      <span className="truncate text-[12px] text-[var(--m-mint-muted)] max-md:text-[11px]">
        {label}
      </span>
      <span className="truncate text-[17px] font-medium tabular-nums max-md:text-[15px]">
        {value}
      </span>
    </div>
  );
}

export function TripHero({
  event,
  bookings,
  charges,
  matched,
  linked,
  today,
  phone,
}: {
  event: SpendingEvent;
  bookings: Booking[];
  charges: TripCharge[];
  /** How many bookings line up with a card charge. */
  matched: number;
  linked: boolean;
  today: string;
  phone: boolean;
}) {
  const money = useMoney("USD");
  const t = bookedTotals(bookings);
  const days = nightsBetween(dayOf(event.startDate), dayOf(event.endDate)) + 1;
  const parts = SPLIT.map((s) => ({
    ...s,
    value: bookings
      .filter((b) => s.kinds.includes(b.kind) && b.currency === "USD")
      .reduce((n, b) => n + (b.total ?? 0), 0),
  }));
  const priced = bookings.filter(
    (b) => b.total !== null && b.currency === "USD" && b.paid !== "later",
  );
  const onCard = `${matched} of ${priced.length}`;
  const spentOnCard = charges.reduce((n, c) => n + c.amount, 0);
  return (
    <Hero label="Trip summary">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[14px] font-medium">{event.name}</span>
          <span className="text-[12.5px] text-[var(--m-mint-muted)]">
            {weekdayDay(event.startDate)} to {weekdayDay(event.endDate)}, {days}{" "}
            {days === 1 ? "day" : "days"}
          </span>
        </div>
        {linked ? (
          <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-[var(--m-mint-tile)] px-2.5 text-[12px]">
            <Icons.Users className="size-3.5" aria-hidden />
            Linked to Owly
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        <span className="text-[38px] font-medium tabular-nums leading-[1.1] tracking-[-0.03em] max-md:text-[28px]">
          {money.cents(t.total)}
        </span>
        <span className="text-[13.5px] text-[var(--m-mint-muted)]">
          booked, {whenText(event, today)}
          {t.other ? `, ${t.other} in another currency not added` : ""}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <Tile label="Bookings" value={String(bookings.length)} />
        <Tile label={phone ? "On card" : "Paid on card"} value={priced.length ? onCard : "None"} />
        <Tile label={phone ? "Spent" : "Spent on card"} value={money.whole(spentOnCard)} />
      </div>
      {t.total > 0 ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex h-2.5 gap-[3px]" aria-hidden>
            {parts
              .filter((p) => p.value > 0)
              .map((p) => (
                <div
                  key={p.id}
                  className="rounded-md"
                  style={{ flex: `${p.value} 1 0`, background: KIND_COLOR[p.kinds[0]] }}
                />
              ))}
          </div>
          <div
            className={cn(
              "flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-[var(--m-mint-muted)]",
            )}
          >
            {parts.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1.5">
                <span
                  className="size-2 rounded-full"
                  style={{ background: KIND_COLOR[p.kinds[0]] }}
                />
                {p.label} {p.value > 0 ? money.cents(p.value) : phone ? "$0" : "$0 so far"}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <span className="sr-only">{rangeText(event, today)}</span>
    </Hero>
  );
}
