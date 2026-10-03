// money-hub patch: the Rentals page (our rental-tracker add-on) and the Rental switch in
// Holdings, Assets.
//
// Add-on pages must live under /addons/<id>, so the host serves this one at /rentals instead
// (owner, 10-02: "make the url money.sanglam.cc/rentals"); old /addons/rental-tracker links
// redirect there. A property is a rental when its Property type is "Rental Property"
// (metadata.sub_type, the same field as Edit details), so the switch and that form always agree.
// The add-on and the nightly rental job read the same field.

import type { AlternativeAssetHolding } from "@/lib/types";

export const RENTALS_PATH = "/rentals";
export const RENTALS_ADDON_PATH = "/addons/rental-tracker";

/** Host addresses that replace an add-on's own /addons/... address. */
export const ADDON_ADDRESS_ALIASES: Record<string, string> = {
  [RENTALS_ADDON_PATH]: RENTALS_PATH,
};

export function rentalHref(rentalId?: string, tab?: "entries" | "settings"): string {
  const q = new URLSearchParams();
  if (rentalId) q.set("rental", rentalId);
  if (tab) q.set("tab", tab);
  const qs = q.toString();
  return qs ? `${RENTALS_PATH}?${qs}` : RENTALS_PATH;
}

const RENTAL_TYPE = "rental";
/** The Property type a property had before it became a rental, put back when it stops. */
const TYPE_BEFORE_KEY = "sub_type_before_rental";

export function isPropertyHolding(holding: AlternativeAssetHolding): boolean {
  return holding.kind.toLowerCase() === "property";
}

export function isRentalProperty(holding: AlternativeAssetHolding): boolean {
  return isPropertyHolding(holding) && holding.metadata?.sub_type === RENTAL_TYPE;
}

/**
 * The metadata change that turns the Rental switch on or off. Wealthfolio merges it into the
 * asset's metadata and drops keys sent as "". Off puts back the type it had before (a home
 * nobody rents is a residence when there was none).
 */
export function rentalSwitchMetadata(
  holding: AlternativeAssetHolding,
  on: boolean,
): Record<string, string> {
  const current = holding.metadata?.sub_type;
  const before = holding.metadata?.[TYPE_BEFORE_KEY];
  if (on) {
    const keep = typeof current === "string" && current !== RENTAL_TYPE ? current : "";
    return { sub_type: RENTAL_TYPE, [TYPE_BEFORE_KEY]: keep };
  }
  return {
    sub_type: typeof before === "string" && before ? before : "residence",
    [TYPE_BEFORE_KEY]: "",
  };
}
