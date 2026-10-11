// money-hub patch: Owly trips and the event links (see ../lib/owly-trips.ts).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { listCashActivities } from "../adapters/cash-activities";
import { getVisibleSpendingAmount } from "../lib/constants";
import { chargesWindow, eventChargesKey, type Charge, type OwlyTrip, type OwlyTripsAnswer } from "../lib/owly-trips";

const BASE = "/api/money-hub/owly";
const KEY = "owly_trips";

class OwlyError extends Error {
  eventId?: string;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new OwlyError((data as { error?: string }).error || `The money app helper said ${res.status}`);
    err.eventId = (data as { eventId?: string }).eventId;
    throw err;
  }
  return data as T;
}

/** Owly's trips and which event each is linked to. Quiet when Owly is not connected or not answering. */
export function useOwlyTrips() {
  return useQuery<OwlyTripsAnswer, Error>({
    queryKey: [KEY],
    queryFn: () => call<OwlyTripsAnswer>("GET", "/trips"),
    staleTime: 60_000,
    retry: false,
  });
}

/** Copies an event's dates onto the Owly trip it is linked to. Owly's own refusal (key not ticked) is shown as is. */
export function useCopyDatesToOwly() {
  const queryClient = useQueryClient();
  return useMutation<unknown, OwlyError, { eventId: string; startDate: string; endDate: string }>({
    mutationFn: (body) => call("PUT", "/trip-dates", body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [KEY] });
      toast.success("Owly trip dates updated");
    },
    onError: (err) => toast.error(err.message),
  });
}

/** Links an event to a trip, or unlinks it (tripId null). `quiet` leaves the success toast out. */
export function useSetOwlyTripLink() {
  const queryClient = useQueryClient();
  return useMutation<unknown, OwlyError, { eventId: string; tripId: number | null; quiet?: boolean }>({
    mutationFn: ({ eventId, tripId }) => call("PUT", "/trip-link", { eventId, tripId }),
    onSuccess: async (_data, vars) => {
      await queryClient.invalidateQueries({ queryKey: [KEY] });
      if (!vars.quiet) toast.success(vars.tripId === null ? "Owly trip unlinked" : "Owly trip linked");
    },
    onError: (err) => toast.error(err.message),
  });
}

/**
 * The card charges tagged to an event, wherever their dates fall (a flight is bought weeks before
 * the trip). Reads the cash activities around the event and the trip's bills, once a trip is linked.
 */
export function useEventCharges(eventId: string | undefined, event: { startDate: string; endDate: string } | undefined, trip: OwlyTrip | null) {
  const filter = event ? chargesWindow(event, trip) : undefined;
  return useQuery<Charge[], Error>({
    queryKey: eventChargesKey(eventId, filter),
    enabled: !!eventId && !!trip && !!filter && (trip.bills?.length ?? 0) > 0,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const rows = await listCashActivities(filter);
      return rows
        .filter((a) => a.eventId === eventId)
        .map((a) => ({
          id: a.id,
          label: a.notes || a.activityType,
          date: a.activityDate.slice(0, 10),
          amount: getVisibleSpendingAmount(a),
          currency: a.currency,
        }));
    },
  });
}
