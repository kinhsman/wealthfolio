// money-hub patch: after the owner files a transaction under a category by hand, offer a rule for
// transactions like it (owner, 2026-09-30: "when i edit a transaction, offer a rule creation, and
// rerun rules only on that specific rule i just added"). Making the rule re-files only what that
// rule matches: the bank-imported entries go through the money-hub service
// (/api/money-hub/plaid/apply-rule, server/drive-backup/lib/plaidSync.js applyRules), because
// Wealthfolio's own re-run treats their categories as picked by hand and never changes them.
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { QueryKeys } from "@/lib/query-keys";

import { createCategorizationRule, listCategorizationRules } from "../adapters/rules";
import { invalidateSpendingCaches } from "./invalidation";

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

/** Re-files what this one rule matches; null when the service could not do it now. */
async function applyOnly(ruleId: string): Promise<number | null> {
  try {
    const res = await fetch("/api/money-hub/plaid/apply-rule", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ruleId }),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { changed?: number }).changed ?? 0;
  } catch {
    return null;
  }
}

/** Shows the offer as a toast with a Make a rule button, unless a rule for these words exists. */
export async function offerRule(
  qc: QueryClient,
  { notes, taxonomyId, categoryId, categoryName }: { notes?: string | null; taxonomyId: string; categoryId: string; categoryName: string },
): Promise<void> {
  const pattern = rulePatternFrom(notes);
  if (!pattern) return;
  const rules = await listCategorizationRules().catch(() => []);
  if (rules.some((r) => !r.presetId && r.pattern.trim().toLowerCase() === pattern.toLowerCase())) return;

  const make = async () => {
    try {
      const rule = await createCategorizationRule({
        name: pattern,
        pattern,
        matchType: "contains",
        taxonomyId,
        categoryId,
        priority: 0,
        isGlobal: true,
      });
      qc.invalidateQueries({ queryKey: [QueryKeys.SPENDING_RULES] });
      const n = await applyOnly(rule.id);
      invalidateSpendingCaches(qc);
      toast.success(
        n == null
          ? "Rule made. Transactions like it are filed within a minute."
          : n > 0
            ? `Rule made. ${n} more filed as ${categoryName}.`
            : "Rule made. Nothing else matched it yet.",
      );
    } catch (e) {
      toast.error(`The rule was not made: ${(e as Error)?.message ?? String(e)}`);
    }
  };

  toast(`Always file "${pattern}" as ${categoryName}?`, {
    duration: 12000,
    action: { label: "Make a rule", onClick: () => void make() },
  });
}
