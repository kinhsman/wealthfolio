// money-hub patch: the bank's own line under each bank entry in the transaction list, and the
// transaction search widened to every field the bank sent (owner, 2026-10-01: "show the bank line
// in the list too; also expand the transactions search to search through all these new fields ...
// i tried 1366005820 it came back nothing"). The money app's own search reads the payee only, and
// it lives in the server we do not rebuild, so the widening happens here: the money-hub service
// (server/drive-backup/lib/plaidSync.js searchBank) names the entries whose bank fields match, and
// searchCashActivities keeps payee matches plus those, with the net summed the server's way.
import { useQuery } from "@tanstack/react-query";

import type {
  CashActivity,
  CashActivitySearchRequest,
  CashActivitySearchResponse,
  NetSummary,
} from "../types/cash-activity";

const BASE = "/api/money-hub/plaid";

/** Entry id -> [the bank's own line, every word the bank wrote] (server: plaidSync.js bankLines). */
export type BankLines = Record<string, [string, string]>;

export function useBankLines() {
  return useQuery({
    queryKey: ["money-hub", "plaid", "lines", 2],
    queryFn: async (): Promise<BankLines> => {
      const res = await fetch(`${BASE}/lines`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** The bank line worth showing under a payee: none when it only repeats the payee. */
export function bankLineFor(lines: BankLines | undefined, activity: CashActivity) {
  const line = lines?.[activity.id]?.[0];
  if (!line) return null;
  return squash(line) === squash(activity.notes ?? "") ? null : line;
}

/** Every word the bank wrote for one entry (merchant logos match these when the payee matches none). */
export const bankWordsFor = (lines: BankLines | undefined, id: string) => lines?.[id]?.[1] ?? null;

async function bankHits(q: string): Promise<Set<string>> {
  try {
    const res = await fetch(`${BASE}/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
    if (!res.ok) return new Set();
    return new Set(((await res.json()) as { ids?: string[] }).ids ?? []);
  } catch {
    return new Set();
  }
}

/** Net of a set of rows the way the server sums it: per currency, converted only across several. */
export function netOf(items: CashActivity[]): NetSummary {
  const tallies = new Map<string, { cents: number; base: number | null }>();
  for (const a of items) {
    const cents = Math.round((a.netAmount ?? 0) * 100);
    if (!cents) continue;
    const t = tallies.get(a.currency) ?? { cents: 0, base: 0 };
    t.cents += cents;
    t.base = t.base === null || a.netAmountBase == null ? null : t.base + a.netAmountBase;
    tallies.set(a.currency, t);
  }
  const contributing = [...tallies].filter(([, t]) => t.cents !== 0);
  const byCurrency = contributing.map(([currency, t]) => ({ currency, amount: t.cents / 100 }));
  const total =
    contributing.length > 1 && contributing.every(([, t]) => t.base !== null)
      ? contributing.reduce((s, [, t]) => s + (t.base ?? 0), 0)
      : null;
  return { byCurrency, converted: total === null ? null : { currency: "", amount: total } };
}

const PAGE = 1000; // the server's own cap per request
let full: { key: string; at: number; items: CashActivity[]; baseCurrency?: string | null } | null = null;

/**
 * A search over the payee AND every bank field. Without bank matches it is the server's own search,
 * untouched. With them, every row the other filters keep is read (pages of 1,000; reused for the
 * later pages of the same search for a minute) and narrowed here.
 */
export async function searchWithBankFields(
  request: CashActivitySearchRequest,
  serverSearch: (r: CashActivitySearchRequest) => Promise<CashActivitySearchResponse>,
): Promise<CashActivitySearchResponse> {
  const needle = request.search?.trim().toLowerCase();
  if (!needle) return serverSearch(request);
  const hits = await bankHits(needle);
  if (!hits.size) return serverSearch(request);

  const { offset = 0, limit = 50, search: _search, ...filters } = request;
  const key = JSON.stringify({ ...filters, needle });
  if (!full || full.key !== key || offset === 0 || Date.now() - full.at > 60_000) {
    const items: CashActivity[] = [];
    let baseCurrency: string | null | undefined;
    for (;;) {
      const r = await serverSearch({ ...filters, offset: items.length, limit: PAGE });
      baseCurrency ??= r.baseCurrency;
      items.push(...r.items);
      if (!r.items.length || items.length >= r.totalCount) break;
    }
    full = { key, at: Date.now(), baseCurrency, items: items.filter((a) => (a.notes ?? "").toLowerCase().includes(needle) || hits.has(a.id)) };
  }
  const net = offset === 0 ? netOf(full.items) : null;
  if (net?.converted) net.converted.currency = full.baseCurrency ?? "";
  return {
    items: full.items.slice(offset, offset + limit),
    totalCount: full.items.length,
    net,
    baseCurrency: full.baseCurrency,
  };
}
