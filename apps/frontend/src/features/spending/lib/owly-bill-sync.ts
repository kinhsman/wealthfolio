// money-hub patch: a charge tagged (or untagged) on an event that adds its charges to an Owly trip is
// put on the trip (or taken off) by the money-hub service. This only asks it to look now instead of
// at the next hourly run; it is quiet when Owly is not connected or no event has it turned on.
const EVENT = "owly-bills-synced";
let timer: ReturnType<typeof setTimeout> | null = null;

export function queueOwlyBillSync(delayMs = 3000): void {
  if (typeof window === "undefined") return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    timer = null;
    try {
      const res = await fetch("/api/money-hub/owly/trip-bills/sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (res.ok) window.dispatchEvent(new Event(EVENT));
    } catch {
      // The hourly run catches up.
    }
  }, delayMs);
}

/** Calls `fn` after a sync finished; returns the way to stop. */
export function onOwlyBillsSynced(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
