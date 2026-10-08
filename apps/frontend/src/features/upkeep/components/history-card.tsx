// money-hub patch: Home & Car, Recent jobs: what was done, on which asset, what it cost and the bank charge that
// paid it ("Paid elsewhere" when none was named). A mistake is taken back from the row's menu.
import { useState } from "react";

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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icons,
  PrivacyAmount,
} from "@wealthfolio/ui";

import { shortDay, type UpkeepEvent } from "../lib/upkeep";
import { Card } from "./parts";

export function HistoryCard({
  events,
  currency,
  today,
  phone,
  limit,
  onTakeBack,
}: {
  events: UpkeepEvent[];
  currency: string;
  today: string;
  phone: boolean;
  /** How many show before "Show more"; none = all. */
  limit?: number;
  onTakeBack: (e: UpkeepEvent) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<UpkeepEvent | null>(null);
  const shown = limit && !open ? events.slice(0, limit) : events;
  return (
    <Card bleed>
      <div className="flex items-center gap-2.5 px-3.5 pb-1.5 pt-3 max-md:px-2.5 max-md:pb-0.5 max-md:pt-2">
        <span className="flex size-7 items-center justify-center rounded-[8px] bg-[var(--m-tile)] text-[var(--m-ink-2)] max-md:size-6">
          <Icons.Wrench className="size-4" aria-hidden />
        </span>
        <h2 className="text-[15px] font-medium max-md:text-[14px]">Recent jobs</h2>
      </div>
      {events.length ? (
        <ul className="pb-1.5">
          {shown.map((e) => (
            <li
              key={e.id}
              className={cn(
                "grid items-center gap-2.5 text-[14px] hover:bg-[var(--m-tile)]",
                phone
                  ? "min-h-[36px] grid-cols-[54px_minmax(0,1fr)_auto_28px] px-2.5"
                  : "min-h-[38px] grid-cols-[62px_minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_90px_28px] px-3.5",
              )}
            >
              <span className="truncate text-[13px] text-[var(--m-muted)]">
                {shortDay(e.date, today)}
              </span>
              <span className="truncate">
                {e.name}
                {e.oneoff ? (
                  <span className="ml-1.5 rounded-full border border-[var(--m-line)] px-[7px] text-[11px] text-[var(--m-muted)]">
                    One-off
                  </span>
                ) : null}
              </span>
              {phone ? null : (
                <span className="truncate text-[13px] text-[var(--m-muted)]">{e.assetName}</span>
              )}
              {phone ? null : e.charge ? (
                <span
                  className="flex items-center gap-1.5 truncate text-[12px] text-[var(--m-done)]"
                  title={`${e.charge.merchant} · ${shortDay(e.charge.date, today)}`}
                >
                  <Icons.Link className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">{e.charge.merchant}</span>
                </span>
              ) : (
                <span className="truncate text-[12px] text-[var(--m-muted)]">Paid elsewhere</span>
              )}
              <span className="text-right tabular-nums">
                {e.cost > 0 ? <PrivacyAmount value={e.cost} currency={currency} /> : "–"}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`More for ${e.name}`}
                    className="flex size-7 items-center justify-center rounded-md text-[var(--m-muted)] hover:bg-[var(--m-track)] hover:text-[var(--m-ink)]"
                  >
                    <Icons.Ellipsis className="size-4" aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-44">
                  <DropdownMenuItem className="h-8" onSelect={() => setAsking(e)}>
                    <Icons.Trash className="mr-2 size-4" aria-hidden />
                    Take this back
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3.5 pb-3.5 pt-1 text-[13px] text-[var(--m-muted)]">
          Nothing done yet. A job marked done shows here.
        </p>
      )}
      {limit && events.length > limit ? (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex h-[38px] w-full items-center justify-center border-t border-[var(--m-line-soft)] text-[13px] text-[var(--m-muted)]"
        >
          {open ? "Show less" : `Show ${events.length - limit} more`}
        </button>
      ) : null}
      <AlertDialog open={!!asking} onOpenChange={(o) => !o && setAsking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Take this back?</AlertDialogTitle>
            <AlertDialogDescription>
              {asking
                ? `${asking.name} on ${shortDay(asking.date, today)} goes off the list, and the job is due from the time before. ${asking.charge ? `The bank charge from ${asking.charge.merchant} is free to name again.` : ""}`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const e = asking;
                setAsking(null);
                if (e) void onTakeBack(e);
              }}
            >
              Take it back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
