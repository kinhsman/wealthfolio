// money-hub patch: the Owly trip strip on the Spending dashboard event card, and the Owly trip
// picker in the event window, with fixture data (vite.preview.config.ts).
// ?view=card (default) | form; &case=owed|oweyou|square|empty; &open=1 opens the picker; ?theme=light|dark.
import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "../src/globals.css";
import "../src/i18n/i18n";

import { TooltipProvider } from "@wealthfolio/ui";
import { PrivacyProvider } from "../src/context/privacy-context";
import { EventDialogProvider } from "../src/features/spending/components/event-dialog-provider";
import { EventFormDialog } from "../src/features/spending/components/event-form-dialog";
import { EventsCard } from "../src/features/spending/components/events-card";
import type { OwlyTrip, OwlyTripsAnswer } from "../src/features/spending/lib/owly-trips";
import { FOREST_THEME } from "../src/features/spending/lib/theme";
import type { EventSpendingSummary } from "../src/features/spending/types/event";
import { QueryKeys } from "../src/lib/query-keys";

const params = new URLSearchParams(location.search);
const view = params.get("view") || "card";
const which = params.get("case") || "owed";

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};
// The real event is Oct 30 to Nov 1, 2026; the picture moves it to 20 days from today so the card shows it.
const start = iso(addDays(20));
const end = iso(addDays(22));

const dallas: OwlyTrip = {
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
  totalSpent: 715.43,
  you: { paid: 715.43, share: 357.72 },
  owedToYou: 357.71,
  youOwe: 0,
  transfers: [{ from: "Thanh", to: "Sang", amount: 357.71, youOwe: false, owedToYou: true }],
};
const cases: Record<string, OwlyTrip> = {
  owed: dallas,
  oweyou: {
    ...dallas,
    you: { paid: 120, share: 357.72 },
    owedToYou: 0,
    youOwe: 237.72,
    transfers: [{ from: "Sang", to: "Thanh", amount: 237.72, youOwe: true, owedToYou: false }],
  },
  square: { ...dallas, status: "settled", owedToYou: 0, transfers: [] },
  empty: { ...dallas, billCount: 0, totalSpent: 0, you: { paid: 0, share: 0 }, owedToYou: 0, transfers: [] },
};
const trip = cases[which] ?? dallas;

const others: OwlyTrip[] = [
  { ...dallas, id: 2, name: "Kash bach", billCount: 11, totalSpent: 2210.4, transfers: [], owedToYou: 0 },
  { ...dallas, id: 4, name: "Vegas weekend", billCount: 5, totalSpent: 940.1, transfers: [], owedToYou: 0 },
];
const owly: OwlyTripsAnswer = {
  connected: true,
  baseUrl: "https://owly.sanglam.cc",
  trips: [trip, ...others],
  links: view === "form" ? {} : { "ev-dallas": trip.id },
};

const summary: EventSpendingSummary = {
  eventId: "ev-dallas",
  eventName: "Dallas trip",
  eventTypeId: "travel",
  eventTypeName: "Travel",
  eventTypeColor: null,
  startDate: start,
  endDate: end,
  totalSpending: 715.43,
  transactionCount: 6,
  currency: "USD",
  byCategory: {},
  dailySpending: {},
};

const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
const request = { startDate: iso(addDays(-30)), endDate: iso(addDays(60)) };
qc.setQueryData([QueryKeys.SPENDING_EVENTS, "summaries", request], [summary]);
qc.setQueryData(["owly_trips"], owly);
qc.setQueryData(
  [QueryKeys.SPENDING_EVENT_TYPES],
  [{ id: "travel", key: "Travel", name: "Travel", color: null, createdAt: "", updatedAt: "" }],
);
qc.setQueryDefaults([QueryKeys.SPENDING_TRANSACTIONS], { queryFn: async () => [] });

function Shell() {
  if (view === "form") {
    return (
      <EventFormDialog
        open
        onOpenChange={() => undefined}
        prefill={{ name: "Dallas trip", startDate: new Date(start + "T00:00:00"), endDate: new Date(end + "T00:00:00") }}
      />
    );
  }
  return (
    <div className="mx-auto max-w-[360px] p-3 md:max-w-[420px]">
      <EventsCard
        activities={[]}
        categoriesMeta={new Map()}
        eventSummaryStartDate={request.startDate}
        eventSummaryEndDate={request.endDate}
        periodStartDate={request.startDate}
        periodEndDate={request.endDate}
        theme={FOREST_THEME}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <PrivacyProvider>
        <TooltipProvider>
          <EventDialogProvider>
            <MemoryRouter initialEntries={["/dashboard?tab=spending"]}>
              <Shell />
            </MemoryRouter>
          </EventDialogProvider>
        </TooltipProvider>
      </PrivacyProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
