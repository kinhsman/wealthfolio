// money-hub patch: Settings, Alerts with fixture answers, for a true-size picture of the Trips check-in card before
// shipping (vite.preview.config.ts). ?theme=light|dark. Every call is answered here, nothing is sent.
import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "../src/globals.css";
import "../src/i18n/i18n";

import { TooltipProvider } from "@wealthfolio/ui";
import AlertsPage from "../src/pages/settings/alerts/alerts-page";

const on = (extra: Record<string, boolean> = {}) => ({ on: true, ...extra });
const view = {
  big: { alerts: on({ out: true, in: true }), outMin: 500, inMin: 1000 },
  budget: { alerts: on({ near: true, over: true }), nearPct: 80 },
  connections: { alerts: on({ signIn: true, broken: true, back: true, expiring: true, replaced: true }), down: 0 },
  recap: { alerts: on({ weekly: true }) },
  cards: { alerts: on({ dueSoon: true, overdue: true }), daysBefore: 3 },
  loans: { alerts: on({ renewSoon: true, renewToday: true }), daysBefore: 7 },
  upkeep: { alerts: on({ soon: true, overdue: true, miles: true }), daysBefore: 7 },
  receipts: { alerts: on({ filed: true }) },
  trips: { alerts: on({ checkin: true }), hoursBefore: 36 },
  last: null,
};
const status = {
  discord: { on: true, shown: "…a1b2c3" },
  ntfy: { on: true, server: "https://ntfy.sh", topic: "money", hasToken: false, priority: 3 },
  push: { on: true, devices: 1, publicKey: null },
  last: null,
};
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/api/money-hub/money-alerts")) {
    if ((init?.method || "GET") === "PUT") return json({ ...view, trips: { ...view.trips, ...JSON.parse(String(init?.body ?? "{}")) } });
    return json(view);
  }
  if (url.includes("/api/money-hub/alerts")) return json(status);
  if (url.startsWith("/api/")) return json({ alerts: { on: true }, bills: { days: 3 }, totals: { cushion: 0 } });
  return realFetch(input, init);
};

const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <MemoryRouter initialEntries={["/settings/alerts"]}>
          <AlertsPage />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
