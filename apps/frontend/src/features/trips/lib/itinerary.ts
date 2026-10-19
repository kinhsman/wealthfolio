// money-hub patch: Trips, a flight booking read as journeys (owner, 2026-10-19: "upgrade the flight display to look
// like this"). A booking's legs ("ORD to TPE", "TPE to DAD") chain into one journey when each lands where the next
// leaves, so a connection reads as one trip with a layover instead of two unrelated rows. Pure; only types come from
// trips.ts (trips.ts imports this file for its day rows).
import { airlineOf } from "./airlines";
import type { Leg } from "./trips";

/** Airports by the zone their clocks keep; the times a flight prints are the airport's own. */
const ZONES: Record<string, string> = {
  "America/Chicago": "ORD MDW DFW DAL IAH HOU AUS SAT MSP MCI STL MSY MKE OMA MEM BNA OKC",
  "America/New_York": "JFK LGA EWR BOS ATL MIA FLL MCO TPA DCA IAD BWI PHL CLT DTW CLE PIT RDU JAX CVG IND",
  "America/Denver": "DEN SLC ABQ BOI COS",
  "America/Phoenix": "PHX TUS",
  "America/Los_Angeles": "LAX SFO SJC OAK SEA PDX SAN LAS SMF SNA BUR",
  "Pacific/Honolulu": "HNL OGG KOA LIH",
  "America/Anchorage": "ANC",
  "America/Toronto": "YYZ YUL YOW",
  "America/Mexico_City": "MEX CUN GDL",
  "Europe/London": "LHR LGW MAN",
  "Europe/Paris": "CDG ORY AMS FRA MUC FCO MAD BCN ZRH",
  "Asia/Ho_Chi_Minh": "SGN HAN DAD CXR PQC VCA HUI VII UIH DLI HPH VDO",
  "Asia/Bangkok": "BKK DMK HKT CNX",
  "Asia/Singapore": "SIN KUL",
  "Asia/Taipei": "TPE",
  "Asia/Hong_Kong": "HKG",
  "Asia/Seoul": "ICN GMP",
  "Asia/Tokyo": "NRT HND KIX",
  "Asia/Manila": "MNL",
};
const ZONE_OF = new Map(
  Object.entries(ZONES).flatMap(([zone, codes]) => codes.split(" ").map((c) => [c, zone] as const)),
);

/** The airports' names as travellers say them; an airport not listed shows its code alone. */
const NAMES: Record<string, string> = {
  ORD: "Chicago O'Hare Intl",
  MDW: "Chicago Midway",
  DFW: "Dallas/Fort Worth Intl",
  DAL: "Dallas Love Field",
  IAH: "Houston Intercontinental",
  HOU: "Houston Hobby",
  AUS: "Austin-Bergstrom",
  MSP: "Minneapolis-St Paul",
  DEN: "Denver Intl",
  PHX: "Phoenix Sky Harbor",
  LAS: "Las Vegas Harry Reid",
  LAX: "Los Angeles Intl",
  SFO: "San Francisco Intl",
  SAN: "San Diego Intl",
  SEA: "Seattle-Tacoma Intl",
  JFK: "New York JFK",
  LGA: "New York LaGuardia",
  EWR: "Newark Liberty",
  BOS: "Boston Logan",
  ATL: "Atlanta Hartsfield-Jackson",
  MIA: "Miami Intl",
  DTW: "Detroit Metro",
  TPE: "Taipei Taoyuan",
  DAD: "Da Nang Intl",
  SGN: "Ho Chi Minh Tan Son Nhat",
  HAN: "Hanoi Noi Bai",
  CXR: "Nha Trang Cam Ranh",
  PQC: "Phu Quoc Intl",
  HKG: "Hong Kong Intl",
  ICN: "Seoul Incheon",
  NRT: "Tokyo Narita",
  HND: "Tokyo Haneda",
  KIX: "Osaka Kansai",
  SIN: "Singapore Changi",
  BKK: "Bangkok Suvarnabhumi",
  MNL: "Manila Ninoy Aquino",
  LHR: "London Heathrow",
  CDG: "Paris Charles de Gaulle",
};

export const airportName = (code: string): string => NAMES[code] ?? "";

/** The zone an airport's clocks keep, or null when it is not listed. */
export const airportZone = (code: string | null | undefined): string | null => (code ? ZONE_OF.get(code) ?? null : null);

/** The part of a stamp's wall clock as milliseconds (the airport's own time, no zone applied). */
function wallMs(stamp: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(stamp);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0)) : null;
}

/** The moment a printed time is (ms), read in the airport's zone; null when the airport is not listed. */
export function momentOf(stamp: string, code: string | null): number | null {
  const zone = code ? ZONE_OF.get(code) : undefined;
  const wall = wallMs(stamp);
  if (!zone || wall === null) return null;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  const offsetAt = (ms: number) => {
    const p = fmt.formatToParts(new Date(ms));
    const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
    return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - ms;
  };
  return wall - offsetAt(wall - offsetAt(wall));
}

export interface FlightLeg {
  from: string | null;
  to: string | null;
  /** "EVA Air", else whatever the leg said before the flight number. */
  carrier: string;
  /** "BR55", or "" when the leg names no flight number. */
  number: string;
  dep: string;
  arr: string | null;
  /** Time in the air, when both airports' clocks are known. */
  minutes: number | null;
}

export interface Journey {
  legs: FlightLeg[];
  /** Minutes on the ground after each leg but the last. */
  layovers: number[];
  dep: string;
  arr: string | null;
  /** Door to door, when it can be worked out. */
  minutes: number | null;
  /** The airports it stops at on the way. */
  stops: string[];
  /** Every leg names its airports and both times, so the itinerary can be drawn. */
  rich: boolean;
}

/** "ORD to TPE" / "ORD → TPE" / "ORD - TPE": the two airport codes. */
export function routeOf(title: string): { from: string; to: string } | null {
  const m = /\b([A-Z]{3})\b\s*(?:to|→|->|–|—|-)\s*\b([A-Z]{3})\b/.exec(title);
  return m ? { from: m[1], to: m[2] } : null;
}

/**
 * "EVA Air BR 55" gives the carrier and the number: the last two-character code and digits are the number. A line
 * with the airline's name and no code, "Frontier 3243", takes the listed airline's code: F93243.
 */
export function carrierOf(sub: string): { carrier: string; number: string } {
  const t = sub.trim();
  const m = /^(.*?)[\s,;·-]*\b([A-Z][A-Z0-9]|[0-9][A-Z])\s?(\d{1,4})\s*$/.exec(t);
  if (m) return { carrier: m[1].trim(), number: `${m[2]}${m[3]}` };
  const named = /^(.*?)[\s,;·#-]*(\d{1,4})\s*$/.exec(t);
  const code = named && named[1] ? airlineOf(named[1]) : null;
  return named && code ? { carrier: named[1].trim(), number: `${code}${named[2]}` } : { carrier: t, number: "" };
}

const sane = (ms: number | null) => (ms !== null && ms > 0 && ms < 48 * 3_600_000 ? Math.round(ms / 60_000) : null);

function flightLeg(leg: Leg): FlightLeg | null {
  if (!leg.start) return null;
  const route = routeOf(leg.title);
  const from = route?.from ?? null;
  const to = route?.to ?? null;
  const dep = momentOf(leg.start, from);
  const arr = leg.end ? momentOf(leg.end, to) : null;
  return {
    from,
    to,
    ...carrierOf(leg.sub || ""),
    dep: leg.start,
    arr: leg.end,
    minutes: dep !== null && arr !== null ? sane(arr - dep) : null,
  };
}

/** Longest wait that still counts as a connection (an overnight stop does; a day or more is a new trip). */
const CONNECTION_MIN = 24 * 60;

/**
 * The legs as journeys, in the order they leave. A leg joins the journey before it when it leaves the airport that
 * one landed at, within a day of it landing.
 */
export function journeysOf(legs: Leg[]): Journey[] {
  const flown = legs
    .map(flightLeg)
    .filter((l): l is FlightLeg => l !== null)
    .sort((a, b) => a.dep.localeCompare(b.dep));
  const groups: FlightLeg[][] = [];
  for (const l of flown) {
    const g = groups.at(-1);
    const prev = g?.at(-1);
    const gap =
      prev?.arr && prev.to && prev.to === l.from
        ? (wallMs(l.dep)! - wallMs(prev.arr)!) / 60_000
        : null;
    if (g && gap !== null && gap >= 0 && gap <= CONNECTION_MIN) g.push(l);
    else groups.push([l]);
  }
  return groups.map((g) => {
    const first = g[0];
    const last = g[g.length - 1];
    const layovers = g.slice(1).map((l, i) => (wallMs(l.dep)! - wallMs(g[i].arr!)!) / 60_000);
    const start = momentOf(first.dep, first.from);
    const end = last.arr ? momentOf(last.arr, last.to) : null;
    const flying = g.every((l) => l.minutes !== null);
    return {
      legs: g,
      layovers,
      dep: first.dep,
      arr: last.arr,
      minutes:
        start !== null && end !== null
          ? sane(end - start)
          : flying
            ? g.reduce((n, l) => n + l.minutes!, 0) + layovers.reduce((n, m) => n + m, 0)
            : null,
      stops: g.slice(1).map((l) => l.from ?? ""),
      rich: g.every((l) => l.from && l.to && l.arr),
    };
  });
}

/** "23h 10m", "55m", "4h". */
export function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/** The airlines on a journey, "EVA Air" or "EVA Air + China Airlines" (each once, in order). */
export function carriersText(j: Journey): string {
  return [...new Set(j.legs.map((l) => l.carrier).filter(Boolean))].join(" + ");
}
