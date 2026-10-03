// money-hub patch: the Pending vs posted page with fixture data, for a picture before shipping
// (vite.preview.config.ts). ?theme=light|dark, ?skin=bronze, ?data=live|empty (live = the owner's
// real entries on 10-02: one posted at the same amount, three pending), ?id=<entry> opens on one.
// The fixture is sample entries at the owner's real stores (preview/pending.fixture.json, not committed).
import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "../src/globals.css";
import "../src/i18n/i18n";

import { TooltipProvider } from "@wealthfolio/ui";
import { PrivacyProvider } from "../src/context/privacy-context";
import { MERCHANTS_KEY, type Merchant } from "../src/features/spending/lib/merchants";
import { PENDING_CHANGES_KEY, type PendingChange, type PendingChangesView } from "../src/features/spending/lib/pending-changes";
import SpendingPendingChangesPage from "../src/features/spending/pages/spending-pending-changes-page";
import { QueryKeys } from "../src/lib/query-keys";
import fixture from "./pending.fixture.json";

const params = new URLSearchParams(location.search);
const skin = params.get("skin");
for (const mode of ["light", "dark"]) {
  if (skin) localStorage.setItem(`dashboard-skin-${mode}`, JSON.stringify(skin));
  else localStorage.removeItem(`dashboard-skin-${mode}`);
}

const sample = fixture.view as unknown as PendingChangesView;
const live: PendingChange[] = [
  { ...sample.items.find((c) => c.id === "p-costco")!, id: "l-apple", name: "Apple Card", bankText: "APPLECARD GSBANK PAYMENT", accountId: "acc-Checking", account: "Chase Checking ••8237", firstPending: 11.08, lastPending: 11.08, pendingHistory: [11.08], posted: 11.08, diff: 0, date: "2026-10-01", postedDate: "2026-10-01" },
  ...sample.items.filter((c) => c.status === "pending"),
  { ...sample.items.find((c) => c.id === "p-comed")!, id: "l-comed2", name: "ComEd", accountId: "acc-Strata", account: "Strata Elite℠", firstPending: 180, lastPending: 180, pendingHistory: [180] },
];
const data = params.get("data");
const view: PendingChangesView =
  data === "live" ? { ...sample, since: "2026-10-01T16:48:08.000Z", items: live } : data === "empty" ? { ...sample, items: [] } : sample;

const qc = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnMount: false } },
});
qc.setQueryData(PENDING_CHANGES_KEY, view);
qc.setQueryData(MERCHANTS_KEY, (fixture.merchants as unknown as Merchant[]).filter((m) => m.logoUrl));

const CITI = "https://play-lh.googleusercontent.com/pOwwvIzBUhLECaVG4xQoW-eX_wCEl3vSDiC4zUqlT873YC46je4jm1UvBXvtrmRxbnR_ALwHRsXaPiwFspaTUJ0";
const CHASE = "https://cdn.jsdelivr.net/gh/selfhst/icons@main/webp/chase.webp";
const account = (id: string, name: string, group: string, logoUrl: string) => ({
  id, name, group, accountType: "CASH", currency: "USD", isDefault: false, isActive: true, isArchived: false,
  trackingMode: "TRANSACTIONS", meta: JSON.stringify({ logoUrl }), createdAt: "2026-09-30", updatedAt: "2026-09-30",
});
const accounts = [
  account("acc-Strata", "Strata Elite℠", "Citibank", CITI),
  account("acc-Freedo", "Freedom Unlimited ••5257", "Chase", CHASE),
  account("acc-Citiba", "Citibank Checking ••5056", "Citibank", CITI),
  account("acc-Checking", "Chase Checking ••8237", "Chase", CHASE),
];
for (const archived of [true, false]) qc.setQueryData([QueryKeys.ACCOUNTS, archived], accounts);

const id = params.get("id");
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <PrivacyProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={[id ? `/spending/pending-changes?id=${id}` : "/spending/pending-changes"]}>
            {/* ?side=244: the app's sidebar beside the page (its breakpoints follow the window, not the page). */}
            <div style={{ marginLeft: Number(params.get("side") || 0) }}>
              <SpendingPendingChangesPage />
            </div>
          </MemoryRouter>
        </TooltipProvider>
      </PrivacyProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
