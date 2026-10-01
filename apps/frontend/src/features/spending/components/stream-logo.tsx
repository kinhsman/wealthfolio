// money-hub patch: a repeating charge's picture (lib/subscriptions.ts): its merchant's logo, the
// bank's for a merchant that uses the bank's logo, otherwise its first letter.
import { useAccounts } from "@/hooks/use-accounts";
import { accountLogoUrl } from "@/lib/account-logo";
import { cn } from "@/lib/utils";

import type { Stream } from "../lib/subscriptions";
import { MerchantLogo } from "./merchant-logo";

export function StreamLogo({ s, className }: { s: Pick<Stream, "name" | "logoUrl" | "useBank" | "accountId">; className?: string }) {
  const { accounts } = useAccounts({ filterActive: false });
  if (s.logoUrl) return <MerchantLogo url={s.logoUrl} name={s.name} className={className} />;
  const bank = s.useBank ? accountLogoUrl(accounts?.find((a) => a.id === s.accountId)) : null;
  if (bank) return <MerchantLogo url={bank} name={s.name} whole className={className} />;
  return (
    <span
      aria-hidden
      title={s.name}
      className={cn("bg-muted text-muted-foreground flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold", className)}
    >
      {s.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
