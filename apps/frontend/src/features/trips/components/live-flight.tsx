// money-hub patch: Trips, a flight's live panel under its chip in the itinerary (owner, 2026-10-19: "add flight
// tracker feature to money app Trips"). Says where the plane is (at the gate, in the air, out of reach over an ocean,
// landed), how high and fast, how far to go and when it should land by its speed now, and draws the route with the
// part flown so far. Data: lib/flight-track.ts. Shown only from 90 minutes before it leaves.
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
    </svg>
  );
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
    case "landed":
      return { text: t.to ? `Landed in ${t.to}` : "Landed", live: false };
    default:
      return { text: "", live: false };
  }
}

export function LiveFlight({ t, setUp, phone }: { t: TrackLeg | null; setUp: boolean; phone: boolean }) {
  if (!t || t.phase === "later" || t.phase === "done") return null;
  if (!setUp)
    return (
      <p className="text-[11.5px] text-[var(--m-muted)]">
        Live tracking is off. Add your OpenSky login on Settings, Appearance.
      </p>
    );
  const s = t.state;
  const head = headline(t);
  const toZone = airportZone(t.to);
  const facts: string[] = [];
  if (s && t.phase === "air") {
    if (s.altM !== null) facts.push(`${feet(s.altM).toLocaleString("en-US")} ft`);
    if (s.speedMs !== null) facts.push(`${mph(s.speedMs)} mph`);
  }
  const lines: string[] = [...facts];
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
      {t.phase !== "waiting" ? <RouteMap t={t} /> : null}
      {lines.length ? (
        <div className="text-[11.5px] tabular-nums text-[var(--m-muted)]">{lines.join(" · ")}</div>
      ) : null}
      {t.error ? <div className="text-[11.5px] text-[var(--m-warn)]">{t.error}</div> : null}
    </div>
  );
}

/** A small pill for the closed row: In the air / Landed, so a live flight is seen without opening it. */
export function LivePill({ legs, phone }: { legs: (TrackLeg | null)[]; phone: boolean }) {
  const air = legs.find((t) => t?.phase === "air" || t?.phase === "quiet" || t?.phase === "gate");
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
