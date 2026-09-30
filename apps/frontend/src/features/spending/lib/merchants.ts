// money-hub patch: the owner's merchant logos on transactions (2026-09-30: "user will upload
// merchant logo, then create a matching pattern, then it add to the transactions"). The merchants
// (name, words to look for, logo shrunk to 128 by 128 on save) live in the money-hub service at
// /api/money-hub/merchants (server/drive-backup/lib/merchants.js); matching happens here.
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { accountLogoUrl } from "@/lib/account-logo";
import type { Account } from "@/lib/types";

import { isCreditCardAccountType } from "./constants";

export interface Merchant {
  id: string;
  name: string;
  /** The first of `patterns` (merchants saved before they had several words). */
  pattern: string;
  /** Any of these words shows the logo (owner, 09-30: "multiple keywords ... in OR operation"). */
  patterns?: string[];
  /** Null for a merchant that uses the bank's logo (`useBank`). */
  logoUrl: string | null;
  /** "Use the bank's logo" (owner, 09-30: "is there a way to just toggle use bank icon for
   *  transactions instead of using a merchant?"): each matching transaction shows the logo of the
   *  bank it is on. */
  useBank?: boolean;
  updatedAt?: string;
  /** "owly": an Owly friend's photo on their Zelle transactions (read only; changed in Owly).
   *  "bank": the logo of the bank holding the account (read only). */
  source?: "owly" | "bank";
  /** On a "bank" one: the owner's merchant that asked for the bank's logo (none: built in). */
  from?: Merchant;
}

type AccountLike = Pick<Account, "id" | "name" | "group" | "meta"> & { accountType?: string };

/** The bank holding the account, as a merchant: its name and logo. Bank accounts only
 *  (meta.source "plaid"), so Owly's "Owed to me" keeps its usual look. */
function bankOf(account: AccountLike | null | undefined, id: string, pattern: string): Merchant | null {
  if (!account) return null;
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
  return { id: `bank:${account.id}:${id}`, name, pattern, patterns: [pattern], logoUrl, source: "bank" };
}

/** Built in, ahead of any merchant, where words cannot tell: a payment arriving on a credit card
 *  (owner, 09-30: "make credit card payments showing their bank logo as merchant"; the import makes
 *  those TRANSFER_IN, refunds are CREDIT; the paying side's text names the card's bank, so the
 *  owner's merchants cover it) and interest, earned or charged. Everything else that should show
 *  the bank (ATM cash, fees, perks) is a merchant with "Use the bank's logo", the owner's to change. */
export function bankFor(account?: AccountLike | null, activityType?: string | null): Merchant | null {
  if (!account) return null;
  if (isCreditCardAccountType(account.accountType) && activityType === "TRANSFER_IN") {
    return bankOf(account, "card-payment", "Card payment");
  }
  if (activityType === "INTEREST") return bankOf(account, "interest", "Interest");
  return null;
}

const BASE = "/api/money-hub/merchants";
export const MERCHANTS_KEY = ["money-hub", "merchants"] as const;

async function call<T>(method: string, path: string, body?: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method, credentials: "include", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `The money app helper said ${res.status}`);
  return data as T;
}

interface MerchantFields {
  name: string;
  patterns: string[];
  logo?: File | null;
  useBank?: boolean;
}

const form = (fields: MerchantFields) => {
  const f = new FormData();
  f.set("name", fields.name);
  f.set("patterns", JSON.stringify(fields.patterns));
  if (fields.useBank !== undefined) f.set("useBank", String(fields.useBank));
  if (fields.logo && !fields.useBank) f.set("logo", fields.logo);
  return f;
};

export const merchantsApi = {
  list: () => call<Merchant[]>("GET", ""),
  create: (fields: MerchantFields) => call<Merchant[]>("POST", "", form(fields)),
  update: (id: string, fields: MerchantFields) =>
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
 *  "Costco Gas" beats "Costco". Card payments and interest show the account's bank (bankFor) first;
 *  a merchant with "Use the bank's logo" shows the bank of the transaction's account (skipped where
 *  that account has none), unless a merchant with its own picture matches too: that one wins. */
export function merchantFor(
  notes: string | null | undefined,
  merchants: Merchant[] | undefined,
  account?: AccountLike | null,
  activityType?: string | null,
): Merchant | null {
  const bank = bankFor(account, activityType);
  if (bank) return bank;
  if (!notes || !merchants?.length) return null;
  // A merchant with its own picture wins over a "Use the bank's logo" one, whatever the words'
  // length (owner, 2026-09-30); among each kind the longest matching words win.
  let own: Merchant | null = null;
  let ownLen = 0;
  let viaBank: Merchant | null = null;
  let bankLen = 0;
  for (const m of merchants) {
    const len = matchLength(notes, wordsOf(m));
    if (!len) continue;
    if (!m.useBank) {
      if (len > ownLen) {
        own = m;
        ownLen = len;
      }
      continue;
    }
    if (len <= bankLen) continue;
    const shown = bankOf(account, m.id, m.name);
    if (!shown) continue;
    viaBank = { ...shown, from: m };
    bankLen = len;
  }
  return own ?? viaBank;
}

/** One transaction's merchant, from the shared list (its account and type: for the bank's logo). */
export function useMerchantFor(
  notes: string | null | undefined,
  account?: AccountLike | null,
  activityType?: string | null,
): Merchant | null {
  const { data } = useMerchants();
  return merchantFor(notes, data, account, activityType);
}

export interface MerchantDraft {
  merchant?: Merchant;
  name?: string;
  pattern?: string;
}
