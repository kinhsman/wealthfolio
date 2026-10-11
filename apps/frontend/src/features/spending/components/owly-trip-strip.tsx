// money-hub patch: the Owly trip linked to an event, as one small strip (Spending dashboard
// event card). Shows the group's total, the owner's share, who owes whom, and the cost to the
// owner once friends pay back. Owly's own page opens from the arrow.
import { useState } from "react";

import { cn } from "@/lib/utils";
import { Icons, PrivacyAmount } from "@wealthfolio/ui";

import {
  matchCharges,
  owlyTripUrl,
  tripSummary,
  type Charge,
  type OwlyTrip,
  type OwlyTripBillsState,
} from "../lib/owly-trips";

export function OwlyTripStrip({
  trip,
  baseUrl,
  spentOnCard = 0,
  charges,
  billsState,
  onSkip,
  className,
}: {
  trip: OwlyTrip;
  baseUrl?: string;
  /** The bank entries tagged to the event, for the cost after friends pay back. */
  spentOnCard?: number;
  /** The card charges tagged to the event; when given, the strip says how they line up with Owly's bills. */
  charges?: Charge[];
  /** Whether this event adds its tagged charges to the trip, and which charges are left out. */
  billsState?: OwlyTripBillsState;
  /** Leave a charge out of Owly, or add it back. */
  onSkip?: (activityId: string, skip: boolean) => void;
  className?: string;
}) {
  const { note, facts } = tripSummary(trip, spentOnCard);
  const [open, setOpen] = useState(false);
  const lineup =
    charges && trip.bills?.some((b) => b.paidByYou) ? matchCharges(trip, charges) : null;
  const mine = lineup ? lineup.matched.length + lineup.billsOnly.length : 0;
  const allMatched = !!lineup && lineup.billsOnly.length === 0 && lineup.chargesOnly.length === 0;
  return (
    <div
      className={cn("border-border/40 mt-3 border-t pt-2 text-[11px]", className)}
      data-testid="owly-trip-strip"
    >
      <div className="flex items-center gap-1.5">
        <Icons.Users className="text-muted-foreground/70 h-3.5 w-3.5 shrink-0" />
        <span className="text-foreground/90 min-w-0 flex-1 truncate font-medium">
          {trip.name}
          <span className="text-muted-foreground/70 font-normal">
            {" "}
            · Owly · {trip.billCount} {trip.billCount === 1 ? "bill" : "bills"}
            {trip.status === "settled" ? " · settled" : ""}
          </span>
        </span>
        <a
          href={owlyTripUrl(baseUrl, trip.id)}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-0.5 underline-offset-4 hover:underline"
        >
          Open
          <Icons.ChevronRight className="h-3 w-3" />
        </a>
      </div>
      <div className="text-muted-foreground/80 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
        {facts.map((f) => (
          <span key={f.label} className="tabular-nums">
            {f.label}{" "}
            <span
              className={cn(
                "text-foreground/90 font-medium",
                f.tone === "good" && "text-success",
                f.tone === "warn" && "text-destructive",
              )}
            >
              <PrivacyAmount value={f.amount} currency={trip.currency} />
            </span>
          </span>
        ))}
        {note && <span>{note}</span>}
      </div>
      {lineup && (
        <div className="text-muted-foreground/80 mt-1" data-testid="owly-trip-lineup">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="hover:text-foreground inline-flex items-center gap-1 text-left underline-offset-4 hover:underline"
          >
            <Icons.ChevronRight
              className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-90")}
            />
            {allMatched
              ? `Card and Owly agree: all ${mine} bills you paid are on the card`
              : `${lineup.matched.length} of ${mine} Owly bills you paid are on the card`}
          </button>
          {open && (
            <ul className="mt-1 space-y-0.5 pl-4">
              {lineup.billsOnly.map((b) => (
                <li key={`b${b.id}`} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">
                    In Owly, not on the card: {b.description}
                  </span>
                  <span className="text-foreground/90 shrink-0 tabular-nums">
                    <PrivacyAmount value={b.total} currency={b.currency} />
                  </span>
                </li>
              ))}
              {lineup.chargesOnly.map((c) => {
                const left = !!billsState?.skipped?.includes(c.id);
                return (
                  <li key={`c${c.id}`} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {left
                        ? "Left out of Owly: "
                        : billsState?.on
                          ? "Goes to Owly: "
                          : "On the card, not in Owly: "}
                      {c.label}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-foreground/90 tabular-nums">
                        <PrivacyAmount value={c.amount} currency={c.currency} />
                      </span>
                      {onSkip && billsState?.on && (
                        <button
                          type="button"
                          onClick={() => onSkip(c.id, !left)}
                          className="hover:text-foreground underline underline-offset-4"
                        >
                          {left ? "Add back" : "Leave out"}
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
              {allMatched && <li>Every bill has a card charge of the same amount.</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
