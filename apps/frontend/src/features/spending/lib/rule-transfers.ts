// money-hub patch: Rules, "Also match bank transfers" (owner, 2026-10-07: the Make a rule window said
// "0 matches" for Capital One card payments). A payment to a card the money app does not have is a
// transfer, which rules skip. The rules have no column for this, so each rule's switch lives in the
// money-hub service (server/drive-backup/lib/ruleTransfers.js, helper/rule-transfers.json by rule id),
// the same way as lib/rule-renames.ts. Off unless switched on.
import { useQuery, type QueryClient } from "@tanstack/react-query";

const BASE = "/api/money-hub/rule-transfers";
const KEY = ["money-hub", "rule-transfers"];

/** Rule id -> true, for the rules that also match bank transfers. */
export type RuleTransfers = Record<string, boolean>;

export function useRuleTransfers() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<RuleTransfers> => {
      const res = await fetch(BASE, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });
}

/** Saves one rule's switch when it changed. */
export async function saveRuleTransfers(qc: QueryClient, ruleId: string, on: boolean) {
  const now = !!qc.getQueryData<RuleTransfers>(KEY)?.[ruleId];
  if (on === now) return;
  const res = await fetch(`${BASE}/${encodeURIComponent(ruleId)}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ on }),
  });
  if (!res.ok) throw new Error("The bank transfers setting could not be saved.");
  qc.setQueryData<RuleTransfers>(KEY, (old) => {
    const out = { ...(old ?? {}) };
    if (on) out[ruleId] = true;
    else delete out[ruleId];
    return out;
  });
}
