// money-hub patch: a repeating charge's picture (lib/subscriptions.ts): its merchant's logo, the
// bank's for a merchant that uses the bank's logo, otherwise its category's icon in its colour (the
// app's own, owner 10-02), and only with no category its first letter.
import { useAccounts } from "@/hooks/use-accounts";
import { accountLogoUrl } from "@/lib/account-logo";
import { cn } from "@/lib/utils";

import type { Stream } from "../lib/subscriptions";
import { CategoryIcon } from "./category-chips";
import { MerchantLogo } from "./merchant-logo";
import { useStreamCategory } from "./stream-category";

export function StreamLogo({
  s,
  className,
}: {
  s: Pick<Stream, "name" | "logoUrl" | "useBank" | "accountId"> & { categoryId?: string | null };
  className?: string;
}) {
  const { accounts } = useAccounts({ filterActive: false });
  const category = useStreamCategory(s.categoryId);
  if (s.logoUrl) return <MerchantLogo url={s.logoUrl} name={s.name} className={className} />;
  const bank = s.useBank ? accountLogoUrl(accounts?.find((a) => a.id === s.accountId)) : null;
  if (bank) return <MerchantLogo url={bank} name={s.name} whole className={className} />;
  if (category) {
    return (
      <span
        aria-hidden
        title={`${s.name}: ${category.name}`}
        className={cn("bg-muted flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", !category.color && "text-muted-foreground", className)}
        style={category.color ? { color: category.color, backgroundColor: `${category.color}1F` } : undefined}
      >
        <CategoryIcon icon={category.icon} fallback={category.name} className="h-[55%] w-[55%]" />
      </span>
    );
  }
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
