// money-hub patch: an account as the Transactions list shows it (owner, 10-02: "add an account column
// ... make sure you add the bank logos"): its bank's logo, filling the circle like WheelTradr's broker
// logos, and its name. Two "Checking" accounts read apart by the logo.
import { RoundLogo } from "@/components/round-logo";
import { accountLogoUrl } from "@/lib/account-logo";
import type { Account } from "@/lib/types";
import { cn } from "@/lib/utils";

export function AccountLogo({ account, className }: { account: Account | undefined; className?: string }) {
  const url = accountLogoUrl(account);
  if (url) return <RoundLogo url={url} name={account?.group || account?.name} className={className} />;
  return (
    <span
      aria-hidden
      className={cn(
        "bg-muted text-muted-foreground flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold",
        className,
      )}
    >
      {(account?.name ?? "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** The Account column's cell content: logo and name; the name gives way to the logo alone when the
 *  table is narrow (under 1024px), with the name as its tooltip. */
export function AccountMark({ account, fallbackName }: { account: Account | undefined; fallbackName: string }) {
  const name = account?.name ?? fallbackName;
  const bank = account?.group && account.group !== name ? `${account.group} ${name}` : name;
  return (
    <div className="flex min-w-0 items-center gap-2" title={bank}>
      <AccountLogo account={account} />
      <span className="text-foreground/80 min-w-0 truncate text-sm max-lg:hidden">{name}</span>
    </div>
  );
}
