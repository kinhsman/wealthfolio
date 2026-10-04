import { useCallback, useMemo } from "react";

import { usePersistentState } from "@/hooks/use-persistent-state";

import {
  SPENDING_MONTH_STORAGE_KEY,
  decodePersistedMonth,
  encodePersistedMonth,
} from "./month-period";

/** The month picked on the Spending dashboard or Insights; forgotten after PERSISTED_MONTH_TTL_MS. */
export function usePersistedSpendingMonth(): [string | null, (monthKey: string | null) => void] {
  const [stored, setStored] = usePersistentState<string | null>(SPENDING_MONTH_STORAGE_KEY, null);
  const monthKey = useMemo(() => decodePersistedMonth(stored), [stored]);
  const setMonthKey = useCallback(
    (next: string | null) => setStored(encodePersistedMonth(next)),
    [setStored],
  );
  return [monthKey, setMonthKey];
}
