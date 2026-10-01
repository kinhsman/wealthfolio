// money-hub patch: the Spending dashboard's Credit cards card with fixture data, for a picture before
// shipping (vite.preview.config.ts). ?theme=light|dark; ?case=edge swaps in made-up cards for the odd
// states (high use, a credit on the card, sign in again, no limit). The fixture is the helper's view
// over the owner's real cards plus their money app accounts (preview/credit-cards.fixture.json, not committed).
import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "../src/globals.css";
import "../src/i18n/i18n";

import { TooltipProvider } from "@wealthfolio/ui";
import { PrivacyProvider } from "../src/context/privacy-context";
import { CreditCardsCard } from "../src/features/spending/components/credit-cards-card";
import { CREDIT_CARDS_KEY, type CreditCardsView } from "../src/features/spending/lib/credit-cards";
import { FOREST_THEME } from "../src/features/spending/lib/theme";
import { QueryKeys } from "../src/lib/query-keys";
import fixture from "./credit-cards.fixture.json";

const params = new URLSearchParams(location.search);
const real = fixture.view as unknown as CreditCardsView;

function edgeCases(v: CreditCardsView): CreditCardsView {
  const [a, b, c, d] = v.cards;
  const cards = [
    { ...a, owed: 7420.18, pending: 312.5, pendingCount: 2, available: a.limit! - 7420.18 - 312.5 },
    { ...b, owed: 251.27, pending: -40, pendingCount: 1 },
    { ...c, owed: 245.93, needsLogin: true, error: "Sign in again" },
    { ...d, owed: -25, pending: 0, pendingCount: 0, limit: null, available: null },
  ];
  const owed = cards.reduce((s, x) => s + x.owed, 0);
  const limit = cards.reduce((s, x) => s + (x.limit ?? 0), 0);
  return {
    ...v,
    cards,
    totals: {
      ...v.totals,
      owed,
      pending: 272.5,
      limit,
      available: limit - owed,
      usedPct: (owed + 25) / limit,
    },
    asOf: new Date(Date.now() - 26 * 3600 * 1000).toISOString(),
  };
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
qc.setQueryData(CREDIT_CARDS_KEY, params.get("case") === "edge" ? edgeCases(real) : real);
for (const archived of [true, false])
  qc.setQueryData([QueryKeys.ACCOUNTS, archived], fixture.accounts);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <PrivacyProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/dashboard?tab=spending"]}>
            {/* The spending dashboard's right column: one third of a three-column grid. */}
            <div className="bg-background text-foreground min-h-screen px-4 py-6 md:px-6 lg:px-10 lg:py-10">
              <div className="lg:grid lg:grid-cols-3 lg:gap-20">
                <div className="lg:col-span-2" />
                <CreditCardsCard
                  currency="USD"
                  color={FOREST_THEME.deep}
                  darkColor={FOREST_THEME.mid}
                />
              </div>
            </div>
          </MemoryRouter>
        </TooltipProvider>
      </PrivacyProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
