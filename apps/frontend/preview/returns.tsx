// money-hub patch: the Returns timeline with fixture data, for a picture before shipping (vite.preview.config.ts).
// ?view=page|window|google|alerts, ?id=r9 (the window's return), ?theme=light|dark, ?skin=meadow|bronze, ?emails=off,
// ?side=244 (the app's sidebar beside the page). The fixture is sample returns at the owner's real stores with
// the steps the money-hub service makes from them (preview/returns-steps.fixture.json, not committed).
import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "../src/globals.css";
import "../src/i18n/i18n";

import { TooltipProvider } from "@wealthfolio/ui";
import { PrivacyProvider } from "../src/context/privacy-context";
import { TrackReturnHost } from "../src/features/spending/components/track-return-dialog";
import {
  RETURN_EMAILS_KEY,
  RETURNS_KEY,
  trackReturnStore,
  type ReturnsView,
} from "../src/features/spending/lib/returns";
import SpendingReturnsPage from "../src/features/spending/pages/spending-returns-page";
import AlertsSettingsPage from "../src/pages/settings/alerts/alerts-page";
import GoogleSettingsPage from "../src/pages/settings/google/google-page";
import { QueryKeys } from "../src/lib/query-keys";
import fixture from "./returns-steps.fixture.json";

const params = new URLSearchParams(location.search);
const view = params.get("view") || "page";
const emailsOn = params.get("emails") !== "off";

const mailboxes = [
  {
    id: "ef0e2c6f6863",
    email: "sanglt3008@gmail.com",
    linkedAt: "2026-10-02T12:00:00Z",
    error: null,
  },
  {
    id: "52c115b1a499",
    email: "tilltheendofthetime@gmail.com",
    linkedAt: "2026-10-02T12:00:00Z",
    error: null,
  },
];
const returnEmails = {
  on: emailsOn,
  busy: false,
  mailboxId: null,
  mailboxes: mailboxes.map(({ id, email }) => ({ id, email })),
  last: emailsOn
    ? { at: new Date().toISOString(), read: 48, emails: 18, matched: 9, returns: 6, errors: [] }
    : null,
};
const json = (body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
const realFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("/api/money-hub/return-emails")) return json(returnEmails);
  if (url.startsWith("/api/money-hub/email/status"))
    return json({
      clientReady: true,
      mailboxes,
      banks: [
        {
          id: "b1",
          bankName: "MB",
          accountName: "MB Bank",
          mailboxId: "ef0e2c6f6863",
          enabled: true,
        },
      ],
    });
  if (url.startsWith("/api/money-hub/amazon")) {
    return json({
      on: true,
      busy: false,
      mailboxId: null,
      mailboxes: returnEmails.mailboxes,
      orders: 93,
      matched: 78,
      returns: 19,
      last: {
        at: new Date().toISOString(),
        read: 0,
        orders: 93,
        charges: 79,
        matched: 78,
        errors: [],
      },
      kinds: [],
      categorized: 0,
    });
  }
  if (url.startsWith("/api/money-hub/tiktok")) {
    return json({ on: true, busy: false, mailboxId: null, mailboxes: returnEmails.mailboxes, orders: 6, matched: 6, returns: 1, last: { at: new Date().toISOString(), read: 21, orders: 6, charges: 6, matched: 6, returns: 1, errors: [] } });
  }
  if (url.includes("/candidates")) return json(fixture.moneyIn);
  if (url.startsWith("/api/money-hub/alerts")) return json({ discord: { on: true, shown: "…Ux9tq" }, ntfy: { on: true, server: "https://ntfy.sh", topic: "money", hasToken: false, priority: 4 }, last: null });
  // Anything else the helper serves is not in this preview: an error, so those cards stay hidden.
  if (url.startsWith("/api/money-hub/")) return Promise.resolve(new Response(JSON.stringify({ error: "Not in the preview" }), { status: 503, headers: { "Content-Type": "application/json" } }));
  return realFetch(input, init);
};

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  },
});
qc.setQueryData(RETURNS_KEY, fixture.view as unknown as ReturnsView);
qc.setQueryData(RETURN_EMAILS_KEY, returnEmails);
for (const archived of [true, false])
  qc.setQueryData([QueryKeys.ACCOUNTS, archived], fixture.accounts);
if (view === "window") trackReturnStore.open({ returnId: params.get("id") || "r9" });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <PrivacyProvider>
        <TooltipProvider>
          <MemoryRouter
            initialEntries={[view === "google" ? "/settings/google" : "/spending/returns"]}
          >
            <div
              style={{ marginLeft: Number(params.get("side") || 0) }}
              className={view === "google" || view === "alerts" ? "mx-auto max-w-3xl p-6" : undefined}
            >
              {view === "google" ? <GoogleSettingsPage /> : view === "alerts" ? <AlertsSettingsPage /> : <SpendingReturnsPage />}
            </div>
            <TrackReturnHost />
          </MemoryRouter>
        </TooltipProvider>
      </PrivacyProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
