// money-hub patch: Settings, Appearance, Company logos with fixture answers, for a true-size picture before shipping
// (vite.preview.config.ts). ?theme=light|dark. The key is kept in memory here, nothing is sent.
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "../src/globals.css";
import "../src/i18n/i18n";

import { LogoKeyCard } from "../src/pages/settings/appearance/logo-key-card";

let key: string | null = "pk_FHt7GAy8SDi6PcR_DZGWmg";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/api/money-hub/logo-key")) {
    if ((init?.method || "GET") === "PUT") {
      const k = String(JSON.parse(String(init?.body ?? "{}")).key ?? "").trim();
      if (k.startsWith("sk_")) return json({ error: "That is a secret key (sk_). Use the publishable key, the one that starts pk_." }, 400);
      key = k || null;
    }
    return json({ key });
  }
  return realFetch(input, init);
};

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <div className="mx-auto max-w-2xl p-4">
        <LogoKeyCard />
      </div>
    </QueryClientProvider>
  </React.StrictMode>,
);
