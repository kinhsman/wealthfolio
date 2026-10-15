// money-hub patch: trips are booked weeks or months before they start, so the flight or hotel
// charge sits OUTSIDE the event's own dates. The event window looks back this far before the
// start date and offers the untagged spending there, travel-looking charges first.

export const PREBOOKED_LOOKBACK_DAYS = 180;

const TRAVEL_WORDS =
  /\b(air ?lines?|airways?|air ?bnb|flight|hotel|hostel|resort|lodging|expedia|agoda|booking\.com|vrbo|citi ?travel|travel|eva ?air|united|delta|american air|southwest|frontier|spirit|jetblue|alaska air|vietnam air|vietjet|bamboo|hilton|marriott|hyatt|ihg|wyndham)\b/i;

interface ChargeLike {
  notes?: string | null;
  eventId?: string | null;
  netAmount?: number;
  cashFlowBucket?: string;
  assignments?: { categoryId: string }[];
}

/** A charge that reads like travel: filed under a Travel category, or travel words in the bank text. */
export function looksLikeTravel(c: ChargeLike): boolean {
  if ((c.assignments ?? []).some((a) => a.categoryId.startsWith("cat_travel"))) return true;
  return TRAVEL_WORDS.test(c.notes ?? "");
}

/** Untagged money going out, travel-looking first, then newest first. Everything else stays off the list's top. */
export function earlierCharges<T extends ChargeLike & { activityDate: string }>(rows: T[]): T[] {
  return rows
    .filter((c) => !c.eventId && c.cashFlowBucket === "spending" && (c.netAmount ?? 0) < 0)
    .map((c, i) => ({ c, i, travel: looksLikeTravel(c) }))
    .sort(
      (a, b) =>
        Number(b.travel) - Number(a.travel) ||
        b.c.activityDate.localeCompare(a.c.activityDate) ||
        a.i - b.i,
    )
    .map((x) => x.c);
}

/** ISO window for the look-back: `days` before the event's first day, ending the millisecond before it. */
export function earlierWindow(start: Date, days = PREBOOKED_LOOKBACK_DAYS) {
  const end = new Date(start);
  end.setHours(0, 0, 0, 0);
  const from = new Date(end);
  from.setDate(from.getDate() - days);
  end.setMilliseconds(-1);
  return { startDate: from.toISOString(), endDate: end.toISOString() };
}
