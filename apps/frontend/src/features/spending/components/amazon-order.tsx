// money-hub patch: an Amazon (or TikTok Shop) charge's order (lib/amazon.ts). In the list, the order's line stands where
// the bank's code would ("AMAZON MKTPL*5107C3NJ1" says nothing); a click shows the order. In the edit
// window, the order in full. Amazon's newer emails name only the kind of thing bought, so the order's
// own page on Amazon is one click away.
import { Icons } from "@wealthfolio/ui";
import { useUsd } from "@/lib/app-currency";
import { Popover, PopoverContent, PopoverTrigger } from "@wealthfolio/ui/components/ui/popover";
import { cn } from "@/lib/utils";
import { amazonReturnState, amazonSummary, storeName, type AmazonLink } from "../lib/amazon";

const day = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";

/** The order: what was in it, when, any return, and the link to Amazon. */
export function AmazonOrderDetails({ link, className }: { link: AmazonLink; className?: string }) {
  const usd = useUsd();
  return (
    <div className={cn("space-y-2.5 text-xs", className)}>
      <div className="flex items-center gap-2">
        <Icons.Package className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">{storeName(link)} order</span>
        {link.url ? (
          <a href={link.url} target="_blank" rel="noreferrer" className="text-primary inline-flex shrink-0 items-center gap-1 underline-offset-4 hover:underline">
            Open on Amazon <Icons.ExternalLink className="size-3" />
          </a>
        ) : null}
      </div>
      {link.items.length ? (
        <ul className="space-y-1">
          {link.items.map((it, i) => (
            <li key={`${it.name}-${i}`} className="flex items-baseline gap-2">
              <span className="text-foreground min-w-0 flex-1">{it.name}</span>
              {it.qty > 1 ? <span className="text-muted-foreground shrink-0 tabular-nums">×{it.qty}</span> : null}
              {it.price != null ? <span className="text-muted-foreground shrink-0 tabular-nums">{usd(it.price)}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-foreground">
          {amazonSummary(link)}
          <span className="text-muted-foreground hidden sm:inline"> · Amazon's email names only the kind of item; the order on Amazon shows which.</span>
        </p>
      )}
      <p className="text-muted-foreground">
        {[`Order ${link.orderId}`, link.placed && `ordered ${day(link.placed)}`, link.delivered && `delivered ${day(link.delivered)}`, link.how === "shipment" && link.orderTotal != null && `order total ${usd(link.orderTotal)}`]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {link.returns.length ? (
        <ul className="space-y-1 border-t pt-2">
          {link.returns.map((r, i) => (
            <li key={`${r.item}-${i}`} className="flex items-baseline gap-2">
              <Icons.Undo className="text-muted-foreground size-3.5 shrink-0 self-center" aria-hidden="true" />
              <span className="text-foreground min-w-0 flex-1 truncate">{r.item || "Returned item"}</span>
              <span className="text-muted-foreground shrink-0">{amazonReturnState(r)}{r.refund != null ? ` ${usd(r.refund)}` : ""}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The order's line in a transaction row: a click shows the order (the row itself stays clickable). */
export function AmazonOrderLine({ link, className }: { link: AmazonLink; className?: string }) {
  const summary = amazonSummary(link);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`${storeName(link)} order: ${summary}`}
          onClick={(e) => e.stopPropagation()}
          className={cn("text-muted-foreground hover:text-foreground inline-flex min-w-0 items-center gap-1 text-left text-xs", className)}
        >
          <Icons.Package className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">{summary}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={12} className="w-[min(380px,calc(100vw-1.5rem))] p-3" onClick={(e) => e.stopPropagation()}>
        <AmazonOrderDetails link={link} />
      </PopoverContent>
    </Popover>
  );
}

/** The phone's card: the order's line under the name, words only (the edit window has the rest). */
export function AmazonOrderText({ link, className }: { link: AmazonLink; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <Icons.Package className="size-3 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{amazonSummary(link)}</span>
    </span>
  );
}
