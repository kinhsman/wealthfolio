// money-hub patch: Trips, the side column of a trip: the bank charges tagged to it (which a booking claims and
// which none does), the Owly trip it is linked to (the existing strip, untouched), and the emails kept.
import { Link } from "react-router-dom";

import { useMoney } from "@/features/meadow-dash/parts";
import { OwlyTripStrip } from "@/features/spending/components/owly-trip-strip";
import { MerchantLogo } from "@/features/spending/components/merchant-logo";
import { useMerchants } from "@/features/spending/lib/merchants";
import { tripOfEvent, type OwlyTripsAnswer } from "@/features/spending/lib/owly-trips";
import type { SpendingEvent } from "@/features/spending/types/event";
import { Icons, Skeleton } from "@wealthfolio/ui";

import { bookingLogo, merchantLogoFor } from "../lib/booking-logo";
import { useLogoKey } from "../lib/logo-key";
import { shortDay, type Booking, type BookingMatch, type TripCharge } from "../lib/trips";
import { Card, KindIcon, Pill } from "./parts";

function Title({
  icon,
  children,
  right,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 pb-1.5">
      <span className="flex size-7 items-center justify-center rounded-[8px] bg-[var(--m-tile)] text-[var(--m-ink-2)] max-md:size-6">
        {icon}
      </span>
      <h2 className="min-w-0 flex-1 truncate text-[15px] font-medium max-md:text-[14px]">
        {children}
      </h2>
      {right}
    </div>
  );
}

export function ChargesCard({
  charges,
  loading,
  match,
  bookings,
}: {
  charges: TripCharge[];
  loading: boolean;
  match: BookingMatch;
  bookings: Booking[];
}) {
  const money = useMoney("USD");
  const logoKey = useLogoKey();
  const { data: merchants } = useMerchants();
  const claimed = new Map<string, Booking>();
  for (const [bookingId, c] of match.byBooking) {
    const b = bookings.find((x) => x.id === bookingId);
    if (b) claimed.set(c.id, b);
  }
  return (
    <Card>
      <Title icon={<Icons.CreditCard className="size-4" aria-hidden />}>Charges</Title>
      {loading ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : charges.length ? (
        <ul className="flex flex-col">
          {charges.map((c) => {
            const b = claimed.get(c.id);
            // The logo of the booking that claims the charge (a Hilton merchant shows on "Tru by Hilton"), else the
            // owner's merchant named in the bank's own words, else a plain card mark.
            const own = b ? null : merchantLogoFor([c.label], merchants);
            return (
              <li
                key={c.id}
                className="grid min-h-[44px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 border-b border-[var(--m-line-soft)] py-1 last:border-b-0"
              >
                {b ? (
                  (() => {
                    const l = bookingLogo(b, [], merchants, logoKey);
                    return <KindIcon kind={b.kind} merchantLogo={l.own} logo={l.airline} />;
                  })()
                ) : own ? (
                  <MerchantLogo url={own} name="" className="size-[30px] max-md:size-7" />
                ) : (
                  <span
                    aria-hidden
                    className="flex size-[30px] items-center justify-center rounded-full bg-[var(--m-tile)] text-[var(--m-muted)] max-md:size-7"
                  >
                    <Icons.CreditCard className="size-4" />
                  </span>
                )}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px]">{c.label}</span>
                  <span className="truncate text-[12px] text-[var(--m-muted)]">
                    {shortDay(c.date)}
                    {b ? `, ${b.title}` : ", no booking yet"}
                  </span>
                </span>
                <span className="text-[13px] tabular-nums">{money.cents(c.amount)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[12.5px] text-[var(--m-muted)]">
          No charges are tagged to this trip. Tag one from{" "}
          <Link
            to="/spending/transactions"
            className="underline underline-offset-4 hover:no-underline"
          >
            Transactions
          </Link>
          .
        </p>
      )}
    </Card>
  );
}

export function OwlyCard({
  event,
  owly,
  charges,
}: {
  event: SpendingEvent;
  owly: OwlyTripsAnswer | undefined;
  charges: TripCharge[];
}) {
  const trip = tripOfEvent(owly, event.id);
  if (!owly?.connected) return null;
  return (
    <Card>
      <Title icon={<Icons.Users className="size-4" aria-hidden />}>Shared in Owly</Title>
      {trip ? (
        <OwlyTripStrip
          trip={trip}
          baseUrl={owly.baseUrl}
          spentOnCard={charges.reduce((n, c) => n + (c.amount > 0 ? c.amount : 0), 0)}
          charges={charges}
          billsState={owly.tripBills?.[event.id]}
          className="mt-0 border-t-0 pt-0"
        />
      ) : (
        <p className="text-[12.5px] text-[var(--m-muted)]">
          Not shared. Link this trip to an Owly trip from the event in Spending when friends split
          the cost.
        </p>
      )}
    </Card>
  );
}

export function EmailsCard({ bookings }: { bookings: Booking[] }) {
  const kept = bookings.filter((b) => b.source);
  return (
    <Card>
      <Title
        icon={<Icons.Mail className="size-4" aria-hidden />}
        right={kept.length ? <Pill>{kept.length}</Pill> : null}
      >
        Emails kept
      </Title>
      {kept.length ? (
        <ul className="flex flex-col">
          {kept.map((b) => (
            <li
              key={b.id}
              className="grid min-h-[40px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 border-b border-[var(--m-line-soft)] py-1 last:border-b-0"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px]">{b.source!.subject}</span>
                <span className="truncate text-[12px] text-[var(--m-muted)]">
                  {b.source!.from}, {shortDay(b.source!.date)}
                </span>
              </span>
              {b.source!.link ? (
                <a
                  href={b.source!.link}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${b.source!.subject} in Gmail`}
                  className="flex size-8 items-center justify-center rounded-md text-[var(--m-muted)] hover:bg-[var(--m-track)] hover:text-[var(--m-ink)]"
                >
                  <Icons.ExternalLink className="size-4" aria-hidden />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-[var(--m-muted)]">
          The emails you pick in Find in email are kept here.
        </p>
      )}
    </Card>
  );
}
