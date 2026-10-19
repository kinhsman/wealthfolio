// money-hub patch: Trips, a flight's live panel under its chip in the itinerary (owner, 2026-10-19: "add flight
// tracker feature to money app Trips"). Says where the plane is (at the gate, in the air, out of reach over an ocean,
// landed), how high and fast, how far to go and when it should land by its speed now, and draws the route with the
// part flown so far. Data: lib/flight-track.ts. Shown only from 90 minutes before it leaves.
import { useState } from "react";

import { cn } from "@/lib/utils";
import { Icons } from "@wealthfolio/ui";

import { airportZone } from "../lib/itinerary";
import {
  agoText,
  clockIn,
  feet,
  fitter,
  greatCircle,
  lateText,
  miles,
  mph,
  useFlightToday,
  type TrackLeg,
} from "../lib/flight-track";

const W = 300;
const H = 84;

/** The route drawn small: planned line dashed, flown part solid, the plane where it is. */
function RouteMap({ t }: { t: TrackLeg }) {
  if (!t.fromPlace || !t.toPlace) return null;
  const planned = greatCircle(t.fromPlace, t.toPlace);
  const here: [number, number] | null =
    t.state && t.state.lat !== null && t.state.lon !== null ? [t.state.lat, t.state.lon] : null;
  const flown = t.path.length > 1 ? t.path : here ? [t.fromPlace, here] : [];
  const fit = fitter([...planned, ...flown, ...(here ? [here] : [])], W, H, 12);
  const line = (pts: [number, number][]) => pts.map((p) => fit(p).map((n) => n.toFixed(1)).join(",")).join(" ");
  const [ax, ay] = fit(t.fromPlace);
  const [bx, by] = fit(t.toPlace);
  const plane = here ? fit(here) : null;
  const landed = t.phase === "landed";
  // Never heard but should be flying: where the schedule puts it, drawn hollow as a guess.
  const guess =
    !here && t.phase === "unseen" && t.progress != null
      ? fit(planned[Math.round(t.progress * (planned.length - 1))])
      : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[84px] w-full" role="img" aria-label={`Route ${t.from} to ${t.to}`}>
      <polyline
        points={line(planned)}
        fill="none"
        stroke="color-mix(in srgb, var(--m-muted) 55%, transparent)"
        strokeWidth="1.5"
        strokeDasharray="3 4"
      />
      {flown.length > 1 ? (
        <polyline points={line(flown)} fill="none" stroke="var(--m-forest)" strokeWidth="2.25" strokeLinecap="round" />
      ) : null}
      <circle cx={ax} cy={ay} r="3.5" fill="var(--m-tile, #fff)" stroke="var(--m-forest)" strokeWidth="2" />
      <circle cx={bx} cy={by} r="3.5" fill={landed ? "var(--m-forest)" : "var(--m-tile, #fff)"} stroke="var(--m-forest)" strokeWidth="2" />
      <text x={ax} y={ay < H / 2 ? ay + 14 : ay - 7} textAnchor="middle" fontSize="9.5" fontWeight="600" fill="var(--m-muted)">
        {t.from}
      </text>
      <text x={bx} y={by < H / 2 ? by + 14 : by - 7} textAnchor="middle" fontSize="9.5" fontWeight="600" fill="var(--m-muted)">
        {t.to}
      </text>
      {plane && !landed ? (
        <g transform={`translate(${plane[0].toFixed(1)} ${plane[1].toFixed(1)}) rotate(${t.state?.heading ?? 90})`}>
          <circle r="8" fill="color-mix(in srgb, var(--m-forest) 16%, transparent)" />
          {/* A plane pointing up (north), turned to the way it flies. */}
          <path
            d="M0 -6.5 L1.1 -2 L5.5 0.8 L5.5 2 L1.1 0.8 L0.9 4 L2.4 5.4 L2.4 6.3 L0 5.6 L-2.4 6.3 L-2.4 5.4 L-0.9 4 L-1.1 0.8 L-5.5 2 L-5.5 0.8 L-1.1 -2 Z"
            fill="var(--m-forest)"
          />
        </g>
      ) : null}
      {guess ? (
        <circle
          cx={guess[0]}
          cy={guess[1]}
          r="5"
          fill="var(--m-tile, #fff)"
          stroke="var(--m-forest)"
          strokeWidth="1.5"
          strokeDasharray="2 2"
        >
          <title>About here by the schedule</title>
        </circle>
      ) : null}
    </svg>
  );
}

/** "Sun 11:30 PM" in an airport's own zone. */
function weekdayClock(ms: number, zone: string | null): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone ?? undefined,
  }).format(new Date(ms));
}

/** The panel's top line: a dot and what the plane is doing. */
function headline(t: TrackLeg): { text: string; live: boolean } {
  switch (t.phase) {
    case "waiting":
      return { text: "Not seen yet", live: false };
    case "gate":
      return { text: `On the ground at ${t.from}`, live: true };
    case "air":
      return { text: "In the air", live: true };
    case "quiet":
      return { text: "Out of reach", live: false };
    case "unseen":
      return { text: "No signal", live: false };
    case "landed":
      return { text: t.to ? `Landed in ${t.to}` : "Landed", live: false };
    default:
      return { text: "", live: false };
  }
}

export function LiveFlight({
  t,
  setUp,
  phone,
  label,
}: {
  t: TrackLeg | null;
  setUp: boolean;
  phone: boolean;
  /** Set for another day's run of the flight (not the booked one): said on top, and a run still to come is shown. */
  label?: string;
}) {
  if (!t || t.phase === "done" || (t.phase === "later" && !label)) return null;
  if (!setUp)
    return (
      <p className="text-[11.5px] text-[var(--m-muted)]">
        Live tracking is off. Add your OpenSky login on Settings, Appearance.
      </p>
    );
  const s = t.state;
  const toZone = airportZone(t.to);
  const facts: string[] = [];
  if (s && t.phase === "air") {
    if (s.altM !== null) facts.push(`${feet(s.altM).toLocaleString("en-US")} ft`);
    if (s.speedMs !== null) facts.push(`${mph(s.speedMs)} mph`);
  }
  const lines: string[] = [...facts];
  const fromZone = airportZone(t.from);
  if (label && t.dep !== null && t.phase !== "later")
    lines.push(`left ${t.from} ${weekdayClock(t.dep, fromZone)}`);
  if (t.phase === "later" && t.dep !== null)
    lines.push(`leaves ${t.from} ${weekdayClock(t.dep, fromZone)}, live from 90 minutes before`);
  if (t.phase === "unseen") {
    if (t.arr !== null && Date.now() > t.arr) lines.push(`should have landed at ${clockIn(t.arr, toZone)}`);
    else {
      if (t.progress != null) lines.push(`about ${Math.round(t.progress * 100)}% of the way by the schedule`);
      if (t.arr !== null) lines.push(`due ${clockIn(t.arr, toZone)}`);
    }
    lines.push("no receiver hears it right now, usual over an ocean");
  }
  if (t.phase === "waiting")
    lines.push("It shows here once the plane turns its transponder on, usually at the gate.");
  if (t.phase === "air" || t.phase === "quiet") {
    if (t.kmLeft != null) lines.push(`${miles(t.kmLeft).toLocaleString("en-US")} mi to go`);
    if (t.phase === "air" && t.eta) {
      const late = lateText(t.eta, t.arr);
      lines.push(`lands about ${clockIn(t.eta, toZone)}${late ? ` (${late})` : ""}`);
    }
    if (t.phase === "quiet" && s) lines.push(`last seen ${agoText(s.at)}, often the case over an ocean`);
  }
  if (t.phase === "landed" && s) lines.push(`at ${clockIn(s.at, toZone)} local`);
  const head = t.phase === "later" ? { text: "Not left yet", live: false } : headline(t);
  return (
    <div className="mt-1 w-full max-w-[460px] rounded-lg border border-[var(--m-line)] bg-[var(--m-card,transparent)] px-2.5 py-1.5">
      <div className="flex items-center gap-2 text-[12px]">
        <span className="relative flex size-2 shrink-0" aria-hidden>
          {head.live ? (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--m-forest)] opacity-50" />
          ) : null}
          <span
            className={cn(
              "relative inline-flex size-2 rounded-full",
              head.live ? "bg-[var(--m-forest)]" : "bg-[var(--m-muted)]",
            )}
          />
        </span>
        <span className="truncate font-medium text-[var(--m-ink)]">{head.text}</span>
        {t.callsign && !phone ? <span className="shrink-0 text-[var(--m-muted)]">{t.callsign}</span> : null}
        {t.map ? (
          <a
            href={t.map}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-[11.5px] text-[var(--m-forest)] hover:underline"
          >
            {phone ? "Map" : "Live map"}
            <Icons.ExternalLink className="size-3" aria-hidden />
          </a>
        ) : null}
      </div>
      {label ? <div className="text-[11px] font-medium text-[var(--m-ink-2)]">{label}</div> : null}
      {t.phase !== "waiting" && t.phase !== "later" ? <RouteMap t={t} /> : null}
      {lines.length ? (
        <div className="text-[11.5px] tabular-nums text-[var(--m-muted)]">{lines.join(" · ")}</div>
      ) : null}
      {t.error ? <div className="text-[11.5px] text-[var(--m-warn)]">{t.error}</div> : null}
    </div>
  );
}

/** A small pill for the closed row: In the air / Landed, so a live flight is seen without opening it. */
export function LivePill({ legs, phone }: { legs: (TrackLeg | null)[]; phone: boolean }) {
  const air = legs.find(
    (t) => t?.phase === "air" || t?.phase === "quiet" || t?.phase === "gate" || t?.phase === "unseen",
  );
  const done = legs.filter(Boolean).every((t) => t!.phase === "landed");
  if (!air && !(done && legs.some(Boolean))) return null;
  const text = air ? (air.phase === "gate" ? "At gate" : "In the air") : "Landed";
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center gap-1 self-center rounded-md bg-[var(--m-good-soft)] px-1.5 text-[11px] font-medium text-[var(--m-good-ink)]"
      aria-label={phone ? text : undefined}
    >
      {air ? <Icons.Plane className="size-3" aria-hidden /> : <Icons.Check className="size-3" aria-hidden />}
      {phone ? null : text}
    </span>
  );
}

/**
 * "Today's BR55": the same flight number's run that matters now (owner, 2026-10-19: "add a button to show this same
 * flight for today, not the flight i booked"). A small button under the flight; open, a live panel for that run.
 */
export function TodayFlight({
  bookingId,
  legIndex,
  number,
  phone,
}: {
  bookingId: string;
  legIndex: number;
  number: string;
  phone: boolean;
}) {
  const [open, setOpen] = useState(false);
  const q = useFlightToday(bookingId, legIndex, open);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "inline-flex h-5 items-center gap-1 rounded-md border border-dashed border-[var(--m-line)] px-1.5 text-[11px] text-[var(--m-forest)] hover:bg-[var(--m-track)]",
          open && "border-solid bg-[var(--m-track)]",
        )}
      >
        <Icons.Plane className="size-3" aria-hidden />
        {open ? "Hide today's" : phone ? "Today's" : `Today's ${number}`}
      </button>
      {open ? (
        q.isLoading ? (
          <div className="mt-1 w-full max-w-[460px] text-[11.5px] text-[var(--m-muted)]">Looking for today&apos;s {number}...</div>
        ) : q.error ? (
          <div className="mt-1 w-full max-w-[460px] text-[11.5px] text-[var(--m-warn)]">{(q.error as Error).message}</div>
        ) : q.data ? (
          <LiveFlight
            t={q.data.leg}
            setUp={q.data.setUp}
            phone={phone}
            label={`Today's ${number}, not your booked flight`}
          />
        ) : null
      ) : null}
    </>
  );
}
