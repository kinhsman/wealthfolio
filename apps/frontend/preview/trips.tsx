// money-hub patch: the Trips page with fixture data, for a true-size picture before shipping (vite.preview.config.ts).
// ?theme=light|dark; ?case=full (default) | empty (no bookings) | none (no trips). The Dallas figures are the owner's
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
// The real trip is Oct 30 to Nov 1, 2026; the picture puts it 15 days from today.
const start = day(15);
const mid = day(16);
const end = day(17);

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
    id: "b2",
    kind: "stay",
    title: "Hotel in Dallas",
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
