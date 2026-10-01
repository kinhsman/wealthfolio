// money-hub patch: a tag on a posted entry whose amount is not what it was pending (lib/pending-changes.ts),
// e.g. a restaurant tip. It opens the Pending vs posted page.
import type { MouseEvent } from "react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import { Icons, PrivacyAmount, useAmountFormatting, useBalancePrivacy } from "@wealthfolio/ui";

import { changePct, useChangedByActivity } from "../lib/pending-changes";

// Inline colour: the dark theme turns the amber utilities white (subscriptions page, 10-01).
const UP = { color: "#d97706", backgroundColor: "rgba(217, 119, 6, 0.12)" };

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function PendingChangeTag({ activityId, className }: { activityId: string; className?: string }) {
  const { data } = useChangedByActivity();
  const { isBalanceHidden } = useBalancePrivacy();
  const { formatAmount } = useAmountFormatting();
  const c = data?.get(activityId);
  if (!c || c.diff == null || c.posted == null) return null;
  const up = c.diff > 0;
  const pct = changePct(c);
  const amt = (n: number) => (isBalanceHidden ? "••••" : formatAmount(Math.abs(n), c.currency));
  const title = `Pending ${amt(c.firstPending)} on ${day(c.date)}, posted ${amt(c.posted)}${c.postedDate ? ` on ${day(c.postedDate)}` : ""}${pct != null && !isBalanceHidden ? ` (${pct}% ${up ? "more" : "less"})` : ""}`;
  return (
    <Link
      to={`/spending/pending-changes?id=${encodeURIComponent(c.id)}`}
      title={title}
      onClick={(e: MouseEvent) => e.stopPropagation()}
      style={up ? UP : undefined}
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums hover:opacity-80",
        !up && "bg-muted text-muted-foreground",
        className,
      )}
    >
      {up ? <Icons.ArrowUp className="h-2.5 w-2.5" aria-hidden="true" /> : <Icons.ArrowDown className="h-2.5 w-2.5" aria-hidden="true" />}
      <PrivacyAmount value={Math.abs(c.diff)} currency={c.currency} />
      <span className="font-medium">vs pending</span>
      <span className="sr-only">{title}</span>
    </Link>
  );
}
