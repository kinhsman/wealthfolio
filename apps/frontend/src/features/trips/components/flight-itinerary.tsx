// money-hub patch: Trips, a flight drawn as an itinerary (owner, 2026-10-19, from his compact flight mock): the row
// reads "12:30 AM ORD to 11:40 AM +1 DAD" with the airline, the door to door time and the stops under it; open, a
// two-column timeline lists each airport with its time, each flight (number, airline, time in the air) and the wait
// between flights. Connections are one journey (see lib/itinerary.ts); nothing here changes a booking.
import { Fragment, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Icons } from "@wealthfolio/ui";

import { trackFor, type TrackAnswer } from "../lib/flight-track";
import { airportName, carriersText, durationText, type FlightLeg, type Journey } from "../lib/itinerary";
import { dayNumber, dayOf, timeOf, weekdayDay } from "../lib/trips";
import { LiveFlight, LivePill } from "./live-flight";

const shiftOf = (stamp: string, from: string) => dayNumber(stamp) - dayNumber(from);

/** "+1" after a time that lands on a later day than the journey left. */
function Plus({ shift }: { shift: number }) {
  return shift > 0 ? (
    <sup className="ml-0.5 text-[10px] font-medium text-[var(--m-forest)]">+{shift}</sup>
  ) : null;
}

/** The journey's label when the booking has more than one: Outbound, Return, else Flight 2... */
function journeyName(index: number, count: number): string {
  if (count < 2) return "";
  if (index === 0) return "Outbound";
  if (count === 2 || index === count - 1) return "Return";
  return `Flight ${index + 1}`;
}

/** "12:30 AM" as "12:30a" on a phone, where the row is tight. */
const clock = (stamp: string, phone: boolean) => {
  const t = timeOf(stamp) || "—";
  return phone ? t.replace(" AM", "a").replace(" PM", "p") : t;
};

/** The closed row's text: the times and airports on top, the airline, time and stops under it. */
export function JourneyHeading({
  journey: j,
  index,
  count,
  phone,
  track,
}: {
  journey: Journey;
  index: number;
  count: number;
  phone: boolean;
  /** The booking's live flights (lib/flight-track.ts), while one is near. */
  track?: TrackAnswer;
}) {
  const first = j.legs[0];
  const last = j.legs[j.legs.length - 1];
  const name = journeyName(index, count);
  const stops = j.stops.length;
  const bits = [
    name,
    carriersText(j),
    j.minutes !== null ? durationText(j.minutes) : "",
    stops ? `${stops === 1 ? "1 stop" : `${stops} stops`} (${j.stops.join(", ")})` : "Nonstop",
  ].filter(Boolean);
  return (
    <span className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <span className="flex items-baseline gap-1.5 whitespace-nowrap text-[13.5px] tabular-nums max-md:gap-1 max-md:text-[13px]">
        <span className="font-medium">{clock(j.dep, phone)}</span>
        <span className="text-[12px] text-[var(--m-muted)]">{first.from}</span>
        <Icons.ArrowRight className="size-3 shrink-0 self-center text-[var(--m-muted)]" aria-hidden />
        <span className="font-medium">
          {clock(last.arr!, phone)}
          <Plus shift={shiftOf(last.arr!, j.dep)} />
        </span>
        <span className="text-[12px] text-[var(--m-muted)]">{last.to}</span>
        {track ? <LivePill legs={j.legs.map((l) => trackFor(track, l))} phone={phone} /> : null}
      </span>
      <span className="truncate text-[12px] text-[var(--m-muted)]">
        {bits.map((b, i) => (
          <span
            key={i}
            className={cn(
              i === bits.length - 1 && stops ? "text-[var(--m-warn-line)]" : undefined,
              i === 0 && name ? "font-medium text-[var(--m-ink-2)]" : undefined,
            )}
          >
            {i ? " · " : ""}
            {b}
          </span>
        ))}
      </span>
    </span>
  );
}

type Rail = { dot: "start" | "mid" | "end" | "none"; line: "solid" | "dashed" | "none"; cap?: "top" | "bottom" };

/** One cell of the timeline's middle column: the line through the row and the dot on it. */
function RailCell({ dot, line, cap }: Rail) {
  return (
    <div className="relative self-stretch" aria-hidden>
      {line !== "none" ? (
        <div
          className={cn(
            "absolute left-1/2 -translate-x-1/2",
            line === "solid" ? "w-0.5 bg-[color-mix(in_srgb,var(--m-muted)_40%,transparent)]" : "w-0 border-l-2 border-dashed border-[var(--m-warn-line)]/60",
            cap === "top" ? "bottom-0 top-[9px]" : cap === "bottom" ? "top-0 h-[9px]" : "inset-y-0",
          )}
        />
      ) : null}
      {dot !== "none" ? (
        <span
          className={cn(
            "absolute left-1/2 top-[3px] z-10 -translate-x-1/2 rounded-full",
            dot === "start" && "size-2.5 border-2 border-[var(--m-forest)] bg-[var(--m-tile)]",
            dot === "mid" && "top-1 size-2 border border-[var(--m-muted)] bg-[var(--m-tile)]",
            dot === "end" &&
              "size-2.5 bg-[var(--m-forest)] ring-4 ring-[color-mix(in_srgb,var(--m-forest)_16%,transparent)]",
          )}
        />
      ) : null}
    </div>
  );
}

function Stop({
  time,
  shift,
  code,
  rail,
  strong,
  right,
}: {
  time: string;
  shift: number;
  code: string;
  rail: Rail;
  strong?: boolean;
  right?: ReactNode;
}) {
  const name = airportName(code);
  return (
    <>
      <div
        className={cn(
          "whitespace-nowrap pt-px text-right font-medium tabular-nums",
          !strong && "text-[var(--m-ink-2)]",
        )}
      >
        {time || "—"}
        <Plus shift={shift} />
      </div>
      <RailCell {...rail} />
      <div className="flex min-w-0 items-baseline justify-between gap-2 pb-1.5">
        <div className="min-w-0 truncate">
          <span className="font-semibold">{code}</span>
          {name ? <span className="ml-1.5 text-[var(--m-muted)]">{name}</span> : null}
        </div>
        {right}
      </div>
    </>
  );
}

function Flight({ leg, track, phone }: { leg: FlightLeg; track?: TrackAnswer; phone: boolean }) {
  return (
    <>
      <div className="whitespace-nowrap py-0.5 text-right text-[11.5px] tabular-nums text-[var(--m-muted)]">
        {leg.minutes !== null ? durationText(leg.minutes) : ""}
      </div>
      <RailCell dot="none" line="solid" />
      <div className="flex flex-wrap items-center gap-1.5 pb-1.5 pt-0.5 text-[11.5px] text-[var(--m-muted)]">
        {leg.number ? (
          <span className="rounded-md border border-[var(--m-line)] bg-[var(--m-card,transparent)] px-1.5 py-px font-medium tabular-nums text-[var(--m-ink)]">
            {leg.number}
          </span>
        ) : null}
        {leg.carrier ? <span>{leg.carrier}</span> : null}
        {track ? <LiveFlight t={trackFor(track, leg)} setUp={track.setUp} phone={phone} /> : null}
      </div>
    </>
  );
}

function Layover({ minutes }: { minutes: number }) {
  return (
    <>
      <div className="whitespace-nowrap py-0.5 text-right text-[11.5px] font-medium tabular-nums text-[var(--m-warn-line)]">
        {durationText(minutes)}
      </div>
      <RailCell dot="none" line="dashed" />
      <div className="pb-1.5 pt-0.5">
        <span className="inline-flex h-5 items-center gap-1 rounded-md bg-[var(--m-warn-soft)] px-1.5 text-[11.5px] font-medium text-[var(--m-warn)]">
          <Icons.Clock className="size-3" aria-hidden />
          Connect in airport
        </span>
      </div>
    </>
  );
}

/** The open row's body: every airport and flight of the journey, top to bottom. */
export function JourneyTimeline({
  journey: j,
  phone,
  track,
}: {
  journey: Journey;
  phone: boolean;
  track?: TrackAnswer;
}) {
  const n = j.legs.length;
  const last = j.legs[n - 1];
  const arrivesLater = dayOf(last.arr!) !== dayOf(j.dep);
  const shift = (stamp: string) => shiftOf(stamp, j.dep);
  return (
    <div className={cn("px-2.5 pb-1.5 pt-0.5 text-[12.5px]", phone ? "pl-2" : "pl-3")}>
      <div
        className="grid items-baseline gap-x-2"
        style={{ gridTemplateColumns: `${phone ? 78 : 90}px 14px minmax(0,1fr)` }}
      >
        {j.legs.map((leg, i) => (
          <Fragment key={i}>
            <Stop
              time={timeOf(leg.dep)}
              shift={shift(leg.dep)}
              code={leg.from!}
              rail={{ dot: i === 0 ? "start" : "mid", line: "solid", cap: i === 0 ? "top" : undefined }}
              strong={i === 0}
            />
            <Flight leg={leg} track={track} phone={phone} />
            {i === n - 1 ? (
              <Stop
                time={timeOf(leg.arr)}
                shift={shift(leg.arr!)}
                code={leg.to!}
                rail={{ dot: "end", line: "solid", cap: "bottom" }}
                strong
                right={
                  arrivesLater ? (
                    <span className="shrink-0 whitespace-nowrap rounded-md bg-[var(--m-track)] px-1.5 py-px text-[11px] text-[var(--m-ink-2)]">
                      Arrives {weekdayDay(leg.arr!)}
                    </span>
                  ) : null
                }
              />
            ) : (
              <>
                <Stop
                  time={timeOf(leg.arr)}
                  shift={shift(leg.arr!)}
                  code={leg.to!}
                  rail={{ dot: "mid", line: "solid" }}
                />
                <Layover minutes={j.layovers[i]} />
              </>
            )}
          </Fragment>
        ))}
      </div>
      <div className="pb-0.5 pt-1 text-[11px] text-[var(--m-muted)]">All times are local</div>
    </div>
  );
}
