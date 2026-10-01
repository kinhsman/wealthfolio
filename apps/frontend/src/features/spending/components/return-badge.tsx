// money-hub patch: a transaction's Returns mark (lib/returns.ts): on the purchase that went back, or
// on the refund that came for it. Plain while it waits, amber when it needs a look (late, or money
// in to say yes or no to), green once the money is back. A click opens the return.
import { Icons } from "@wealthfolio/ui";

import { returnLine, returnStatus, shortDay, trackReturnStore, type ReturnMark } from "../lib/returns";

export function ReturnBadge({ mark }: { mark: ReturnMark | undefined }) {
  if (!mark) return null;
  const { item, role } = mark;
  const st = returnStatus(item);
  const title = role === "refund" ? `The refund for ${item.name}, bought ${shortDay(item.purchase.date)}` : `Return: ${st.label}. ${returnLine(item)}`;
  // Fixed colours: the dark theme turns the emerald and amber utilities pale.
  const color = st.tone === "fine" ? "#16a34a" : st.tone === "look" ? "#d97706" : undefined;
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        trackReturnStore.open({ returnId: item.id });
      }}
      className="text-muted-foreground hover:text-foreground inline-flex shrink-0"
    >
      <Icons.Undo className="h-3.5 w-3.5" style={color ? { color } : undefined} aria-hidden="true" />
      <span className="sr-only">{title}</span>
    </button>
  );
}
