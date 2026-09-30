// money-hub patch: the owner's merchant logos on transactions (2026-09-30: "user will upload
// merchant logo, then create a matching pattern, then it add to the transactions"). The merchants
// (name, words to look for, logo shrunk to 128 by 128 on save) live in the money-hub service at
// /api/money-hub/merchants (server/drive-backup/lib/merchants.js); matching happens here.
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { accountLogoUrl } from "@/lib/account-logo";
import type { Account } from "@/lib/types";

export interface Merchant {
  id: string;
  name: string;
  /** The first of `patterns` (merchants saved before they had several words). */
  pattern: string;
  /** Any of these words shows the logo (owner, 09-30: "multiple keywords ... in OR operation"). */
  patterns?: string[];
  logoUrl: string;
  updatedAt?: string;
  /** "owly": an Owly friend's photo on their Zelle transactions (read only; changed in Owly).
   *  "bank": the logo of the bank holding an ATM transaction's account (read only). */
  source?: "owly" | "bank";
}

type AccountLike = Pick<Account, "id" | "name" | "group" | "meta">;

/** ATM cash shows the bank that holds the account (owner, 09-30: "for ATM keyword use the bank
 *  icon linked with the transaction"): that bank's logo, ahead of any merchant. Bank accounts
 *  only (meta.source "plaid"), so Owly's "Owed to me" keeps its usual look. */
export function bankFor(text: string | null | undefined, account?: AccountLike | null): Merchant | null {
  if (!text || !account || !contains(text.toUpperCase(), "ATM")) return null;
  let source: unknown;
  try {
    const meta = typeof account.meta === "string" ? JSON.parse(account.meta) : account.meta;
    source = (meta as { source?: unknown } | null)?.source;
  } catch {
    return null;
  }
  const logoUrl = accountLogoUrl(account);
  if (source !== "plaid" || !logoUrl) return null;
  const name = account.group || account.name;
  return { id: `bank:${account.id}`, name, pattern: "ATM", patterns: ["ATM"], logoUrl, source: "bank" };
}

const BASE = "/api/money-hub/merchants";
export const MERCHANTS_KEY = ["money-hub", "merchants"] as const;

async function call<T>(method: string, path: string, body?: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method, credentials: "include", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `The money app helper said ${res.status}`);
  return data as T;
}

const form = (fields: { name: string; patterns: string[]; logo?: File | null }) => {
  const f = new FormData();
  f.set("name", fields.name);
  f.set("patterns", JSON.stringify(fields.patterns));
  if (fields.logo) f.set("logo", fields.logo);
  return f;
};

export const merchantsApi = {
  list: () => call<Merchant[]>("GET", ""),
  create: (fields: { name: string; patterns: string[]; logo: File }) => call<Merchant[]>("POST", "", form(fields)),
  update: (id: string, fields: { name: string; patterns: string[]; logo?: File | null }) =>
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

/** Short words (4 letters or fewer) count only as a whole word: "UPS" must not light up
 *  "CUPS COFFEE", nor "BP" a word that merely contains it. */
const contains = (text: string, p: string) => {
  if (p.length > 4) return text.includes(p);
  for (let i = text.indexOf(p); i !== -1; i = text.indexOf(p, i + 1)) {
    const before = text[i - 1];
    const after = text[i + p.length];
    if ((!before || !/[\p{L}\p{N}]/u.test(before)) && (!after || !/[\p{L}\p{N}]/u.test(after))) return true;
  }
  return false;
};

export const wordsOf = (m: Pick<Merchant, "pattern" | "patterns">): string[] =>
  (m.patterns?.length ? m.patterns : [m.pattern]).map((w) => w.trim()).filter(Boolean);

/** The length of the longest of these words the text contains (any case), or 0 for none. */
export function matchLength(text: string | null | undefined, words: string[]): number {
  const t = (text ?? "").toUpperCase();
  let best = 0;
  for (const w of words) {
    const p = w.trim().toUpperCase();
    if (p && p.length > best && contains(t, p)) best = p.length;
  }
  return best;
}

/** The merchant with any of its words in the text (any case); the longest matching words win, so
 *  "Costco Gas" beats "Costco". ATM cash on a bank account shows that bank (bankFor) first. */
export function merchantFor(
  notes: string | null | undefined,
  merchants: Merchant[] | undefined,
  account?: AccountLike | null,
): Merchant | null {
  const bank = bankFor(notes, account);
  if (bank) return bank;
  if (!notes || !merchants?.length) return null;
  let best: Merchant | null = null;
  let bestLen = 0;
  for (const m of merchants) {
    const len = matchLength(notes, wordsOf(m));
    if (len > bestLen) {
      best = m;
      bestLen = len;
    }
  }
  return best;
}

/** One transaction's merchant, from the shared list (its account: the bank for ATM cash). */
export function useMerchantFor(notes: string | null | undefined, account?: AccountLike | null): Merchant | null {
  const { data } = useMerchants();
  return merchantFor(notes, data, account);
}

export interface MerchantDraft {
  merchant?: Merchant;
  name?: string;
  pattern?: string;
}
