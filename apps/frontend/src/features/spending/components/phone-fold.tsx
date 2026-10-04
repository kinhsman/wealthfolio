// money-hub patch: on a phone a dashboard card shows its answer and folds the rest behind a Show more row
// (the approved phone design, Meadow's Phone rules: "answer first, details on a tap"). On a computer the
// content simply shows. The phone remembers each card's state.
import type { ReactNode } from "react";

import { usePersistentState } from "@/hooks/use-persistent-state";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { cn } from "@/lib/utils";
import { Icons } from "@wealthfolio/ui";

export function PhoneFold({
  id,
  closedLabel,
  openLabel,
  hero = false,
  bleed = true,
  alwaysOpen = false,
  className,
  children,
}: {
  /** Remembered per card. */
  id: string;
  /** What opens, in keywords: "3 accounts, 4 cards", "How the forecast adds up". */
  closedLabel: ReactNode;
  /** What closes: "Hide the math". */
  openLabel: ReactNode;
  /** On the mint hero (its own tile and line colours). */
  hero?: boolean;
  /** The row runs to the card's edges (the card's side padding, 12px on a phone). */
  bleed?: boolean;
  /** money-hub patch: the Cash page has room, so nothing is folded there, phone included. */
  alwaysOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const isMobile = useIsMobileViewport();
  const [open, setOpen] = usePersistentState<boolean>(`dashboard-fold-${id}`, false);
  if (!isMobile || alwaysOpen) return <>{children}</>;
  return (
    <>
      {open ? children : null}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        data-m-fold
        className={cn(
          "flex min-h-[38px] w-full max-w-none shrink-0 items-center justify-between gap-2.5 border-t text-left text-[12.5px]",
          bleed && "-mx-3 w-[calc(100%+1.5rem)] px-3",
          hero
            ? "border-[var(--m-mint-line)] text-[var(--m-mint-ink)]"
            : "border-[var(--m-line-soft)] text-[var(--m-ink-2)]",
          className,
        )}
      >
        <span className="min-w-0 truncate">{open ? openLabel : closedLabel}</span>
        <span
          aria-hidden
          className={cn(
            "flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full",
            hero ? "bg-[var(--m-mint-tile)]" : "bg-[var(--m-tile)]",
          )}
          data-m-chev
        >
          {open ? (
            <Icons.ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <Icons.ChevronDown className="h-3.5 w-3.5" />
          )}
        </span>
      </button>
    </>
  );
}
