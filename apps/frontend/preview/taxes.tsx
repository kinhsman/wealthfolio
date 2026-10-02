// money-hub patch: the Taxes page with fixture data, for a picture before shipping
// (vite.preview.config.ts). ?theme=light|dark, ?skin=bronze, ?year=2025, ?state=example|safe (the
// April estimate filled from EXAMPLE pay stub figures; the owner's own are typed in the app).
// ?view=cash: the Spending dashboard's Cash & cards card with a tax set-aside held back (an EXAMPLE
// amount; &case=ok for one the cash still covers).
// The fixture is the helper's own view over the owner's real data (preview/taxes.fixture.json, not
// committed): { "2026", "2025", example, safe, cash: { freeCash, cards, accounts } }.
import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "../src/globals.css";
import "../src/i18n/i18n";

import { TooltipProvider } from "@wealthfolio/ui";
import { PrivacyProvider } from "../src/context/privacy-context";
import { CashCardsCard } from "../src/features/spending/components/cash-cards-card";
import { CREDIT_CARDS_KEY } from "../src/features/spending/lib/credit-cards";
import { FREE_CASH_KEY, type FreeCashView } from "../src/features/spending/lib/free-cash";
import TaxesPage from "../src/features/taxes/pages/taxes-page";
import { QueryKeys } from "../src/lib/query-keys";
import { taxesKey, type TaxesView } from "../src/features/taxes/lib/taxes";
import fixture from "./taxes.fixture.json";

const params = new URLSearchParams(location.search);
const all = fixture as unknown as Record<string, TaxesView>;
// ?state=example | safe: the page with EXAMPLE pay stub figures (the owner's own are typed in the app).
const now = all[params.get("state") ?? ""] ?? all["2026"];
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

// The Cash & cards card with the set-aside held back.
const cash = (
  fixture as unknown as { cash?: { freeCash: FreeCashView; cards: unknown; accounts: unknown } }
).cash;
if (cash) {
  const held = cash.freeCash;
  const ok = params.get("case") === "ok";
  const taxes = ok ? 3000 : (held.totals.taxes ?? 0);
  const left =
    held.totals.cash - held.totals.cards - held.totals.bills - held.totals.cushion - taxes;
  qc.setQueryData(FREE_CASH_KEY, {
    ...held,
    totals: { ...held.totals, taxes, left },
    short: left < 0,
  });
  qc.setQueryData(CREDIT_CARDS_KEY, cash.cards);
  for (const archived of [true, false])
    qc.setQueryData([QueryKeys.ACCOUNTS, archived], cash.accounts);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <PrivacyProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={[year ? `/taxes?year=${year}` : "/taxes"]}>
            {params.get("view") === "cash" ? (
              <div className="meadow min-h-screen px-3 py-4 md:px-6 lg:px-8">
                <CashCardsCard currency="USD" />
              </div>
            ) : (
              <TaxesPage />
            )}
          </MemoryRouter>
        </TooltipProvider>
      </PrivacyProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
