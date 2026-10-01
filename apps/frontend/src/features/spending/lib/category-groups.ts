// money-hub patch: which categories' charges are subscriptions or bills, chosen per category in
// Settings, Spending, Categories (owner, 2026-10-01: "add the ability to enable subscription for any
// category in the settings page"; Bank Fees asked nothing). The money-hub service owns the answer
// (server/drive-backup/lib/subscriptions.js categoryGroupsOf: the owner's choice, else the parent's,
// else its built-in lists), so the "which one is it?" window, the scan and Subscriptions & bills agree.
import { useQuery, type QueryClient } from "@tanstack/react-query";

import type { StreamGroup } from "./subscriptions";

export type CategoryChoice = StreamGroup | "off";

export interface CategoryGroups {
  /** Category id -> what its charges are now (null: not tracked). */
  groups: Record<string, StreamGroup | null>;
  /** The owner's own choices, by category id. */
  chosen: Record<string, CategoryChoice>;
}

const BASE = "/api/money-hub/subscriptions/categories";
export const CATEGORY_GROUPS_KEY = ["money-hub", "subscriptions", "categories"] as const;

// The last answer, for code that asks outside React (lib/track-charge.ts trackGroupFor).
let cache: CategoryGroups | null = null;
export const cachedCategoryGroup = (id: string): StreamGroup | null | undefined =>
  cache && id in cache.groups ? cache.groups[id] : undefined;

export function useCategoryGroups() {
  return useQuery({
    queryKey: CATEGORY_GROUPS_KEY,
    queryFn: async (): Promise<CategoryGroups> => {
      const res = await fetch(BASE, { credentials: "include" });
      if (!res.ok) throw new Error(`The money app helper said ${res.status}`);
      cache = (await res.json()) as CategoryGroups;
      return cache;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Saves one category's choice; null puts it back to the built-in one. */
export async function saveCategoryGroup(qc: QueryClient, id: string, group: CategoryChoice | null) {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ group }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "The choice could not be saved.");
  cache = data as CategoryGroups;
  qc.setQueryData(CATEGORY_GROUPS_KEY, cache);
}
