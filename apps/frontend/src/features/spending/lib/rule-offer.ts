// money-hub patch: after the owner files a transaction under a category by hand, offer a rule for
// transactions like it (owner, 2026-09-30: "when i edit a transaction, offer a rule creation, and
// rerun rules only on that specific rule i just added"; then "make the button bigger, also open a
// modal to preview and confirm the rule before apply"). The toast's Make a rule opens the preview
// (components/rule-offer-dialog.tsx, mounted once in App.tsx); making the rule there re-files only
// what that rule matches: the bank-imported entries go through the money-hub service
// (/api/money-hub/plaid/preview-rule and /apply-rule, server/drive-backup/lib/plaidSync.js),
// because Wealthfolio's own re-run treats their categories as picked by hand and never changes them.
import { toast } from "sonner";

import { listCategorizationRules } from "../adapters/rules";

/**
 * The words a rule should look for: the bank's text up to its first reference number
 * ("ATM CASH DEPOSIT 09/23 5831 N MILWAUKEE AVE" gives "ATM CASH DEPOSIT", "Costco" stays
 * "Costco"). Null for text the bank import labelled itself ("Friend (Nga): ...",
 * "Rent received: ..."), which rules leave alone.
 */
export function rulePatternFrom(notes?: string | null): string | null {
  const text = (notes ?? "").trim();
  if (!text || /^[^:]{1,40}:\s/.test(text)) return null;
  const words: string[] = [];
  for (const w of text.split(/\s+/)) {
    if (/\d/.test(w)) break;
    words.push(w);
  }
  const pattern = words.join(" ").trim();
  return pattern.length >= 3 ? pattern : null;
}

export interface RuleOffer {
  pattern: string;
  taxonomyId: string;
  categoryId: string;
}

// The one open offer, for the dialog host (a tiny store: the toast outlives the form that raised it).
let current: RuleOffer | null = null;
const listeners = new Set<() => void>();
export const ruleOfferStore = {
  get: () => current,
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  open: (offer: RuleOffer) => {
    current = offer;
    listeners.forEach((fn) => fn());
  },
  close: () => {
    current = null;
    listeners.forEach((fn) => fn());
  },
};

/** Shows the offer as a toast with a Make a rule button, unless a rule for these words exists. */
export async function offerRule({
  notes,
  taxonomyId,
  categoryId,
  categoryName,
}: {
  notes?: string | null;
  taxonomyId: string;
  categoryId: string;
  categoryName: string;
}): Promise<void> {
  const pattern = rulePatternFrom(notes);
  if (!pattern) return;
  const rules = await listCategorizationRules().catch(() => []);
  if (rules.some((r) => !r.presetId && r.pattern.trim().toLowerCase() === pattern.toLowerCase())) return;
  toast(`Always file "${pattern}" as ${categoryName}?`, {
    duration: 15000,
    action: { label: "Make a rule", onClick: () => ruleOfferStore.open({ pattern, taxonomyId, categoryId }) },
    // Sonner's action button is a small chip; this one is the point of the toast.
    actionButtonStyle: { height: 32, padding: "0 14px", fontSize: 13, fontWeight: 600, borderRadius: 6 },
  });
}
