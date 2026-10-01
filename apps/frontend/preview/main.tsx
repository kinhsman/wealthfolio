// money-hub patch: the Subscriptions & bills screens with fixture data, for a picture before shipping
// (vite.preview.config.ts). ?view=page|card|alerts|track|pending|rows|filter, ?theme=light|dark; track: ?case=likely|member|new. The fixture is the helper's view
// over the owner's real transactions (preview/subscriptions.fixture.json, not committed).
// Returns: ?view=returns|returns-empty|returns-card|return-new|return-edit|return-pick over sample returns at the
// owner's real stores (preview/returns.fixture.json, not committed; ?id=r2 picks the one the window opens on).
import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "../src/globals.css";
import "../src/i18n/i18n";

import { SubscriptionsCard } from "../src/features/spending/components/subscriptions-card";
import { SUBSCRIPTIONS_KEY, type SubscriptionsView } from "../src/features/spending/lib/subscriptions";
import SpendingSubscriptionsPage from "../src/features/spending/pages/spending-subscriptions-page";
import { TrackChargeHost } from "../src/features/spending/components/track-charge-dialog";
import { MERCHANTS_KEY, type Merchant } from "../src/features/spending/lib/merchants";
import { trackChargeStore } from "../src/features/spending/lib/track-charge";
import AlertsSettingsPage from "../src/pages/settings/alerts/alerts-page";
import { ReturnsCard } from "../src/features/spending/components/returns-card";
import { TrackReturnHost } from "../src/features/spending/components/track-return-dialog";
import { RETURNS_KEY, trackReturnStore, type ReturnsView } from "../src/features/spending/lib/returns";
import SpendingReturnsPage from "../src/features/spending/pages/spending-returns-page";
import { QueryKeys } from "../src/lib/query-keys";
import fixture from "./subscriptions.fixture.json";
import pendingFixture from "./pending.fixture.json";
import SpendingPendingChangesPage from "../src/features/spending/pages/spending-pending-changes-page";
import { PENDING_CHANGES_KEY, type PendingChangesView } from "../src/features/spending/lib/pending-changes";
import { PendingTransactions } from "../src/features/spending/components/pending-transactions";
import { TransactionRow } from "../src/features/spending/components/transaction-row";
import { TransactionCard } from "../src/features/spending/components/transaction-card";
import type { TransactionRowVM } from "../src/features/spending/lib/transactions-helpers";
import { Table, TableBody, TooltipProvider } from "@wealthfolio/ui";
import { PrivacyProvider } from "../src/context/privacy-context";
import { EventDialogProvider } from "../src/features/spending/components/event-dialog-provider";
import { TransactionsFilterBar } from "../src/features/spending/components/transactions-filter-bar";
import { subscriptionFilterOptions } from "../src/features/spending/lib/subscriptions";
import returnsFixture from "./returns.fixture.json";

const params = new URLSearchParams(location.search);
const view = params.get("view") || "page";

// The Alerts page asks the helper directly: answer it here (Discord set up, phone not yet).
const realFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  // The "which one is it?" window asks the helper about the charge (?case=likely|member|new).
  if (url.startsWith("/api/money-hub/subscriptions/which")) {
    const yt = (fixture as unknown as SubscriptionsView).items.find((s) => s.name === "YouTube Premium");
    const c = params.get("case") || "likely";
    const body = {
      member: c === "member" ? yt?.key : null,
      likely: c === "new" ? null : yt?.key,
      draft: c === "new"
        ? { name: "Spotify Usa", words: ["SPOTIFY USA"], amount: 11.99, every: "month", nextDate: "2026-10-30" }
        : { name: "YouTube Premium", words: ["YouTube"], amount: 9.92, every: "month", nextDate: "2026-10-26" },
    };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
  }
  if (url.startsWith("/api/money-hub/plaid/pending-changes")) {
    return Promise.resolve(new Response(JSON.stringify(pendingFixture.view), { status: 200, headers: { "Content-Type": "application/json" } }));
  }
  const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
  // The Returns window asks the helper for purchases to start from and for the money in to pick from.
  if (url.startsWith("/api/money-hub/returns/purchases")) return json(returnsFixture.purchases);
  if (url.includes("/candidates")) return json(returnsFixture.moneyIn);
  if (url.startsWith("/api/money-hub/alerts")) {
    const body = {
      // ?discord=off: as the owner's money app has it today (no webhook).
      discord: params.get("discord") === "off" ? { on: false, shown: null } : { on: true, shown: "…Ux9tq" },
      ntfy: params.get("ntfy") === "on"
        ? { on: true, server: "https://ntfy.sh", topic: "money-4a0d2r4x2o2b5u0c28", hasToken: false, priority: 4 }
        : { on: false, server: "https://ntfy.sh", topic: "", hasToken: false, priority: 3 },
      last: null,
    };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
  }
  return realFetch(input, init);
};

const qc = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnMount: false } },
});
qc.setQueryData(SUBSCRIPTIONS_KEY, fixture as unknown as SubscriptionsView);
const returnsView = returnsFixture.view as unknown as ReturnsView;
qc.setQueryData(RETURNS_KEY, view === "returns-empty" ? { ...returnsView, items: [], totals: { waiting: 0, count: 0, late: 0, toConfirm: 0, back: 0, backCount: 0 } } : returnsView);
// ?view=rows&returns=1: the Returns mark on the sample rows (waiting, late, refunded).
if (view === "rows" && params.get("returns") === "1") {
  const pick = ["r1", "r3", "r5"];
  const ids = ["p-pho", "p-shell", "p-costco"].map((id) => (pendingFixture.view as unknown as PendingChangesView).items.find((x) => x.id === id)?.activityId ?? `act-${id}`);
  qc.setQueryData(RETURNS_KEY, { ...returnsView, items: returnsView.items.map((x) => (pick.includes(x.id) ? { ...x, purchaseId: ids[pick.indexOf(x.id)] } : x)) });
}
// The owner's accounts, for their names on the rows.
for (const archived of [true, false]) qc.setQueryData([QueryKeys.ACCOUNTS, archived], returnsFixture.accounts);
// The owner's merchants, from the streams that have one (their logos sit in preview/public).
qc.setQueryData(
  MERCHANTS_KEY,
  (fixture as unknown as SubscriptionsView).items
    .filter((s) => s.merchantId && s.logoUrl)
    .map((s): Merchant => ({ id: s.merchantId!, name: s.name, pattern: s.name, patterns: [s.name], logoUrl: s.logoUrl })),
);

qc.setQueryData(PENDING_CHANGES_KEY, pendingFixture.view as unknown as PendingChangesView);
if (view === "pending" || view === "rows") {
  qc.setQueryData(MERCHANTS_KEY, [
    ...(qc.getQueryData<Merchant[]>(MERCHANTS_KEY) ?? []),
    ...(pendingFixture.merchants as unknown as Merchant[]).filter((m) => m.logoUrl),
  ]);
}

/** Three Spending list rows (a tip, a gas hold, an unchanged one) and the pending box, desktop and phone. */
function RowsPreview() {
  const noop = () => {};
  const items = (pendingFixture.view as unknown as PendingChangesView).items;
  const rows: TransactionRowVM[] = ["p-pho", "p-shell", "p-costco"].map((id) => {
    const c = items.find((x) => x.id === id)!;
    return {
      activity: {
        id: c.activityId ?? `act-${id}`, accountId: c.accountId, activityType: "WITHDRAWAL", activityDate: `${c.postedDate}T17:00:00Z`,
        amount: String(c.posted), currency: "USD", notes: c.name, cashFlowBucket: "spending", netAmount: String(-(c.posted ?? 0)),
      } as unknown as TransactionRowVM["activity"],
      category: { assignmentId: "a", taxonomyId: "t", id: "c", name: id === "p-shell" ? "Gas" : id === "p-pho" ? "Restaurants" : "Groceries", color: "#e07a5f", parentName: null },
      splitCount: 0,
      needsReview: false,
    };
  });
  // The tag reads the posted entry's id: point the fixture's Costco at its row (unchanged, so no tag).
  const handlers = {
    event: null, eventTypeColor: null, showAccount: true, isSelected: false, onToggleSelect: noop, onAssignCategory: noop, onClearCategory: noop,
    onSetEvent: noop, onMarkReimbursement: noop, onEditSplits: noop, onEdit: noop, onDuplicate: noop, onDelete: noop,
  };
  const pending = items.filter((c) => c.status === "pending").map((c) => ({ id: c.id, accountId: c.accountId, date: c.date, notes: c.name, bankText: c.bankText, amount: -c.lastPending, currency: "USD" }));
  const mobile = params.get("mobile") === "1";
  return (
    <div className="bg-background text-foreground min-h-screen space-y-4 px-4 py-6 md:px-10">
      <PendingTransactions items={pending} accountById={new Map()} showAccount isMobile={mobile} />
      {mobile ? (
        <div className="space-y-2">
          {rows.map((r) => <TransactionCard key={r.activity.id} row={r} account={undefined} selectionMode={false} {...handlers} />)}
        </div>
      ) : (
        <Table>
          <TableBody>
            {rows.map((r) => <TransactionRow key={r.activity.id} row={r} account={undefined} {...handlers} />)}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

/** The window as it opens on a charge just filed under Subscriptions (or a bill category). */
function TrackPreview() {
  useEffect(() => {
    const c = params.get("case") || "likely";
    trackChargeStore.open(
      c === "new"
        ? { id: "t-new", notes: "SPOTIFY USA 877-778-1161", amount: 11.99, date: "2026-09-30", accountId: "acc", activityType: "WITHDRAWAL", group: "subscriptions", categoryName: "Subscriptions" }
        : { id: "t-yt", notes: "YouTube Premium", amount: 9.92, date: "2026-09-26", accountId: "acc", activityType: "WITHDRAWAL", group: "subscriptions", categoryName: "Subscriptions" },
    );
  }, []);
  return (
    <>
      <SpendingSubscriptionsPage />
      <TrackChargeHost />
    </>
  );
}

/** The Returns window as it opens: on a purchase (new), on one being tracked (edit), or to pick the purchase. */
function ReturnPreview() {
  useEffect(() => {
    const p = returnsFixture.purchases.find((x) => x.notes === "Costco") ?? returnsFixture.purchases[0];
    trackReturnStore.open(view === "return-new" ? { purchase: p } : view === "return-edit" ? { returnId: params.get("id") || "r2" } : {});
  }, []);
  return (
    <>
      <SpendingReturnsPage />
      <TrackReturnHost />
    </>
  );
}

/** The Activities filter row with the Subscription filter on, as a subscription's name opens it. */
function FilterPreview() {
  const items = (fixture as unknown as SubscriptionsView).items;
  const options = subscriptionFilterOptions(items);
  const [picked, setPicked] = React.useState(new Set([options.find((o) => /youtube/i.test(o.label))?.value ?? options[0].value]));
  const noop = () => {};
  const none = new Set<string>();
  return (
    <div className="bg-background text-foreground min-h-screen px-4 py-6 md:px-10">
      <TransactionsFilterBar
        searchInput="" onSearchInputChange={noop} statusFilter="all" onStatusFilterChange={noop}
        dateRange={undefined} onDateRangeChange={noop} selectedAccounts={none} onAccountsChange={noop}
        selectedTypes={none} onTypesChange={noop} selectedCategories={none} onCategoriesChange={noop}
        selectedSubcategories={none} onSubcategoriesChange={noop} selectedEvents={none} onEventsChange={noop}
        selectedSubscriptions={picked} onSubscriptionsChange={setPicked} amountRange={{ min: null, max: null }}
        onAmountRangeChange={noop} accountOptions={[]} typeOptions={[]} categoryOptions={[]} subcategoryOptions={[]}
        eventOptions={[]} hasEvents subscriptionOptions={options} filtersActive onClearAll={noop}
        visibleCount={12} totalCount={12} selectedNet={{ byCurrency: [], converted: null }}
        filteredNet={{ byCurrency: [{ currency: "USD", amount: -312.4 }], converted: null }}
        isRefreshing={false} isMobile={params.get("mobile") === "1"}
      />
    </div>
  );
}

function Shell() {
  if (view === "filter") return <FilterPreview />;
  if (view === "track") return <TrackPreview />;
  if (view === "pending") return <SpendingPendingChangesPage />;
  if (view === "rows") return <RowsPreview />;
  if (view === "returns" || view === "returns-empty") return <><SpendingReturnsPage /><TrackReturnHost /></>;
  if (view.startsWith("return-")) return <ReturnPreview />;
  if (view === "returns-card") {
    // The spending dashboard's left column, under the Subscriptions card.
    return (
      <div className="bg-background text-foreground min-h-screen px-10 py-10">
        <div className="lg:grid lg:grid-cols-3 lg:gap-20">
          <div className="space-y-6 lg:col-span-2">
            <SubscriptionsCard currency="USD" />
            <ReturnsCard currency="USD" />
          </div>
        </div>
      </div>
    );
  }
  if (view === "alerts") {
    // Settings' content column beside its menu.
    return (
      <div className="bg-background text-foreground min-h-screen px-6 py-8">
        <div className="mx-auto max-w-3xl">
          <AlertsSettingsPage />
        </div>
      </div>
    );
  }
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
      <PrivacyProvider>
      <TooltipProvider>
      <EventDialogProvider>
      <MemoryRouter initialEntries={[view === "pending" && params.get("id") ? `/spending/pending-changes?id=${params.get("id")}` : "/spending/subscriptions"]}>
        <React.Suspense fallback={null}>
          <Shell />
        </React.Suspense>
      </MemoryRouter>
      </EventDialogProvider>
      </TooltipProvider>
      </PrivacyProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
