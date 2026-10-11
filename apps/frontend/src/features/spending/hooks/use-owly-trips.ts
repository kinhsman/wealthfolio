// money-hub patch: Owly trips and the event links (see ../lib/owly-trips.ts).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { OwlyTripsAnswer } from "../lib/owly-trips";

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
