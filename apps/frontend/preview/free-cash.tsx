// money-hub patch: Free cash with fixture data, for a picture before shipping (vite.preview.config.ts).
// ?view=column (the dashboard's right column: Credit cards, then Free cash; &open=1 opens the bills;
// &case=short poses the cash short; &cushion=2000 sets a cushion), ?view=form (an account's edit window, &id=<account id>),
// ?view=alerts (Settings, Alerts); ?theme=light|dark. The fixture is the helper's view over the
// owner's real accounts, cards and bills (preview/free-cash.fixture.json, not committed).
import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "../src/globals.css";
import "../src/i18n/i18n";

import { TooltipProvider } from "@wealthfolio/ui";
import { Dialog, DialogContent } from "@wealthfolio/ui/components/ui/dialog";
import { PrivacyProvider } from "../src/context/privacy-context";
import { CreditCardsCard } from "../src/features/spending/components/credit-cards-card";
import { BudgetLineChartCard } from "../src/features/spending/components/budget-line-chart-card";
import { forecastParts } from "../src/features/spending/lib/budget-forecast";
import { FreeCashCard } from "../src/features/spending/components/free-cash-card";
import { CREDIT_CARDS_KEY, type CreditCardsView } from "../src/features/spending/lib/credit-cards";
import { FREE_CASH_KEY, type FreeCashView } from "../src/features/spending/lib/free-cash";
import {
  PENDING_CHANGES_KEY,
  type PendingChangesView,
} from "../src/features/spending/lib/pending-changes";
import { RETURNS_KEY, type ReturnsView } from "../src/features/spending/lib/returns";
import {
  SUBSCRIPTIONS_KEY,
  type SubscriptionsView,
} from "../src/features/spending/lib/subscriptions";
import { FOREST_THEME } from "../src/features/spending/lib/theme";
import { QueryKeys } from "../src/lib/query-keys";
import type { Account } from "../src/lib/types";
import { AccountForm } from "../src/pages/settings/accounts/components/account-form";
import AlertsSettingsPage from "../src/pages/settings/alerts/alerts-page";
import fixture from "./free-cash.fixture.json";
import pendingFixture from "./pending.fixture.json";
import returnsFixture from "./returns.fixture.json";
import subsFixture from "./subscriptions.fixture.json";

const params = new URLSearchParams(location.search);
const view = params.get("view") || "column";
const real = fixture.view as unknown as FreeCashView;

/** The same accounts and bills with the cash posed $1,240.17 short. */
function shortCase(v: FreeCashView): FreeCashView {
  const cash = v.totals.cards + v.totals.bills - 1240.17;
  const scale = cash / v.totals.cash;
  return {
    ...v,
    accounts: v.accounts.map((a) => ({ ...a, cash: Math.round(a.cash * scale * 100) / 100 })),
    totals: { ...v.totals, cash: Math.round(cash * 100) / 100, left: -1240.17 },
    short: true,
  };
}

// Settings, Alerts asks the helper where alerts go: answer it here (ntfy set up, as on the owner's app).
const realFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("/api/money-hub/alerts")) {
    const body = {
      discord: { on: false, shown: null },
      ntfy: {
        on: true,
        server: "https://ntfy.sh",
        topic: "money-sample",
        hasToken: false,
        priority: 4,
      },
      last: null,
    };
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
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
/** ?cushion=2000: as with that cushion set on Settings, Alerts. */
function withCushion(v: FreeCashView): FreeCashView {
  const cushion = Number(params.get("cushion") || 0);
  if (!cushion) return { ...v, totals: { ...v.totals, cushion: v.totals.cushion ?? 0 } };
  const left = Math.round((v.totals.left - cushion) * 100) / 100;
  return { ...v, totals: { ...v.totals, cushion, left }, short: left < 0 };
}
qc.setQueryData(
  FREE_CASH_KEY,
  withCushion(params.get("case") === "short" ? shortCase(real) : real),
);
qc.setQueryData(CREDIT_CARDS_KEY, fixture.cards as unknown as CreditCardsView);
qc.setQueryData(SUBSCRIPTIONS_KEY, subsFixture as unknown as SubscriptionsView);
qc.setQueryData(RETURNS_KEY, returnsFixture.view as unknown as ReturnsView);
qc.setQueryData(PENDING_CHANGES_KEY, pendingFixture.view as unknown as PendingChangesView);
for (const archived of [true, false])
  qc.setQueryData([QueryKeys.ACCOUNTS, archived], fixture.accounts);

/** Opens the bills under the Free cash card (?open=1). */
function OpenBills() {
  useEffect(() => {
    if (params.get("open") !== "1") return;
    const t = setTimeout(
      () =>
        (document.querySelector('[aria-expanded="false"]') as HTMLButtonElement | null)?.click(),
      50,
    );
    return () => clearTimeout(t);
  }, []);
  return null;
}

/** The Monthly budget card on Oct 1 as the owner saw it: $4,000 budget, the mortgage paid that day,
 *  $19,953.76 spent over Jul to Sep (?view=budget; &old=1 = Wealthfolio's own forecast). */
function BudgetPreview() {
  const parts = forecastParts((subsFixture as unknown as SubscriptionsView).items, {
    monthStart: "2026-10-01",
    monthEnd: "2026-10-31",
    histStart: "2026-07-01",
    histEnd: "2026-09-30",
    historyOutflow: 19953.76,
    historyDays: 92,
  });
  return (
    <div className="bg-background text-foreground min-h-screen px-4 py-6 md:px-6 lg:px-10 lg:py-10">
      <div className="lg:grid lg:grid-cols-3 lg:gap-20">
        <div className="lg:col-span-2" />
        <BudgetLineChartCard
          monthKey="2026-10"
          today={{ year: 2026, month: 10, day: 1 }}
          isCurrentMonth
          onPreviousMonth={() => undefined}
          onNextMonth={() => undefined}
          canGoNextMonth={false}
          activityRange={{ from: "2026-10-01", to: "2026-10-31" }}
          target={4000}
          spent={2505.76}
          currency="USD"
          historicalDailyAvg={19953.76 / 92}
          forecastParts={params.get("old") === "1" ? null : parts}
          allocations={[]}
          spendingBreakdown={[]}
          categoriesMeta={{}}
          monthByDay={[{ date: "2026-10-01", income: 0, outflow: 2505.76 }]}
          historicalByDay={[]}
        />
      </div>
    </div>
  );
}

function Shell() {
  if (view === "budget") return <BudgetPreview />;
  if (view === "alerts") {
    return (
      <div className="bg-background text-foreground min-h-screen px-6 py-8">
        <div className="mx-auto max-w-3xl">
          <AlertsSettingsPage />
        </div>
      </div>
    );
  }
  if (view === "form") {
    const acct =
      (fixture.accounts as unknown as Account[]).find((a) => a.id === params.get("id")) ??
      (fixture.accounts as unknown as Account[]).find((a) => a.name === "Personal-145")!;
    return (
      <Dialog open>
        <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-[920px]">
          <AccountForm
            defaultValues={{
              id: acct.id,
              name: acct.name,
              balance: 0,
              accountType: acct.accountType as
                | "SECURITIES"
                | "CASH"
                | "CREDIT_CARD"
                | "CRYPTOCURRENCY",
              group: acct.group ?? undefined,
              currency: acct.currency,
              isDefault: false,
              isActive: acct.isActive,
              isArchived: acct.isArchived,
              trackingMode: acct.trackingMode,
              meta: acct.meta,
            }}
          />
        </DialogContent>
      </Dialog>
    );
  }
  // The spending dashboard's right column: one third of a three-column grid.
  return (
    <div className="bg-background text-foreground min-h-screen px-4 py-6 md:px-6 lg:px-10 lg:py-10">
      <div className="lg:grid lg:grid-cols-3 lg:gap-20">
        <div className="lg:col-span-2" />
        <div className="space-y-6">
          <CreditCardsCard currency="USD" color={FOREST_THEME.deep} darkColor={FOREST_THEME.mid} />
          <FreeCashCard currency="USD" />
        </div>
      </div>
      <OpenBills />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <PrivacyProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/dashboard?tab=spending"]}>
            <Shell />
          </MemoryRouter>
        </TooltipProvider>
      </PrivacyProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
