// money-hub patch: display-only account types.
// A "Rental" account is stored as a CASH account (so the server, spending reports and net
// worth treat it exactly like cash) with `meta.displayType = "RENTAL"`; only the UI labels it.

export const RENTAL_DISPLAY_TYPE = "RENTAL";

function parseMeta(meta?: string | null): Record<string, unknown> {
  if (!meta) return {};
  try {
    const parsed = JSON.parse(meta) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function isRentalMeta(meta?: string | null): boolean {
  return parseMeta(meta).displayType === RENTAL_DISPLAY_TYPE;
}

/** The type to show for an account: RENTAL for a rental-labelled cash account, else its real type. */
export function displayAccountType(account: { accountType: string; meta?: string | null }): string {
  return account.accountType === "CASH" && isRentalMeta(account.meta) ? RENTAL_DISPLAY_TYPE : account.accountType;
}

export function setDisplayTypeInMeta(meta: string | null | undefined, displayType: string | null): string {
  const parsed = parseMeta(meta);
  if (displayType) parsed.displayType = displayType;
  else delete parsed.displayType;
  return JSON.stringify(parsed);
}

/** Owly's "Owed to me" account (money-hub lib/owly.js sets `meta.source = "owly"`): money friends
 *  owe, so it is neither an investment nor spending. */
export function isOwlyAccount(account: { meta?: string | null }): boolean {
  return parseMeta(account.meta).source === "owly";
}
