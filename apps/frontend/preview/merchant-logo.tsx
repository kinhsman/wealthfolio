// money-hub patch: the merchant window's "Website, Get logo" box with fixture answers, for a true-size picture before
// shipping (vite.preview.config.ts). ?theme=light|dark. The logo itself comes from logo.dev (as the helper would fetch
// it); nothing is saved.
import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "../src/globals.css";
import "../src/i18n/i18n";

import { TooltipProvider } from "@wealthfolio/ui";
import { PrivacyProvider } from "../src/context/privacy-context";
import { MerchantDialog } from "../src/features/spending/components/merchant-dialog";

const KEY = "pk_FHt7GAy8SDi6PcR_DZGWmg";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/api/money-hub/logo-key/logo")) {
    const site = String(JSON.parse(String(init?.body ?? "{}")).site ?? "")
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];
    const r = await realFetch(`https://img.logo.dev/${site}?token=${KEY}&size=256&format=png&fallback=404`);
    if (!r.ok) return json({ error: `logo.dev has no logo for ${site}. Check the spelling, or choose a picture yourself.` }, 404);
    return new Response(await r.blob(), { status: 200, headers: { "Content-Type": "image/png", "X-Logo-Site": site } });
  }
  if (url.includes("/api/money-hub/merchants")) return json([]);
  if (url.startsWith("/api/")) return json({});
  return realFetch(input, init);
};

const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <PrivacyProvider>
          <MemoryRouter>
            <MerchantDialog draft={{ name: "Starbucks", pattern: "STARBUCKS" }} onClose={() => undefined} />
          </MemoryRouter>
        </PrivacyProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
