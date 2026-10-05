// money-hub patch: Rules, Actions, "Rename to" (owner, 2026-10-05: "add support to rename the
// transactions in Rules > Actions"). The rules have no such column, so a rule's new name lives in the
// money-hub service (server/drive-backup/lib/ruleRenames.js, helper/rule-renames.json by rule id) and
// is applied here, for display only: the bank's text is untouched, so matching and search are too.
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { useCategorizationRules } from "../hooks/use-categorization-rules";
import type { CategorizationRule } from "../types/rule";

const BASE = "/api/money-hub/rule-renames";
const KEY = ["money-hub", "rule-renames"];

/** Rule id -> the name its transactions show. */
export type RuleRenames = Record<string, string>;

export function useRuleRenames() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<RuleRenames> => {
      const res = await fetch(BASE, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });
}

/** Saves one rule's new name (empty removes it) when it changed. */
export async function saveRuleRename(qc: QueryClient, ruleId: string, name: string) {
  const next = name.trim();
  const now = qc.getQueryData<RuleRenames>(KEY)?.[ruleId] ?? "";
  if (next === now) return;
  const res = await fetch(`${BASE}/${encodeURIComponent(ruleId)}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: next }),
  });
  if (!res.ok) throw new Error("The new name could not be saved.");
  qc.setQueryData<RuleRenames>(KEY, (old) => {
    const out = { ...(old ?? {}) };
    if (next) out[ruleId] = next;
    else delete out[ruleId];
    return out;
  });
}

export interface RuleTarget {
  notes?: string | null;
  activityType?: string | null;
  accountId?: string | null;
  amount?: number | string | null;
}

/** Same conditions as the server's matcher (crates/spending/.../matcher.rs). */
export function ruleMatches(rule: CategorizationRule, t: RuleTarget): boolean {
  if (!rule.isGlobal && rule.accountId !== t.accountId) return false;
  if (rule.activityType && rule.activityType !== t.activityType) return false;
  if (rule.amountOp) {
    const amt = t.amount == null || t.amount === "" ? NaN : Math.abs(Number(t.amount));
    const v = rule.amountValue;
    if (!Number.isFinite(amt) || v == null) return false;
    const ok =
      rule.amountOp === "eq"
        ? amt === v
        : rule.amountOp === "gt"
          ? amt > v
          : rule.amountOp === "gte"
            ? amt >= v
            : rule.amountOp === "lt"
              ? amt < v
              : rule.amountValue2 != null && amt >= v && amt <= rule.amountValue2;
    if (!ok) return false;
  }
  const raw = t.notes ?? "";
  const up = raw.toUpperCase();
  const pat = rule.pattern.toUpperCase();
  switch (rule.matchType) {
    case "contains":
      return up.includes(pat);
    case "starts_with":
      return up.startsWith(pat);
    case "exact":
      return up === pat;
    case "regex":
      try {
        return new RegExp(rule.pattern).test(raw);
      } catch {
        return false;
      }
  }
}

/** The new name for a transaction: from the highest priority matching rule that renames. */
export function renameFor(
  rules: CategorizationRule[] | undefined,
  renames: RuleRenames | undefined,
  target: RuleTarget,
): string | null {
  if (!rules || !renames) return null;
  let best: CategorizationRule | null = null;
  for (const r of rules) {
    if (!renames[r.id] || (best && r.priority <= best.priority)) continue;
    if (ruleMatches(r, target)) best = r;
  }
  return best ? renames[best.id] : null;
}

export function useRuleRename(target: RuleTarget): string | null {
  const { data: rules } = useCategorizationRules();
  const { data: renames } = useRuleRenames();
  const { notes, activityType, accountId, amount } = target;
  return useMemo(
    () => renameFor(rules, renames, { notes, activityType, accountId, amount }),
    [rules, renames, notes, activityType, accountId, amount],
  );
}
