// money-hub patch: the Taxes page with fixture data, for a picture before shipping
// (vite.preview.config.ts). ?theme=light|dark, ?skin=bronze, ?year=2025, ?state=before (the page
// before the owner's answers: accounts as guessed, payments still asking for their year).
// The fixture is the helper's own view over the owner's real data (preview/taxes.fixture.json, not
// committed): { before, "2026", "2025" }.
import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "../src/globals.css";
import "../src/i18n/i18n";

import { TooltipProvider } from "@wealthfolio/ui";
import { PrivacyProvider } from "../src/context/privacy-context";
import TaxesPage from "../src/features/taxes/pages/taxes-page";
import { taxesKey, type TaxesView } from "../src/features/taxes/lib/taxes";
import fixture from "./taxes.fixture.json";

const params = new URLSearchParams(location.search);
const all = fixture as unknown as Record<string, TaxesView>;
const now = params.get("state") === "before" ? all.before : all["2026"];
const skin = params.get("skin");
for (const mode of ["light", "dark"]) {
  if (skin) localStorage.setItem(`dashboard-skin-${mode}`, JSON.stringify(skin));
  else localStorage.removeItem(`dashboard-skin-${mode}`);
}

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
qc.setQueryData(taxesKey(null), now);
qc.setQueryData(taxesKey(2026), now);
qc.setQueryData(taxesKey(2025), all["2025"]);
const year = params.get("year");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <PrivacyProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={[year ? `/taxes?year=${year}` : "/taxes"]}>
            <TaxesPage />
          </MemoryRouter>
        </TooltipProvider>
      </PrivacyProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
