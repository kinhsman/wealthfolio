// money-hub patch: Trips, live flight tracking (owner, 2026-10-19: "add flight tracker feature to money app Trips").
// Where a booked flight is right now, from the money-hub service (server/drive-backup/lib/flightTrack.js), which asks
// the OpenSky Network with the owner's free login. The page asks once a minute, and only while a flight of the booking
// is about to leave or in the air, so a trip months away costs nothing. Plus the pure bits that draw it.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { momentOf, routeOf } from "./itinerary";
import type { Booking } from "./trips";

export type Phase = "later" | "waiting" | "gate" | "air" | "quiet" | "landed" | "done";

export interface PlaneState {
  icao24: string;
  callsign: string;
  lat: number | null;
  lon: number | null;
  /** Metres. */
  altM: number | null;
  onGround: boolean;
  /** Metres a second over the ground. */
  speedMs: number | null;
  heading: number | null;
  climbMs: number | null;
  /** When the plane last said where it was (ms). */
  at: number;
}

export interface TrackLeg {
  index: number;
  title: string;
  /** The printed departure, as on the booking ("2026-12-05T23:30"). */
  start: string | null;
  /** "BR 55", or null when the flight names no number. */
  callsign: string | null;
  from: string | null;
  to: string | null;
  fromPlace: [number, number] | null;
  toPlace: [number, number] | null;
  dep: number | null;
  arr: number | null;
  phase: Phase;
  state: PlaneState | null;
  /** Where it has flown this flight, [lat, lon]. */
  path: [number, number][];
  kmLeft?: number | null;
  kmTotal?: number | null;
  progress?: number | null;
  /** Landing by the speed it flies now (ms). */
  eta?: number | null;
  /** A live map of the plane (ADS-B Exchange). */
  map: string | null;
  error: string | null;
}

export interface TrackAnswer {
  setUp: boolean;
  creditsLeft: number | null;
  legs: TrackLeg[];
}

async function call<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error((data as { error?: string }).error || `The money app helper said ${res.status}`);
  return data as T;
}

/** How long before a flight leaves and after it lands the tracker looks (the service uses the same). */
const LEAD_MS = 90 * 60_000;
const TAIL_MS = 90 * 60_000;
const LONGEST_MS = 20 * 3_600_000;

/** Whether any flight of the booking is about to leave or in the air at `now` (pure). */
export function watchNow(b: Booking, now = Date.now()): boolean {
  if (b.kind !== "flight") return false;
  return b.legs.some((l) => {
    const route = routeOf(l.title);
    if (!l.start || !route) return false;
    const dep = momentOf(l.start, route.from);
    if (dep === null) return false;
    const arr = l.end ? momentOf(l.end, route.to) : null;
    const until = arr !== null && arr > dep ? arr + TAIL_MS : dep + LONGEST_MS;
    return now >= dep - LEAD_MS && now <= until;
  });
}

export const TRACK_KEY = (id: string) => ["money-hub", "trips", "track", id] as const;

/** The booking's flights, live; asks only while one is near (and once a minute then). */
export function useFlightTrack(b: Booking) {
  const on = watchNow(b);
  return useQuery({
    queryKey: TRACK_KEY(b.id),
    queryFn: () => call<TrackAnswer>(`/api/money-hub/trips/bookings/${encodeURIComponent(b.id)}/track`),
    enabled: on,
    refetchInterval: on ? 60_000 : false,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
    retry: false,
  });
}

/** The track for one flight of the journey: the same airport and printed departure. */
export function trackFor(
  answer: TrackAnswer | undefined,
  leg: { from: string | null; dep: string },
): TrackLeg | null {
  return answer?.legs.find((t) => t.from === leg.from && t.start === leg.dep) ?? null;
}

// --------------------------------------------------------------- the login --

const KEY_URL = "/api/money-hub/flight-track/key";
export const OPENSKY_KEY = ["money-hub", "flight-track", "key"] as const;

export function useOpenSkyKey() {
  return useQuery({
    queryKey: OPENSKY_KEY,
    queryFn: () => call<{ clientId: string | null; set: boolean }>(KEY_URL),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useSetOpenSkyKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { clientId: string; clientSecret: string }) =>
      call<{ clientId: string | null; set: boolean }>(KEY_URL, "PUT", v),
    onSuccess: (data) => qc.setQueryData(OPENSKY_KEY, data),
  });
}

// ------------------------------------------------------------- the words --

export const feet = (m: number) => Math.round((m * 3.28084) / 100) * 100;
export const mph = (ms: number) => Math.round(ms * 2.23694);
export const miles = (km: number) => Math.round(km * 0.621371);

/** "3:12 PM" in an airport's own zone (else the viewer's). */
export function clockIn(ms: number, zone: string | null): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone ?? undefined }).format(
    new Date(ms),
  );
}

/** "12 min early", "1h 5m late", "on time" (within 5 minutes), against the landing time on the booking. */
export function lateText(eta: number, arr: number | null): string | null {
  if (arr === null) return null;
  const min = Math.round((eta - arr) / 60_000);
  if (Math.abs(min) <= 5) return "on time";
  const a = Math.abs(min);
  const t = a >= 60 ? `${Math.floor(a / 60)}h ${a % 60}m` : `${a} min`;
  return min < 0 ? `${t} early` : `${t} late`;
}

/** "4 min ago", "2h 10m ago". */
export function agoText(ms: number, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - ms) / 60_000));
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m ago` : `${min} min ago`;
}

// --------------------------------------------------------------- the map --

const rad = Math.PI / 180;

/** Points along the shortest route between two places, [lat, lon] (pure). */
export function greatCircle(a: [number, number], b: [number, number], n = 32): [number, number][] {
  const [la1, lo1, la2, lo2] = [a[0] * rad, a[1] * rad, b[0] * rad, b[1] * rad];
  const d =
    2 *
    Math.asin(
      Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2),
    );
  if (!d) return [a, b];
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
    const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
    const z = A * Math.sin(la1) + B * Math.sin(la2);
    out.push([Math.atan2(z, Math.hypot(x, y)) / rad, Math.atan2(y, x) / rad]);
  }
  return out;
}

/**
 * Places fitted into a w x h box (pure): longitudes kept on the same side of the date line as the first place,
 * east-west squeezed by the latitude so the shape looks right. Returns a function from [lat, lon] to [x, y].
 */
export function fitter(points: [number, number][], w: number, h: number, pad = 10) {
  const lon0 = points[0]?.[1] ?? 0;
  const unwrap = (lon: number) => lon0 + ((((lon - lon0 + 540) % 360) + 360) % 360) - 180;
  const lats = points.map((p) => p[0]);
  const lons = points.map((p) => unwrap(p[1]));
  const k = Math.cos(((Math.min(...lats) + Math.max(...lats)) / 2) * rad) || 1;
  const minX = Math.min(...lons) * k;
  const maxX = Math.max(...lons) * k;
  const minY = Math.min(...lats);
  const maxY = Math.max(...lats);
  const scale = Math.min((w - 2 * pad) / (maxX - minX || 1), (h - 2 * pad) / (maxY - minY || 1));
  const offX = (w - (maxX - minX) * scale) / 2;
  const offY = (h - (maxY - minY) * scale) / 2;
  return (p: [number, number]): [number, number] => [
    offX + (unwrap(p[1]) * k - minX) * scale,
    h - (offY + (p[0] - minY) * scale),
  ];
}
