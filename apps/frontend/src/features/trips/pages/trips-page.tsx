// money-hub patch: Trips (owner, 2026-10-15: "track receipts, email confirmations, hotel, flights, tours ... and
// search the linked email with a charge or a confirmation and pick the one the app found"). A trip is a Travel
// event of the Spending dashboard; this page adds what the event never had: its bookings, kept by the money-hub
// service (lib/trips.ts), and Find in email, which searches the linked Gmail. One tab per upcoming or running
// trip, plus Past trips. Charges, the Owly link and the event's own dates stay where they are; this page only
// shows them and never changes a charge or writes to Owly.
import { Plane } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { SwipablePage, type SwipablePageView } from "@/components/page";
import { MeadowTab, useMoney } from "@/features/meadow-dash/parts";
import { useEventDialog } from "@/features/spending/components/event-dialog-provider";
import { useOwlyTrips } from "@/features/spending/hooks/use-owly-trips";
import { useEventTypes, useSpendingEvents } from "@/features/spending/hooks/use-spending-events";
import { todayIso } from "@/features/spending/lib/hsa";
import { tripOfEvent } from "@/features/spending/lib/owly-trips";
import type { SpendingEvent } from "@/features/spending/types/event";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Icons,
  Skeleton,
} from "@wealthfolio/ui";

import { BookingDialog, type BookingStart } from "../components/booking-dialog";
import { BookingsCard } from "../components/bookings-card";
import { FindInEmailDialog, type FindStart } from "../components/find-in-email-dialog";
import { Card } from "../components/parts";
import { ChargesCard, EmailsCard, OwlyCard } from "../components/side-cards";
import { TripHero } from "../components/trip-hero";
import {
  BOOKINGS_KEY,
  bookedTotals,
  isTravelType,
  matchBookings,
  rangeText,
  tripState,
  tripsApi,
  useBookings,
  useTripCharges,
  useTripsStatus,
  type Booking,
  type BookingInput,
} from "../lib/trips";

function Actions({
  phone,
  onFind,
  onAdd,
}: {
  phone: boolean;
  onFind: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        className={cn("h-8 gap-1.5", phone && "w-8 px-0")}
        onClick={onFind}
        aria-label="Find in email"
      >
        <Icons.Search className="size-4" aria-hidden />
        {phone ? null : "Find in email"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn("h-8 gap-1.5", phone && "w-8 px-0")}
        onClick={onAdd}
        aria-label="Add booking"
      >
        <Icons.Plus className="size-4" aria-hidden />
        {phone ? null : "Add booking"}
      </Button>
    </div>
  );
}

function TripBody({
  event,
  bookings,
  phone,
  today,
  onFind,
  onAdd,
  onEdit,
  onRemove,
  onEditTrip,
}: {
  event: SpendingEvent;
  bookings: Booking[];
  phone: boolean;
  today: string;
  onFind: (start: FindStart) => void;
  onAdd: () => void;
  onEdit: (b: Booking) => void;
  onRemove: (b: Booking) => void;
  onEditTrip: () => void;
}) {
  const { data: owly } = useOwlyTrips();
  const charges = useTripCharges(event);
  const list = useMemo(() => charges.data ?? [], [charges.data]);
  const match = useMemo(() => matchBookings(bookings, list), [bookings, list]);
  return (
    <>
      <TripHero
        event={event}
        bookings={bookings}
        charges={list}
        matched={match.byBooking.size}
        linked={!!tripOfEvent(owly, event.id)}
        today={today}
        phone={phone}
      />
      <div className="grid items-start gap-3.5 max-md:gap-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <BookingsCard
          bookings={bookings}
          match={match}
          phone={phone}
          onFind={() => onFind({ mode: "trip" })}
          onAdd={onAdd}
          onEdit={onEdit}
          onRemove={onRemove}
        />
        <div className="flex min-w-0 flex-col gap-3.5 max-md:gap-2">
          <ChargesCard
            charges={list}
            loading={charges.isLoading}
            match={match}
            bookings={bookings}
          />
          <OwlyCard event={event} owly={owly} charges={list} />
          <EmailsCard bookings={bookings} />
          <button
            type="button"
            onClick={onEditTrip}
            className="inline-flex h-8 items-center gap-1.5 self-start rounded-full border border-[var(--m-line)] px-3 text-[12.5px] text-[var(--m-ink-2)] hover:bg-[var(--m-tile)]"
          >
            <Icons.Pencil className="size-3.5" aria-hidden />
            Edit the trip dates
          </button>
        </div>
      </div>
    </>
  );
}

function PastList({
  trips,
  bookings,
  onOpen,
}: {
  trips: SpendingEvent[];
  bookings: Booking[];
  onOpen: (e: SpendingEvent) => void;
}) {
  const money = useMoney("USD");
  if (!trips.length)
    return (
      <Card>
        <p className="text-[13px] text-[var(--m-muted)]">
          No past trips yet. A trip that has ended shows here.
        </p>
      </Card>
    );
  return (
    <Card bleed>
      <ul className="py-1.5">
        {trips.map((e) => {
          const mine = bookings.filter((b) => b.eventId === e.id);
          const t = bookedTotals(mine);
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onOpen(e)}
                className="grid min-h-[44px] w-full grid-cols-[minmax(0,1fr)_auto_16px] items-center gap-3 px-3.5 text-left hover:bg-[var(--m-tile)] max-md:px-2.5"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[14px]">{e.name}</span>
                  <span className="truncate text-[12px] text-[var(--m-muted)]">
                    {rangeText(e)}, {mine.length} {mine.length === 1 ? "booking" : "bookings"}
                  </span>
                </span>
                <span className="text-[13px] tabular-nums">
                  {t.total ? money.cents(t.total) : ""}
                </span>
                <Icons.ChevronRight className="size-4 text-[var(--m-muted)]" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export default function TripsPage() {
  const phone = useIsMobileViewport();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { openEventDialog } = useEventDialog();
  const events = useSpendingEvents();
  const types = useEventTypes();
  const bookingsQ = useBookings();
  const status = useTripsStatus();
  const today = todayIso();
  const [find, setFind] = useState<{ start: FindStart; eventId: string } | null>(null);
  const [edit, setEdit] = useState<{ start: BookingStart; eventId: string } | null>(null);
  const [removing, setRemoving] = useState<Booking | null>(null);

  const travelIds = new Set((types.data ?? []).filter(isTravelType).map((t) => t.id));
  const trips = (events.data ?? [])
    .filter((e) => travelIds.has(e.eventTypeId))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const live = trips.filter((e) => tripState(e, today) !== "past");
  const past = trips.filter((e) => tripState(e, today) === "past").reverse();
  const all = bookingsQ.data ?? [];
  const asked = params.get("tab");
  const openedPast = past.find((e) => e.id === asked);
  const eventOf = (id: string) => trips.find((e) => e.id === id);

  const onSave = async (eventId: string, id: string | null, input: BookingInput) => {
    try {
      if (id) await tripsApi.update(id, input);
      else await tripsApi.add(eventId, input);
      await qc.invalidateQueries({ queryKey: BOOKINGS_KEY });
      toast.success(id ? "Booking saved" : "Booking added");
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  };

  const takeOff = async (b: Booking) => {
    try {
      await tripsApi.remove(b.id);
      await qc.invalidateQueries({ queryKey: BOOKINGS_KEY });
      toast.success("Taken off the trip");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const newTrip = () => {
    const travel = (types.data ?? []).find(isTravelType);
    openEventDialog({ prefill: travel ? { eventTypeId: travel.id } : undefined });
  };

  const tripView = (e: SpendingEvent): SwipablePageView => ({
    value: e.id,
    label: e.name,
    icon: Plane,
    actions: (
      <Actions
        phone={phone}
        onFind={() => setFind({ start: { mode: "trip" }, eventId: e.id })}
        onAdd={() => setEdit({ start: { booking: null }, eventId: e.id })}
      />
    ),
    content: (
      <MeadowTab>
        <TripBody
          event={e}
          bookings={all.filter((b) => b.eventId === e.id)}
          phone={phone}
          today={today}
          onFind={(start) => setFind({ start, eventId: e.id })}
          onAdd={() => setEdit({ start: { booking: null }, eventId: e.id })}
          onEdit={(b) => setEdit({ start: { booking: b }, eventId: e.id })}
          onRemove={setRemoving}
          onEditTrip={() => openEventDialog({ event: e })}
        />
      </MeadowTab>
    ),
  });

  const loading = events.isLoading || types.isLoading;
  const failed = events.error || types.error || bookingsQ.error;

  const views: SwipablePageView[] = [
    ...live.map(tripView),
    ...(openedPast ? [tripView(openedPast)] : []),
    {
      value: "past",
      label: "Past trips",
      icon: Icons.History,
      actions: undefined,
      content: (
        <MeadowTab>
          <PastList
            trips={past}
            bookings={all}
            onOpen={(e) => setParams({ tab: e.id }, { replace: true })}
          />
        </MeadowTab>
      ),
    },
  ];

  const empty: SwipablePageView[] = [
    {
      value: "past",
      label: "Trips",
      content: (
        <MeadowTab>
          {loading ? (
            <div className="flex flex-col gap-3.5" aria-busy>
              <Skeleton className="h-28 w-full rounded-[20px]" />
              <Skeleton className="h-64 w-full rounded-[20px]" />
            </div>
          ) : failed ? (
            <Card>
              <p className="text-[13.5px]">{failed.message || "Trips could not be loaded."}</p>
            </Card>
          ) : (
            <Card className="flex flex-col items-start gap-2.5 !px-5 !py-5">
              <h2 className="text-[16px] font-medium">Keep every booking of a trip in one place</h2>
              <p className="max-w-[60ch] text-[13.5px] text-[var(--m-ink-2)]">
                A trip is a Travel event. Add one, then search your email for the flight, the hotel
                and the tours, and pick the right ones. Each booking keeps its confirmation, its
                price and the bank charge that paid it.
              </p>
              <Button type="button" size="sm" className="h-8 gap-1.5" onClick={newTrip}>
                <Icons.Plus className="size-4" aria-hidden />
                New trip
              </Button>
            </Card>
          )}
        </MeadowTab>
      ),
    },
  ];

  const showEmpty = loading || failed || trips.length === 0;
  const findEvent = find ? eventOf(find.eventId) : undefined;
  const findCharges = useTripCharges(findEvent).data ?? [];
  const editCharges = useTripCharges(edit ? eventOf(edit.eventId) : undefined).data ?? [];

  return (
    <>
      <SwipablePage
        className="pt-0"
        views={showEmpty ? empty : views}
        defaultView={live[0]?.id ?? "past"}
        withPadding={false}
        withMobileNavOffset={false}
        mobileActionsPlacement="header"
      />
      <FindInEmailDialog
        start={find?.start ?? null}
        event={findEvent}
        charges={findCharges}
        status={status.data}
        phone={phone}
        onClose={() => setFind(null)}
      />
      <BookingDialog
        start={edit?.start ?? null}
        charges={editCharges}
        onSave={(id, input) => (edit ? onSave(edit.eventId, id, input) : Promise.resolve(false))}
        onClose={() => setEdit(null)}
      />
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Take {removing?.title} off this trip?</AlertDialogTitle>
            <AlertDialogDescription>
              The booking goes from the trip. The email stays in Gmail and any bank charge stays
              where it is.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const b = removing;
                setRemoving(null);
                if (b) void takeOff(b);
              }}
            >
              Take it off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
