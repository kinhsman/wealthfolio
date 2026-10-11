// money-hub patch: the Owly trip linked to an event, as one small strip (Spending dashboard
// event card). Shows the group's total, the owner's share, who owes whom, and the cost to the
// owner once friends pay back. Owly's own page opens from the arrow.
import { cn } from "@/lib/utils";
import { Icons, PrivacyAmount } from "@wealthfolio/ui";

import { owlyTripUrl, tripSummary, type OwlyTrip } from "../lib/owly-trips";

export function OwlyTripStrip({
  trip,
  baseUrl,
  spentOnCard = 0,
  className,
}: {
  trip: OwlyTrip;
  baseUrl?: string;
  /** The bank entries tagged to the event, for the cost after friends pay back. */
  spentOnCard?: number;
  className?: string;
}) {
  const { note, facts } = tripSummary(trip, spentOnCard);
  return (
    <div className={cn("border-border/40 mt-3 border-t pt-2 text-[11px]", className)} data-testid="owly-trip-strip">
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
    </div>
  );
}
