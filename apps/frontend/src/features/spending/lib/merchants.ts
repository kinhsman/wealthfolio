// money-hub patch: the owner's merchant logos on transactions (2026-09-30: "user will upload
// merchant logo, then create a matching pattern, then it add to the transactions"). The merchants
// (name, words to look for, logo shrunk to 128 by 128 on save) live in the money-hub service at
// /api/money-hub/merchants (server/drive-backup/lib/merchants.js); matching happens here.
import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface Merchant {
  id: string;
  name: string;
  pattern: string;
  logoUrl: string;
  updatedAt?: string;
  /** "owly": an Owly friend's photo on their Zelle transactions (read only; changed in Owly). */
  source?: "owly";
}

const BASE = "/api/money-hub/merchants";
export const MERCHANTS_KEY = ["money-hub", "merchants"] as const;

async function call<T>(method: string, path: string, body?: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method, credentials: "include", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `The money app helper said ${res.status}`);
  return data as T;
}

const form = (fields: { name: string; pattern: string; logo?: File | null }) => {
  const f = new FormData();
  f.set("name", fields.name);
  f.set("pattern", fields.pattern);
  if (fields.logo) f.set("logo", fields.logo);
  return f;
};

export const merchantsApi = {
  list: () => call<Merchant[]>("GET", ""),
  create: (fields: { name: string; pattern: string; logo: File }) => call<Merchant[]>("POST", "", form(fields)),
  update: (id: string, fields: { name: string; pattern: string; logo?: File | null }) =>
    call<Merchant[]>("PUT", `/${encodeURIComponent(id)}`, form(fields)),
  remove: (id: string) => call<Merchant[]>("DELETE", `/${encodeURIComponent(id)}`),
};

export function useMerchants() {
  return useQuery({ queryKey: MERCHANTS_KEY, queryFn: merchantsApi.list, staleTime: 5 * 60 * 1000 });
}

export function useSetMerchants() {
  const qc = useQueryClient();
  return (list: Merchant[]) => qc.setQueryData(MERCHANTS_KEY, list);
}

/** The merchant whose words the text contains (any case); the longest words win, so "Costco Gas"
 *  beats "Costco". */
export function merchantFor(notes: string | null | undefined, merchants: Merchant[] | undefined): Merchant | null {
  const text = (notes ?? "").toUpperCase();
  if (!text || !merchants?.length) return null;
  let best: Merchant | null = null;
  for (const m of merchants) {
    const p = m.pattern.trim().toUpperCase();
    if (p && text.includes(p) && (!best || p.length > best.pattern.trim().length)) best = m;
  }
  return best;
}

/** One transaction's merchant, from the shared list. */
export function useMerchantFor(notes: string | null | undefined): Merchant | null {
  const { data } = useMerchants();
  return merchantFor(notes, data);
}

export interface MerchantDraft {
  merchant?: Merchant;
  name?: string;
  pattern?: string;
}
