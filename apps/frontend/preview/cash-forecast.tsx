// money-hub patch: the Spending dashboard's Cash forecast card with fixture data, for a picture before
// shipping (vite.preview.config.ts). ?theme=light|dark; ?old=1 drops what the service now carries per row
// (the card before the fix). The fixture is the helper's view over the owner's real accounts
// (preview/cash-forecast.fixture.json, not committed).
import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "../src/globals.css";
import "../src/i18n/i18n";

import { TooltipProvider } from "@wealthfolio/ui";
import { PrivacyProvider } from "../src/context/privacy-context";
import { CashForecastCard } from "../src/features/spending/components/cash-forecast-card";
import { MERCHANTS_KEY } from "../src/features/spending/lib/merchants";
import { QueryKeys } from "../src/lib/query-keys";
import fixture from "./cash-forecast.fixture.json";

const params = new URLSearchParams(location.search);
const view = structuredClone(fixture.view) as { events: Record<string, unknown>[] };
if (params.get("old")) for (const e of view.events) for (const k of ["accountId", "activityType", "mask", "bankLogo"]) delete e[k];

const qc = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnMount: false } },
});
for (const d of [30, 60, 90]) qc.setQueryData(["money-hub", "cash-forecast", d], view);
qc.setQueryData(MERCHANTS_KEY, params.get("old") ? fixture.merchants.filter((m) => m.id !== "usbank") : fixture.merchants);
for (const archived of [true, false]) qc.setQueryData([QueryKeys.ACCOUNTS, archived], fixture.accounts);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <PrivacyProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/dashboard?tab=spending"]}>
            <div className="bg-background text-foreground min-h-screen px-4 py-6 md:px-6 lg:px-10 lg:py-10">
              <div className="mx-auto max-w-[760px]">
                <CashForecastCard currency="USD" />
              </div>
            </div>
          </MemoryRouter>
        </TooltipProvider>
      </PrivacyProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
