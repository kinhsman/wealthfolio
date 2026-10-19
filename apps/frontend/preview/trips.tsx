// money-hub patch: the Trips page with fixture data, for a true-size picture before shipping (vite.preview.config.ts).
// ?theme=light|dark; ?case=full (default) | empty (no bookings) | none (no trips) | live (the EVA flight is in the air
// now; ?phase=air (default) | quiet | gate | waiting | landed | off picks what the live panel says). The Dallas figures are the owner's
// real ones (Frontier $115.98, Citi Travel $121.86 = 141.77 + 18.43 - 38.34, Owly 3 hand bills $715.43); flight
// numbers, codes, times, the dinner and the place are sample. Search and read answer from here, nothing is sent.
import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "../src/globals.css";
import "../src/i18n/i18n";

import { TooltipProvider } from "@wealthfolio/ui";
import { PrivacyProvider } from "../src/context/privacy-context";
import { EventDialogProvider } from "../src/features/spending/components/event-dialog-provider";
import type { OwlyTrip, OwlyTripsAnswer } from "../src/features/spending/lib/owly-trips";
import { QueryKeys } from "../src/lib/query-keys";
import TripsPage from "../src/features/trips/pages/trips-page";
import {
  BOOKINGS_KEY,
  STATUS_KEY,
  type Booking,
  type SearchRow,
  type TripCharge,
} from "../src/features/trips/lib/trips";

const params = new URLSearchParams(location.search);
const which = params.get("case") || "full";

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};
const day = (n: number) => iso(addDays(n));
// The real trip is Oct 30 to Nov 1, 2026; the picture puts it 15 days from today (today for case=live).
const live = which === "live";
const start = live ? day(0) : day(15);
const mid = live ? day(1) : day(16);
const end = live ? day(2) : day(17);

const event = {
  id: "ev-dallas",
  name: "Dallas, Worlds 2026",
  description: null,
  eventTypeId: "travel",
  startDate: start,
  endDate: end,
  createdAt: "",
  updatedAt: "",
};
const lastYear = {
  id: "ev-sd",
  name: "San Diego",
  description: null,
  eventTypeId: "travel",
  startDate: day(-200),
  endDate: day(-196),
  createdAt: "",
  updatedAt: "",
};

// case=live: BR 55 left O'Hare six hours ago and is over the Pacific; the Taipei to Da Nang flight is still to come.
const wall = (ms: number, zone: string) => {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(ms));
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
};
const phase = params.get("phase") || "air";
const ago = phase === "landed" ? 16.5 : phase === "gate" || phase === "waiting" ? -0.5 : 6;
const depMs = Date.now() - ago * 3_600_000;
const arrMs = depMs + (15 * 60 + 55) * 60_000;
const liveLegs = [
  { title: "ORD to TPE", sub: "EVA Air BR 55", start: wall(depMs, "America/Chicago"), end: wall(arrMs, "Asia/Taipei") },
  {
    title: "TPE to DAD",
    sub: "EVA Air BR 383",
    start: wall(arrMs + 260 * 60_000, "Asia/Taipei"),
    end: wall(arrMs + 375 * 60_000, "Asia/Ho_Chi_Minh"),
  },
];
const ORD: [number, number] = [41.978, -87.905];
const TPE: [number, number] = [25.08, 121.233];
// A path that goes up past Alaska, like the real one, as far as the plane is now.
const flownPath: [number, number][] = [ORD, [47.5, -97], [54, -112], [59.5, -130], [62.3, -148], [61.5, -162], [58.8, -174]];
const here: [number, number] = phase === "landed" ? TPE : phase === "gate" || phase === "waiting" ? ORD : flownPath.at(-1)!;
const trackAnswer = () => ({
  setUp: phase !== "off",
  creditsLeft: 3800,
  legs: [
    {
      index: 0,
      title: "ORD to TPE",
      start: liveLegs[0].start,
      callsign: "BR 55",
      from: "ORD",
      to: "TPE",
      fromPlace: ORD,
      toPlace: TPE,
      dep: depMs,
      arr: arrMs,
      phase: phase === "off" ? "air" : phase,
      state:
        phase === "waiting"
          ? null
          : {
              icao24: "899089",
              callsign: "EVA055",
              lat: here[0],
              lon: here[1],
              altM: phase === "air" || phase === "quiet" ? 10972 : 0,
              onGround: phase === "gate" || phase === "landed",
              speedMs: phase === "air" || phase === "quiet" ? 262 : 0,
              heading: 238,
              climbMs: 0,
              at: phase === "quiet" ? Date.now() - 48 * 60_000 : phase === "landed" ? arrMs - 9 * 60_000 : Date.now() - 20_000,
            },
      path: phase === "gate" || phase === "waiting" ? [] : phase === "landed" ? [...flownPath, [45, 150], [33, 132], TPE] : flownPath,
      kmLeft: phase === "landed" ? 0 : phase === "gate" || phase === "waiting" ? 11867 : 6388,
      kmTotal: 11867,
      progress: 0.46,
      eta: arrMs - 14 * 60_000,
      map: phase === "waiting" ? null : "https://globe.adsbexchange.com/?icao=899089",
      error: null,
    },
    { index: 1, title: "TPE to DAD", start: liveLegs[1].start, callsign: "BR 383", from: "TPE", to: "DAD", fromPlace: TPE, toPlace: [16.044, 108.199], dep: null, arr: null, phase: "later", state: null, path: [], map: null, error: null },
  ],
});

const base = {
  sub: "",
  start: null,
  end: null,
  legs: [],
  confirmation: null,
  place: null,
  party: null,
  total: null,
  currency: "USD",
  paid: "unknown" as const,
  checkinHours: null,
  freeCancelUntil: null,
  facts: [],
  activityId: null,
  note: "",
  source: null,
  createdAt: "",
  updatedAt: "",
  eventId: "ev-dallas",
};
const bookings: Booking[] = [
  {
    ...base,
    id: "b1",
    kind: "flight",
    title: "Frontier flight to Dallas",
    sub: "Round trip, ORD to DFW",
    start: `${start}T06:05`,
    end: `${end}T22:25`,
    legs: [
      {
        title: "ORD to DFW",
        sub: "Frontier F9 1227",
        start: `${start}T06:05`,
        end: `${start}T08:40`,
      },
      { title: "DFW to ORD", sub: "Frontier F9 1228", start: `${end}T19:40`, end: `${end}T22:25` },
    ],
    confirmation: "HX7QPL",
    checkinHours: 48,
    party: 1,
    total: 115.98,
    paid: "now",
    facts: [
      { k: "Seat", v: "14C" },
      { k: "Bags", v: "1 carry-on" },
    ],
    source: {
      mailboxId: "box1",
      mailbox: "me@gmail.com",
      msgId: "m1",
      from: "Frontier",
      subject: "Trip confirmation HX7QPL",
      date: day(-34),
      link: "https://mail.google.com/",
    },
  },
  {
    ...base,
    id: "b9",
    kind: "flight",
    title: "EVA Air flight to Da Nang",
    sub: "Round trip via Taipei",
    start: `${start}T00:30`,
    end: `${start}T11:40`,
    legs: [
      ...(live
        ? liveLegs
        : [
            { title: "ORD to TPE", sub: "EVA Air BR 55", start: `${start}T00:30`, end: `${mid}T05:25` },
            { title: "TPE to DAD", sub: "EVA Air BR 383", start: `${mid}T09:45`, end: `${mid}T11:40` },
          ]),
    ],
    confirmation: "24T6LP",
    party: 1,
    total: null,
    paid: "later",
  },
  {
    ...base,
    id: "b2",
    kind: "stay",
    title: "Tru by Hilton Plano Hwy 75",
    sub: "2 nights, king room",
    start,
    end,
    confirmation: "CT-48213907",
    party: 2,
    total: 121.86,
    paid: "now",
    freeCancelUntil: day(13),
    facts: [{ k: "Address", v: "1 Main St, Dallas" }],
    source: {
      mailboxId: "box1",
      mailbox: "me@gmail.com",
      msgId: "m2",
      from: "Citi Travel",
      subject: "Booking confirmed CT-48213907",
      date: day(-27),
      link: "https://mail.google.com/",
    },
  },
  {
    ...base,
    id: "b3",
    kind: "food",
    title: "Dinner for 6",
    sub: "Pecan Lodge",
    start: `${mid}T19:30`,
    party: 6,
    paid: "later",
    place: "Pecan Lodge",
  },
];

const charges: TripCharge[] = [
  { id: "c1", label: "FRONTIER AIRLINES", date: day(-34), amount: 115.98, currency: "USD" },
  { id: "c2", label: "CITI TRAVEL HOTEL", date: day(-27), amount: 121.86, currency: "USD" },
  { id: "c3", label: "WORLDS TICKETS", date: day(-27), amount: 334.26, currency: "USD" },
];

const owlyTrip: OwlyTrip = {
  id: 6,
  name: "Dallas - Worlds 2026",
  emoji: null,
  startsOn: null,
  endsOn: null,
  status: "active",
  currency: "USD",
  mixedCurrency: false,
  members: [
    { id: 1, name: "Sang", isOwner: true },
    { id: 2, name: "Thanh", isOwner: false },
  ],
  billCount: 3,
  bills: [],
  totalSpent: 715.43,
  you: { paid: 715.43, share: 357.72 },
  owedToYou: 357.71,
  youOwe: 0,
  transfers: [{ from: "Thanh", to: "Sang", amount: 357.71, youOwe: false, owedToYou: true }],
};
const owly: OwlyTripsAnswer = {
  connected: true,
  baseUrl: "https://owly.sanglam.cc",
  trips: [owlyTrip],
  links: { "ev-dallas": 6 },
  tripBills: {},
};

const row = (o: Partial<SearchRow> & { key: string; subject: string }): SearchRow => ({
  mailboxId: "box1",
  mailbox: "me@gmail.com",
  msgId: o.key,
  from: "Frontier",
  date: day(-30),
  kind: "other",
  code: null,
  amountMatch: false,
  noise: false,
  link: "https://mail.google.com/",
  onTrip: null,
  ...o,
});
const searchRows: SearchRow[] = [
  row({
    key: "ot",
    from: "OpenTable",
    subject: "Reservation for 6 confirmed",
    kind: "food",
    date: day(-1),
  }),
  row({
    key: "ct2",
    from: "Citi Travel",
    subject: "Your stay starts soon",
    kind: "stay",
    date: day(-2),
  }),
  row({
    key: "m1",
    subject: "Trip confirmation HX7QPL",
    kind: "flight",
    code: "HX7QPL",
    onTrip: { bookingId: "b1", eventId: "ev-dallas" },
  }),
  row({
    key: "m2",
    from: "Citi Travel",
    subject: "Booking confirmed CT-48213907",
    kind: "stay",
    code: "CT-48213907",
    amountMatch: true,
    onTrip: { bookingId: "b2", eventId: "ev-dallas" },
  }),
  row({
    key: "gf",
    from: "Google Flights",
    subject: "Prices dropped to Dallas",
    noise: true,
    date: day(-40),
  }),
];
const reads: Record<string, unknown> = {
  ot: {
    booking: true,
    kind: "food",
    title: "Dinner at Pecan Lodge",
    sub: "Party of 6",
    start: `${mid}T19:30`,
    party: 6,
    place: "Pecan Lodge",
    paid: "later",
    lines: ["Your reservation for 6 is confirmed.", "Pay at the table."],
    facts: [{ k: "Table", v: "Patio" }],
  },
  ct2: { booking: false, why: "A reminder of the stay already on the trip, no new booking." },
};

// Search and read answer from here; everything else the page asks for is the seeded cache.
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  if (url.includes("/api/money-hub/trips/search")) {
    await new Promise((r) => setTimeout(r, 400));
    return json({ query: "", rows: searchRows, hidden: 1, errors: [], truncated: false });
  }
  if (url.includes("/api/money-hub/trips/peek")) {
    const key = JSON.parse(String(init?.body ?? "{}")).msgId as string;
    await new Promise((r) => setTimeout(r, 300));
    const hit = searchRows.find((r) => r.key === key);
    return json({
      key: `box1:${key}`,
      email: {
        from: hit?.from ?? "Sender",
        subject: hit?.subject ?? "",
        date: hit?.date ?? day(-1),
        link: "https://mail.google.com/",
        mailbox: "me@gmail.com",
        body: `Hi Sang,\n\nYour reservation for 6 is confirmed.\n\nWhen: Saturday, ${mid} at 7:30 PM\nWhere: Pecan Lodge, 2702 Main St, Dallas\nParty size: 6\nPay at the table.\n\nSee you there,\nThe team`,
      },
    });
  }
  if (url.includes("/api/money-hub/trips/read")) {
    const key = JSON.parse(String(init?.body ?? "{}")).msgId as string;
    await new Promise((r) => setTimeout(r, 500));
    return json({
      key: `box1:${key}`,
      email: {
        from: "OpenTable",
        subject: "Reservation",
        date: day(-1),
        link: null,
        mailbox: "me@gmail.com",
      },
      read: reads[key] ?? { booking: false, why: "Not a booking." },
    });
  }
  if (url.includes("/api/money-hub/trips/bookings/b9/track")) return json(trackAnswer());
  if (url.includes("/api/money-hub/trips/bookings/") && url.endsWith("/track"))
    return json({ setUp: true, creditsLeft: 3800, legs: [] });
  if (url.includes("/api/money-hub/logo-key")) return json({ key: "pk_FHt7GAy8SDi6PcR_DZGWmg" });
  if (url.includes("/api/money-hub/merchants"))
    return json([
      {
        id: "h",
        name: "Hilton",
        pattern: "hilton",
        patterns: ["hilton"],
        logoUrl: "https://img.logo.dev/hilton.com?token=pk_FHt7GAy8SDi6PcR_DZGWmg&size=128&format=png",
      },
    ]);
  if (url.startsWith("/api/money-hub/")) return json({});
  return realFetch(input, init);
};

const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
qc.setQueryData(
  [QueryKeys.SPENDING_EVENT_TYPES],
  [{ id: "travel", key: "travel", name: "Travel", color: null, createdAt: "", updatedAt: "" }],
);
qc.setQueryData([QueryKeys.SPENDING_EVENTS], which === "none" ? [] : [event, lastYear]);
qc.setQueryData(BOOKINGS_KEY, which === "empty" ? [] : bookings);
qc.setQueryData(STATUS_KEY, { mailboxes: [{ id: "box1", email: "me@gmail.com" }], ai: true });
qc.setQueryData(["owly_trips"], owly);
qc.setQueryData(["spending_transactions", "trip-charges", "ev-dallas", start, end], charges);
qc.setQueryDefaults([QueryKeys.SPENDING_TRANSACTIONS], { queryFn: async () => [] });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <PrivacyProvider>
        <TooltipProvider>
          <EventDialogProvider>
            <MemoryRouter initialEntries={["/trips"]}>
              <TripsPage />
            </MemoryRouter>
          </EventDialogProvider>
        </TooltipProvider>
      </PrivacyProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
