// money-hub patch: a merchant's logo (lib/merchants.ts), round. The service fits every logo inside
// the circle, so the circle never cuts it (owner, 09-30: "keep rounded but ... dont let them cut off").
import { cn } from "@/lib/utils";

export function MerchantLogo({ url, name, className }: { url: string; name: string; className?: string }) {
  return (
    <img
      src={url}
      alt=""
      title={name}
      loading="lazy"
      className={cn("bg-muted h-5 w-5 shrink-0 rounded-full border object-cover", className)}
    />
  );
}
