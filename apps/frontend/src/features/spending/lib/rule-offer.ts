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

/** Text the bank import labelled itself ("Friend (Nga): ...", "Rent received: ..."): rules leave it alone. */
const importLabelled = (text: string) => /^[^:]{1,40}:\s/.test(text);

/**
 * The words a rule should look for: the bank's text up to its first reference number
 * ("ATM CASH DEPOSIT 09/23 5831 N MILWAUKEE AVE" gives "ATM CASH DEPOSIT", "Costco" stays
 * "Costco"). A word with a date or code glued on keeps its letters when there are 3 or more
 * (ACB's "FAMILY-031026-10:03:04 6276ASCB02EQFHSU" gives "FAMILY"; owner, 10-02: no offer
 * came for it). Null for text the bank import labelled itself, and for text with no such words.
 */
export function rulePatternFrom(notes?: string | null): string | null {
  const text = (notes ?? "").trim();
  if (!text || importLabelled(text)) return null;
  const words: string[] = [];
  for (const w of text.split(/\s+/)) {
    const digit = w.search(/\d/);
    if (digit < 0) {
      words.push(w);
      continue;
    }
    const head = w.slice(0, digit).replace(/[^\p{L}]+$/u, "");
    if (head.length >= 3) words.push(head);
    break;
  }
  // No dangling dash or bracket before the number ("chuyen tien (LAM THANH SANG - 48438917)").
  const pattern = words.join(" ").replace(/[\s([{\-–—:;,.\/#*&+]+$/u, "");
  return pattern.length >= 3 ? pattern : null;
}

export interface RuleOffer {
  /** The words to start with; empty when the text gave none (the owner types them). */
  pattern: string;
  taxonomyId: string;
  categoryId: string;
  /** Runs once the rule is made (a subscription's edit window: scan again so its charges join). */
  onDone?: () => void;
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

/**
 * Shows the offer as a toast with a Make a rule button, unless a rule for these words exists.
 * Text with no words to pick (a reference number first) still gets it, with the words left to type.
 */
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
  const text = (notes ?? "").trim();
  if (!text || importLabelled(text)) return;
  const pattern = rulePatternFrom(text) ?? "";
  if (pattern) {
    const rules = await listCategorizationRules().catch(() => []);
    if (rules.some((r) => !r.presetId && r.pattern.trim().toLowerCase() === pattern.toLowerCase())) return;
  }
  const title = pattern ? `Always file "${pattern}" as ${categoryName}?` : `Always file transactions like this as ${categoryName}?`;
  toast(title, {
    duration: 15000,
    action: { label: "Make a rule", onClick: () => ruleOfferStore.open({ pattern, taxonomyId, categoryId }) },
    // Sonner's action button is a small chip; this one is the point of the toast.
    actionButtonStyle: { height: 32, padding: "0 14px", fontSize: 13, fontWeight: 600, borderRadius: 6 },
  });
}
