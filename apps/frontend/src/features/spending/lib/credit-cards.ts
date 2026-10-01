// money-hub patch: the credit cards' balances (owner, 2026-10-01: "a new section showing creditcard
// balance"). The money-hub service reads them from Plaid at each bank sync (server/drive-backup/
// lib/plaidSync.js cardsView); this file reads them and words them.
import { useQuery } from "@tanstack/react-query";

export interface CreditCard {
  /** Plaid's account id. */
  id: string;
  itemId: string;
  wfAccountId: string;
  name: string;
  bank: string;
  bankLogo: string | null;
  mask: string | null;
  currency: string;
  /** What the bank shows as owed now (posted only). Below zero: a credit on the card. */
  owed: number;
  /** The card's pending charges less pending refunds: owed once they post. */
  pending: number;
  pendingCount: number;
  limit: number | null;
  available: number | null;
  /** When the money app last read the bank. */
  asOf: string | null;
  needsLogin: boolean;
  error: string | null;
}

export interface CreditCardsView {
  cards: CreditCard[];
  totals: {
    count: number;
    owed: number;
    pending: number;
    limit: number | null;
    available: number | null;
    /** Owed over the limit, of the cards with one. */
    usedPct: number | null;
  };
  asOf: string | null;
}

export const CREDIT_CARDS_KEY = ["money-hub", "credit-cards"] as const;

async function get(): Promise<CreditCardsView> {
  const res = await fetch("/api/money-hub/plaid/cards", { credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      (data as { error?: string }).error || `The money app helper said ${res.status}`,
    );
  return data as CreditCardsView;
}

export function useCreditCards() {
  return useQuery({ queryKey: CREDIT_CARDS_KEY, queryFn: get, staleTime: 60 * 1000 });
}

/** Credit used past this share of the limit reads as high (it starts to weigh on a credit score). */
export const HIGH_USE = 0.3;

/** Owed over the limit (0 when the card holds a credit), or null without a limit. */
export function usedShare(c: Pick<CreditCard, "owed" | "limit">): number | null {
  if (c.limit == null || c.limit <= 0) return null;
  return Math.max(0, c.owed) / c.limit;
}

/** "8.6%", "0.4%", "<0.1%", "0%". */
export function pctLabel(share: number): string {
  if (share <= 0) return "0%";
  if (share < 0.001) return "<0.1%";
  return `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`;
}

/** "11:48 AM" today, "yesterday", else "Sep 28", in the reader's time zone. */
export function asOfLabel(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const day = (d: Date) => d.toLocaleDateString("en-CA");
  if (day(at) === day(now))
    return at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (day(at) === day(yesterday)) return "yesterday";
  return at.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The card's name as the money app shows it, with its last four digits when the name has none. */
export function cardName(
  c: Pick<CreditCard, "name" | "mask">,
  accountName?: string | null,
): string {
  const name = accountName?.trim() || c.name;
  return c.mask && !name.includes(c.mask) ? `${name} ••${c.mask}` : name;
}

/** The card's transactions in the Spending list. */
export const cardTransactionsHref = (c: Pick<CreditCard, "wfAccountId">) =>
  `/activities?tab=spending&account=${encodeURIComponent(c.wfAccountId)}`;
