// money-hub patch: the Subscriptions & bills screens with fixture data, for a picture before shipping
// (vite.preview.config.ts). ?view=page|card, ?theme=light|dark. The fixture is the helper's view
// over the owner's real transactions (preview/subscriptions.fixture.json, not committed).
import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "../src/globals.css";
import "../src/i18n/i18n";

import { SubscriptionsCard } from "../src/features/spending/components/subscriptions-card";
import { SUBSCRIPTIONS_KEY, type SubscriptionsView } from "../src/features/spending/lib/subscriptions";
import SpendingSubscriptionsPage from "../src/features/spending/pages/spending-subscriptions-page";
import fixture from "./subscriptions.fixture.json";

const params = new URLSearchParams(location.search);
const view = params.get("view") || "page";

const qc = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnMount: false } },
});
qc.setQueryData(SUBSCRIPTIONS_KEY, fixture as unknown as SubscriptionsView);

function Shell() {
  if (view === "card") {
    // The spending dashboard's left column: two thirds of a three-column grid.
    return (
      <div className="bg-background text-foreground min-h-screen px-10 py-10">
        <div className="lg:grid lg:grid-cols-3 lg:gap-20">
          <div className="lg:col-span-2">
            <SubscriptionsCard currency={(fixture as unknown as SubscriptionsView).currency || "USD"} />
          </div>
        </div>
      </div>
    );
  }
  return <SpendingSubscriptionsPage />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/spending/subscriptions"]}>
        <React.Suspense fallback={null}>
          <Shell />
        </React.Suspense>
      </MemoryRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
