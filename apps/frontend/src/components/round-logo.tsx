// money-hub patch: a bank or broker logo in a circle, drawn exactly the way the Insights page draws
// a holding's logo (components/ticker-avatar.tsx: Avatar, picture edge to edge, object-cover, no
// padding), which is also how WheelTradr draws broker logos. Owner, 10-02: "they all have a thick
// white circle outside the real logo ... the Insights page showing the correct bank logo ... they
// must reuse the same exact icon". Every account logo goes through here, so one look everywhere.
// A picture has to be a square icon for this to work (Schwab, Fidelity, Chase, Citi's app icon);
// a wide wordmark gets its sides cut, so the fix for one is a better picture, not another fit.
import { Avatar, AvatarFallback, AvatarImage } from "@wealthfolio/ui";

import { cn } from "@/lib/utils";

/** Size it with h-* w-* (or size-*) in `className`, default h-5 w-5. `rounded-lg` there makes a
 *  rounded square instead (the cards' tiles). */
export function RoundLogo({
  url,
  name,
  className,
}: {
  url: string;
  name?: string;
  className?: string;
}) {
  return (
    <Avatar className={cn("h-5 w-5", className)} title={name}>
      <AvatarImage src={url} alt="" className="object-cover p-0" draggable={false} />
      {/* Until it loads, or if it never does: the name's first letter, never a broken picture. */}
      <AvatarFallback className="text-muted-foreground border text-[10px] font-semibold">
        {(name ?? "").trim().charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
