// money-hub patch: a merchant's logo (lib/merchants.ts), round. The service fits every logo inside
// the circle, so the circle never cuts it (owner, 09-30: "keep rounded but ... dont let them cut off").
import { cn } from "@/lib/utils";

/** `whole`: a picture the service did not fit (a bank's logo on ATM cash, edge to edge) sits at 70%
 *  on white, the same fit the service gives merchant logos, so the circle never cuts it. */
export function MerchantLogo({
  url,
  name,
  className,
  whole,
}: {
  url: string;
  name: string;
  className?: string;
  whole?: boolean;
}) {
  if (whole) {
    return (
      <span
        title={name}
        className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border bg-white", className)}
      >
        <img src={url} alt="" loading="lazy" className="h-[70%] w-[70%] object-contain" />
      </span>
    );
  }
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
