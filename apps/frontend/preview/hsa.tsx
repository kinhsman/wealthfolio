// money-hub patch: the HSA receipts page with fixture data, for a picture before shipping
// (vite.preview.config.ts, or `vite -c vite.preview.config.ts` then /preview/hsa.html). ?theme=light|dark,
// ?skin=bronze, ?state=list (default) | empty | notready | off | unlinked | paused (the page's own cases),
// ?open=<id prefix> opens a receipt, ?gear=1 opens the settings window, ?add=saved|duplicate|attached|unreadable|
// not_receipt|need_detail is what the next add answers, ?cands=none for a receipt with no matching charge,
// ?sidebar=244 leaves room for the app's sidebar, ?font=mono|serif tries the other font settings.
// The fixture is SYNTHETIC (invented names, amounts and sample pictures: preview/hsa.fixture.json and
// preview/public/api/money-hub/hsa/, git-ignored); the page's /api/money-hub/hsa calls are answered here, in
// memory, so edits, Mark reimbursed, the charge list, Add a photo and Delete all work on the page.
import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "../src/globals.css";
import "../src/i18n/i18n";

import { TooltipProvider } from "@wealthfolio/ui";
import { AppSkin } from "../src/components/app-skin";
import { PrivacyProvider } from "../src/context/privacy-context";
import {
  HSA_KEY,
  totalsOfRows,
  type HsaAnswer,
  type HsaCharge,
  type HsaReceipt,
  type HsaView,
} from "../src/features/spending/lib/hsa";
import SpendingHsaPage from "../src/features/spending/pages/spending-hsa-page";
import fixture from "./hsa.fixture.json";

const params = new URLSearchParams(location.search);
const skin = params.get("skin");
for (const mode of ["light", "dark"]) {
  if (skin) localStorage.setItem(`dashboard-skin-${mode}`, JSON.stringify(skin));
  else localStorage.removeItem(`dashboard-skin-${mode}`);
}

const BASE = "/api/money-hub/hsa";
const state = params.get("state") ?? "list";
const store = structuredClone((fixture as unknown as { view: HsaView }).view);
const candidates = (fixture as unknown as { candidates: HsaCharge[] }).candidates;
store.mirror.sheetAt = new Date(Date.now() - 12 * 60_000).toISOString();
if (state === "empty") {
  store.receipts = [];
  store.mirror.folder = null;
  store.mirror.sheetUrl = null;
  store.mirror.folderUrl = null;
  store.mirror.sheetAt = null;
  store.mirror.waiting = 0;
}
if (state === "notready") store.ready = false;
if (state === "off") store.mirror.on = false;
if (state === "unlinked")
  store.mirror = {
    ...store.mirror,
    link: "unlinked",
    sheetUrl: null,
    folderUrl: null,
    sheetAt: null,
    folder: null,
  };
if (state === "paused") store.mirror = { ...store.mirror, link: "relink", paused: "relink" };

/** The server's own sums (lib/hsa.js totalsOf), so the strip and the chips follow every change. */
function totalsOf(rows: HsaReceipt[]): HsaView["totals"] {
  const live = rows.filter((r) => r.status !== "junk");
  const sum = (xs: HsaReceipt[]) => ({
    n: xs.length,
    usd: xs.reduce((a, r) => a + Math.round((r.usd ?? 0) * 100), 0) / 100,
    noUsd: xs.filter((r) => !((r.usd ?? 0) > 0)).length,
  });
  const open = live.filter((r) => r.status === "unreimbursed");
  const years = [...new Set(live.map((r) => r.date.slice(0, 4)))].sort().reverse();
  const people = [...new Set(live.map((r) => r.patient || ""))].sort((a, b) =>
    (a || "￿").localeCompare(b || "￿"),
  );
  return {
    ...totalsOfRows(rows),
    byYear: years.map((y) => ({
      year: y,
      all: sum(live.filter((r) => r.date.startsWith(y))),
      unreimbursed: sum(open.filter((r) => r.date.startsWith(y))),
    })),
    byPatient: people.map((p) => ({
      patient: p || null,
      all: sum(live.filter((r) => (r.patient || "") === p)),
      unreimbursed: sum(open.filter((r) => (r.patient || "") === p)),
    })),
  };
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const view = () => json({ ...store, totals: totalsOf(store.receipts) });
const realFetch = window.fetch.bind(window);

window.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    location.href,
  );
  if (!url.pathname.startsWith(BASE)) return realFetch(input, init);
  const path = url.pathname.slice(BASE.length) || "/";
  const method = (init?.method ?? "GET").toUpperCase();
  const [, id, rest] = path.match(/^\/([0-9a-f]{16})(?:\/(.+))?$/) ?? [];
  const row = store.receipts.find((r) => r.id === id);
  await new Promise((done) => setTimeout(done, method === "POST" && !rest ? 900 : 120));

  if (method === "GET" && path === "/") return view();
  if (method === "PUT" && path === "/settings") {
    Object.assign(store.settings, JSON.parse(String(init?.body)));
    store.mirror.on = store.settings.mirror;
    return view();
  }
  if (method === "POST" && path === "/mirror/run") {
    window.setTimeout(() => {
      store.mirror.waiting = 0;
      store.mirror.sheetAt = new Date().toISOString();
    }, 6000);
    return view();
  }
  if (method === "POST" && (path === "/" || path === "/text")) {
    const outcome = (params.get("add") ?? "saved") as HsaAnswer["outcome"];
    if (outcome === "saved") {
      const added: HsaReceipt = {
        ...store.receipts[0],
        id: "ff00a1b2c3d4e5f6",
        at: new Date().toISOString(),
        date: "2026-10-02",
        provider: "Maple Family Practice",
        patient: null,
        description: "Visit",
        type: "Medical",
        amount: 85,
        usd: 85,
        status: "unreimbursed",
        amountSource: "receipt",
        photos: path === "/" ? 1 : 0,
        inDrive: false,
        reimbursedOn: null,
        chargeId: null,
        chargeDate: null,
      };
      store.receipts.unshift(added);
      return json({ outcome, matches: [], receipt: added });
    }
    const match = store.receipts[0];
    const matches =
      outcome === "duplicate" || outcome === "attached"
        ? [
            {
              id: match.id,
              title: `${match.date} ${match.provider} $${match.usd}`,
              how: "same USD",
              hasPhoto: true,
            },
          ]
        : undefined;
    return json({ outcome, matches, receipt: matches ? match : null });
  }
  if (!row && id) return json({ error: "No such receipt." }, 404);
  if (method === "PUT" && row && !rest) {
    const patch = JSON.parse(String(init?.body));
    Object.assign(row, patch);
    if (("amount" in patch || "currency" in patch) && !("usd" in patch) && row.currency === "USD")
      Object.assign(row, { usd: row.amount, rate: 1, amountSource: "receipt" });
    if (row.status !== "reimbursed") row.reimbursedOn = null;
    else if (!row.reimbursedOn) row.reimbursedOn = new Date().toISOString().slice(0, 10);
    return json(row);
  }
  if (method === "GET" && row && rest === "candidates")
    return json({
      from: "2026-08-21",
      to: "2026-09-27",
      items: params.get("cands") === "none" ? [] : candidates,
    });
  if (method === "PUT" && row && rest === "charge") {
    const charge =
      candidates.find((c) => c.id === JSON.parse(String(init?.body)).activityId) ?? candidates[0];
    Object.assign(row, {
      chargeId: charge.id,
      chargeDate: charge.date,
      usd: charge.amount,
      amountSource: "card",
    });
    if (row.status === "review") row.status = "unreimbursed";
    return json(row);
  }
  if (method === "POST" && row && rest === "photos") {
    row.photos += 1;
    return json(row);
  }
  if (method === "DELETE" && row) {
    store.receipts = store.receipts.filter((r) => r.id !== row.id);
    return view();
  }
  return json({ error: `The preview does not answer ${method} ${path}` }, 404);
};

const qc = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
qc.setQueryData(HSA_KEY, { ...store, totals: totalsOf(store.receipts) });

// ?sidebar=244 makes room for the app's sidebar, so a 1280 window shows the page as the owner sees it.
const sidebar = Number(params.get("sidebar") ?? 0);
const open = params.get("open");
const opened = open ? store.receipts.find((r) => r.id.startsWith(open)) : null;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <PrivacyProvider>
        <TooltipProvider>
          <AppSkin />
          <MemoryRouter initialEntries={["/spending/hsa"]}>
            <div style={{ marginLeft: sidebar }}>
              <SpendingHsaPage />
            </div>
          </MemoryRouter>
          {sidebar ? (
            <div
              aria-hidden
              className="bg-card fixed inset-y-0 left-0 z-[5] border-r"
              style={{ width: sidebar }}
            />
          ) : null}
        </TooltipProvider>
      </PrivacyProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);

// ?open= and ?gear= click what the owner would click, once the page is up.
window.setTimeout(() => {
  if (opened)
    document
      .querySelector<HTMLButtonElement>(`button[aria-label^="Open ${opened.provider}"]`)
      ?.click();
  if (params.get("gear"))
    document.querySelector<HTMLButtonElement>('button[aria-label="HSA settings"]')?.click();
}, 400);
