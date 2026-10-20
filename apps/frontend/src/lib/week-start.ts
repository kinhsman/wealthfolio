// money-hub patch: the first day of the week (owner, 2026-10-20: "how to make the week start with monday?"). The
// region setting decides it otherwise, and picking a region with a Monday week would also change how every amount
// and date is written, so the week has its own choice on Settings, General. Kept by the money-hub service with the
// Calendar's settings (server/drive-backup/lib/dates.js `weekStart`), so the phone and the computer agree; every
// calendar reads it through the formatters (settings-provider gives it to FormattingProvider).
import { useQuery, useQueryClient } from "@tanstack/react-query";

export type WeekStart = 0 | 1 | null;

const KEY = ["money-hub", "week-start"] as const;
const BASE = "/api/money-hub/dates";

/** The owner's first day of the week: 0 Sunday, 1 Monday, null = the region's own (also while loading). */
export function useWeekStart(): WeekStart {
  const { data } = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<WeekStart> => {
      const res = await fetch(`${BASE}/prefs`, { credentials: "include" });
      // Signed out or the helper away: no answer kept, so the next page load asks again.
      if (!res.ok) throw new Error(`The money app helper said ${res.status}`);
      const w = ((await res.json().catch(() => ({}))) as { weekStart?: unknown }).weekStart;
      return w === 0 || w === 1 ? w : null;
    },
    staleTime: 10 * 60_000,
    retry: false,
  });
  return data ?? null;
}

/** Saves the choice; every calendar follows at once. */
export function useSetWeekStart() {
  const qc = useQueryClient();
  return async (weekStart: WeekStart) => {
    const res = await fetch(`${BASE}/settings`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStart }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new Error(
        (data as { error?: string }).error || `The money app helper said ${res.status}`,
      );
    qc.setQueryData(KEY, weekStart);
    void qc.invalidateQueries({ queryKey: ["money-hub", "dates"] });
  };
}
