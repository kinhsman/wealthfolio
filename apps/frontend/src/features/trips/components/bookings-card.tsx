// money-hub patch: Trips, the Bookings card: the trip day by day, each booking one row that opens to its details
// (confirmation, party, what the email said, the bank charge it lines up with) and its own menu. A booking with
// no date sits under "No date yet".
import { useState } from "react";

import { useMoney } from "@/features/meadow-dash/parts";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icons,
} from "@wealthfolio/ui";

import {
  byDay,
  dayRows,
  shortDay,
  timeOf,
  weekdayDay,
  type Booking,
  type BookingMatch,
  type DayRow,
} from "../lib/trips";
import { useMerchants, type Merchant } from "@/features/spending/lib/merchants";

import { bookingLogo } from "../lib/booking-logo";
import { useFlightTrack } from "../lib/flight-track";
import { useLogoKey } from "../lib/logo-key";
import { JourneyHeading, JourneyTimeline } from "./flight-itinerary";
import { PassesPanel } from "./passes-panel";
import { Card, KindIcon, Pill } from "./parts";

function statusOf(
  b: Booking,
  hasCharge: boolean,
  phone: boolean,
): { text: string; tone: "good" | "plain" | "quiet" } | null {
  if (hasCharge) return { text: phone ? "Paid" : "Paid on card", tone: "good" };
  if (b.paid === "later")
    return {
      text: phone ? "Later" : b.kind === "food" ? "Pay at the table" : "Pay later",
      tone: "plain",
    };
  if (b.total !== null && b.paid === "now") return { text: "No charge found", tone: "quiet" };
  return null;
}

function Detail({
  b,
  match,
  money,
  phone,
}: {
  b: Booking;
  match: BookingMatch;
  money: ReturnType<typeof useMoney>;
  phone: boolean;
}) {
  const charge = match.byBooking.get(b.id);
  const facts: { k: string; v: string }[] = [
    ...(b.confirmation ? [{ k: "Confirmation", v: b.confirmation }] : []),
    ...(b.party ? [{ k: "Party", v: String(b.party) }] : []),
    ...(b.place ? [{ k: "Place", v: b.place }] : []),
    ...(b.total !== null ? [{ k: "Total", v: money.cents(b.total) }] : []),
    ...(b.kind === "flight" && b.checkinHours ? [{ k: "Check-in reminder", v: `${b.checkinHours} hours before` }] : []),
    ...(b.freeCancelUntil ? [{ k: "Free cancel until", v: shortDay(b.freeCancelUntil) }] : []),
    ...b.facts,
  ];
  return (
    <div className={cn("flex flex-col gap-2 pb-2.5 pr-2.5", phone ? "pl-[46px]" : "pl-[50px]")}>
      {facts.length ? (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl bg-[var(--m-tile)] px-2.5 py-2 sm:grid-cols-3">
          {facts.map((f, i) => (
            <div key={`${f.k}${i}`} className="min-w-0">
              <dt className="text-[11px] text-[var(--m-muted)]">{f.k}</dt>
              <dd className="truncate text-[12.5px]" title={f.v}>
                {f.v}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {b.kind === "flight" ? <PassesPanel b={b} /> : null}
      {b.note ? <p className="text-[12.5px] text-[var(--m-ink-2)]">{b.note}</p> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[var(--m-muted)]">
        {charge ? (
          <span className="inline-flex items-center gap-1.5">
            <Icons.Link className="size-3" aria-hidden />
            {charge.label}, {shortDay(charge.date)}, {money.cents(charge.amount)}
          </span>
        ) : null}
        {b.source ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Icons.Mail className="size-3 shrink-0" aria-hidden />
            <span className="truncate">
              {b.source.from}, {shortDay(b.source.date)}
            </span>
            {b.source.link ? (
              <a
                href={b.source.link}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-[var(--m-forest)] underline-offset-4 hover:underline"
              >
                Open in Gmail
              </a>
            ) : null}
          </span>
        ) : null}
      </div>
      {b.legs.length > 1 && b.kind !== "flight" ? (
        <ul className="text-[12.5px] text-[var(--m-ink-2)]">
          {b.legs.map((l, i) => (
            <li key={i}>
              {l.title}
              {l.sub ? `, ${l.sub}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Row({
  logoKey,
  merchants,
  row,
  match,
  money,
  phone,
  open,
  onToggle,
  onEdit,
  onRemove,
}: {
  logoKey: string | null;
  merchants: Merchant[] | undefined;
  row: DayRow;
  match: BookingMatch;
  money: ReturnType<typeof useMoney>;
  phone: boolean;
  open: boolean;
  onToggle: () => void;
  onEdit: (b: Booking) => void;
  onRemove: (b: Booking) => void;
}) {
  const b = row.booking;
  const logos = bookingLogo(b, [row.sub, row.label], merchants, logoKey);
  const status = row.lead ? statusOf(b, match.byBooking.has(b.id), phone) : null;
  const when = [row.time, row.sub].filter(Boolean).join(", ");
  // Asks only while a flight of this booking is about to leave or in the air (see lib/flight-track.ts).
  const track = useFlightTrack(b).data;
  return (
    <li className={cn("rounded-xl", open && "bg-[var(--m-tile)]")}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2.5 text-left hover:bg-[var(--m-tile)]",
            phone ? "min-h-[44px] py-1" : "min-h-[48px] py-1.5",
          )}
        >
          <KindIcon kind={row.kind} merchantLogo={logos.own} logo={logos.airline} />
          {row.journey ? (
            <JourneyHeading
              journey={row.journey.value}
              index={row.journey.index}
              count={row.journey.count}
              phone={phone}
              track={track}
            />
          ) : (
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13.5px]">{row.label}</span>
              {when ? (
                <span className="truncate text-[12px] text-[var(--m-muted)]">{when}</span>
              ) : null}
            </span>
          )}
          {status && row.journey && phone ? (
            status.tone === "good" ? (
              <Icons.Check className="size-4 shrink-0 text-[var(--m-good-ink,var(--success))]" aria-label={status.text} />
            ) : null
          ) : status ? (
            status.tone === "quiet" ? (
              <span className="shrink-0 whitespace-nowrap text-[12px] text-[var(--m-muted)]">
                {status.text}
              </span>
            ) : (
              <Pill tone={status.tone === "good" ? "good" : "plain"}>
                {status.tone === "good" ? <Icons.Check className="size-3" aria-hidden /> : null}
                {status.text}
              </Pill>
            )
          ) : null}
          {row.lead && b.total !== null && !phone ? (
            <span className="w-[76px] shrink-0 text-right text-[13px] tabular-nums">
              {money.cents(b.total)}
            </span>
          ) : null}
          <Icons.ChevronDown
            className={cn(
              "size-4 shrink-0 text-[var(--m-muted)] transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`More for ${b.title}`}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--m-muted)] hover:bg-[var(--m-track)] hover:text-[var(--m-ink)]"
            >
              <Icons.Ellipsis className="size-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem className="h-8" onSelect={() => onEdit(b)}>
              <Icons.Pencil className="mr-2 size-4" aria-hidden />
              Edit
            </DropdownMenuItem>
            {b.source?.link ? (
              <DropdownMenuItem
                className="h-8"
                onSelect={() => window.open(b.source!.link!, "_blank", "noreferrer")}
              >
                <Icons.Mail className="mr-2 size-4" aria-hidden />
                Open the email
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="h-8" onSelect={() => onRemove(b)}>
              <Icons.Trash className="mr-2 size-4" aria-hidden />
              Take off this trip
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {open && row.journey ? <JourneyTimeline journey={row.journey.value} phone={phone} track={track} booking={b} /> : null}
      {open && (row.lead || !row.journey) ? (
        <Detail b={b} match={match} money={money} phone={phone} />
      ) : null}
    </li>
  );
}

export function BookingsCard({
  bookings,
  match,
  phone,
  onFind,
  onAdd,
  onEdit,
  onRemove,
}: {
  bookings: Booking[];
  match: BookingMatch;
  phone: boolean;
  onFind: () => void;
  onAdd: () => void;
  onEdit: (b: Booking) => void;
  onRemove: (b: Booking) => void;
}) {
  const money = useMoney("USD");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const days = byDay(dayRows(bookings));
  const undated = bookings.filter((b) => !b.start);
  const logoKey = useLogoKey();
  const { data: merchants } = useMerchants();
  const rowProps = { logoKey, merchants, match, money, phone, onEdit, onRemove };
  return (
    <Card className="flex flex-col gap-1.5" bleed>
      <div className="flex items-start justify-between gap-2 px-[18px] pt-3.5 max-md:px-3 max-md:pt-2.5">
        <div className="flex flex-col">
          <h2 className="text-[15px] font-medium max-md:text-[14px]">Bookings</h2>
          {phone ? null : (
            <span className="text-[12.5px] text-[var(--m-muted)]">
              Day by day, from your emails and charges
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onFind}
          className="text-[12.5px] text-[var(--m-forest)] underline-offset-4 hover:underline"
        >
          Find more in email
        </button>
      </div>
      {bookings.length === 0 ? (
        <div className="flex flex-col items-start gap-2 px-[18px] pb-4 pt-1 max-md:px-3">
          <p className="max-w-[56ch] text-[13px] text-[var(--m-ink-2)]">
            Nothing booked here yet. Search your email for the flight, the hotel or the tour, or add
            one by hand.
          </p>
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--m-line)] px-3 text-[12.5px] text-[var(--m-ink-2)] hover:bg-[var(--m-tile)]"
          >
            <Icons.Plus className="size-3.5" aria-hidden />
            Add by hand
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1 px-2 pb-2.5 max-md:px-1">
          {days.map((g) => (
            <div key={g.day} className="flex flex-col gap-0.5">
              <div className="px-2.5 pb-0.5 pt-1.5 text-[12px] text-[var(--m-muted)]">
                {weekdayDay(g.day)}
              </div>
              <ul className="flex flex-col gap-0.5">
                {g.rows.map((r) => (
                  <Row
                    key={r.key}
                    row={r}
                    open={openKey === r.key}
                    onToggle={() => setOpenKey(openKey === r.key ? null : r.key)}
                    {...rowProps}
                  />
                ))}
              </ul>
            </div>
          ))}
          {undated.length ? (
            <div className="flex flex-col gap-0.5">
              <div className="px-2.5 pb-0.5 pt-1.5 text-[12px] text-[var(--m-muted)]">
                No date yet
              </div>
              <ul className="flex flex-col gap-0.5">
                {undated.map((b) => {
                  const row: DayRow = {
                    key: `${b.id}:none`,
                    day: "",
                    time: timeOf(b.start),
                    label: b.title,
                    sub: b.sub,
                    kind: b.kind,
                    booking: b,
                    lead: true,
                  };
                  return (
                    <Row
                      key={row.key}
                      row={row}
                      open={openKey === row.key}
                      onToggle={() => setOpenKey(openKey === row.key ? null : row.key)}
                      {...rowProps}
                    />
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
