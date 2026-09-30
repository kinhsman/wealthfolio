// money-hub patch: WheelTradr accounts held in the money app.
//
// Each WheelTradr account the owner switches on (Settings, Connections, WheelTradr) is a
// holdings-mode account holding ONE share of a manual asset priced at the account's value
// (the money-hub service, server/drive-backup/lib/wheeltradr.js). The share count and
// price mean nothing to the owner; WheelTradr's own today P/L and unrealized P/L ($ and %)
// are what he wants to see. The service serves them by asset id at
// /api/money-hub/wheeltradr/holdings, and the Holdings table and the dashboard's top
// holdings show them on these rows. Anywhere the service is not there, the map is empty
// and every row renders as Wealthfolio made it.
import { useQuery } from "@tanstack/react-query";

export interface WheelTradrStats {
  todayPnl: number;
  todayPct: number; // percent, e.g. 1.67
  unrealizedPnl: number;
  unrealizedPct: number; // percent, e.g. -11.8
  asOf?: string | null;
}

/** By Wealthfolio asset id. */
export type WheelTradrStatsMap = Record<string, WheelTradrStats>;

const EMPTY: WheelTradrStatsMap = {};

export function useWheeltradrStats(): WheelTradrStatsMap {
  const { data } = useQuery({
    queryKey: ["money-hub", "wheeltradr-holdings"],
    queryFn: async (): Promise<WheelTradrStatsMap> => {
      const res = await fetch("/api/money-hub/wheeltradr/holdings", { credentials: "include" });
      if (!res.ok) return EMPTY;
      const body = (await res.json().catch(() => ({}))) as { holdings?: WheelTradrStatsMap };
      return body.holdings ?? EMPTY;
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: false,
  });
  return data ?? EMPTY;
}

export function wheeltradrStatsFor(
  map: WheelTradrStatsMap,
  holding: { instrument?: { id?: string | null } | null },
): WheelTradrStats | null {
  const id = holding.instrument?.id;
  return (id && map[id]) || null;
}
