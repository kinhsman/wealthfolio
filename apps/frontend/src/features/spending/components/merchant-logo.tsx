// money-hub patch: a merchant's logo (lib/merchants.ts), round like the bank logos.
import { cn } from "@/lib/utils";

export function MerchantLogo({ url, name, className }: { url: string; name: string; className?: string }) {
  return (
    <img
      src={url}
      alt=""
      title={name}
      loading="lazy"
      className={cn("bg-muted h-5 w-5 shrink-0 rounded-full border object-contain", className)}
    />
  );
}
