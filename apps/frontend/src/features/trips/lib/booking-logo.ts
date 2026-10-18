// money-hub patch: Trips, the logo a booking wears: one of the owner's merchants named in it (a merchant added in
// Settings, Merchants with the words "hilton" shows on "Tru by Hilton Plano"), else for a flight its airline's.
import { merchantFor, type Merchant } from "@/features/spending/lib/merchants";

import { airlineLogoUrl, airlineOf } from "./airlines";
import type { Booking } from "./trips";

/** The logo address of the owner's merchant named in these lines (the longest words win), or null. Only a merchant
 *  with a picture of its own counts ("Use the bank's logo" ones have no picture to show here). */
export function merchantLogoFor(
  lines: (string | null | undefined)[],
  merchants: Merchant[] | undefined,
): string | null {
  const m = merchantFor(lines.filter(Boolean).join(" \n "), merchants);
  return m && !m.useBank && m.logoUrl ? m.logoUrl : null;
}

/** What a booking row (or a charge it claims) shows: `own` is a merchant's logo (already fitted round), `airline` is
 *  an airline's logo for a flight; own wins, as the owner chose it. */
export function bookingLogo(
  b: Booking,
  lines: (string | null | undefined)[],
  merchants: Merchant[] | undefined,
  logoKey: string | null,
): { own: string | null; airline: string | null } {
  const own = merchantLogoFor([b.title, b.place, ...lines], merchants);
  const code = b.kind === "flight" ? airlineOf(...lines, b.title) : null;
  return { own, airline: code ? airlineLogoUrl(code, logoKey) : null };
}
