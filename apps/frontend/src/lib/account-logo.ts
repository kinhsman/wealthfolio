// money-hub patch: a picture for an account, from its meta.logoUrl. The money-hub
// service sets it on bank and card accounts linked through Plaid (the bank's logo,
// server/drive-backup/lib/plaid.js INSTITUTION_LOGOS). Null when the account has none,
// so every place falls back to Wealthfolio's own type icon.
import type { Account } from "@/lib/types";

export function accountLogoUrl(account?: Pick<Account, "meta"> | null): string | null {
  const raw = account?.meta;
  if (!raw) return null;
  try {
    const meta = (typeof raw === "string" ? JSON.parse(raw) : raw) as { logoUrl?: unknown } | null;
    const url = meta?.logoUrl;
    return typeof url === "string" && url.startsWith("https://") ? url : null;
  } catch {
    return null;
  }
}
