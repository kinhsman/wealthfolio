// money-hub patch: a soft light that follows the mouse over the card under it (owner, 10-02). One listener
// for the whole app marks the card being pointed at with data-spot-on="1" and keeps --spot-x / --spot-y
// (px from the card's top left) on it; globals.css draws the light. A touch or a pen never lights a card.

/** What counts as a card: any box drawn as a card (card colour, rounded, a border: the shared Card, the
 *  app's glass panels, account rows), plus the Spending page's own boxes. On that page a card's inner body
 *  is see-through, so the whole card lights instead. The innermost card under the mouse wins. */
const CARD = [
  '[class*="bg-card"][class*="rounded"][class~="border"]:not(.meadow [data-dash-card-body])',
  ".meadow [data-dash-card]",
  "[data-meadow-card]",
  '[data-m="card"]',
  '[data-m="hero"]',
  '[data-m="notice"]',
].join(",");

export function startSpotlight(): () => void {
  let lit: HTMLElement | null = null;
  let frame = 0;
  let x = -1;
  let y = -1;

  const light = (card: HTMLElement | null) => {
    if (card === lit) return;
    lit?.setAttribute("data-spot-on", "0");
    card?.setAttribute("data-spot-on", "1");
    lit = card;
  };

  const paint = () => {
    frame = 0;
    const card =
      x < 0 ? null : (document.elementFromPoint(x, y)?.closest<HTMLElement>(CARD) ?? null);
    light(card);
    if (!card) return;
    const box = card.getBoundingClientRect();
    card.style.setProperty("--spot-x", `${Math.round(x - box.left)}px`);
    card.style.setProperty("--spot-y", `${Math.round(y - box.top)}px`);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(paint);
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    x = e.clientX;
    y = e.clientY;
    schedule();
  };
  // The page moving under a still mouse changes which card is under it.
  const onScroll = () => {
    if (x >= 0) schedule();
  };
  const onLeave = () => {
    x = -1;
    y = -1;
    schedule();
  };

  document.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("scroll", onScroll, { passive: true, capture: true });
  document.documentElement.addEventListener("pointerleave", onLeave);
  return () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("scroll", onScroll, { capture: true });
    document.documentElement.removeEventListener("pointerleave", onLeave);
    if (frame) cancelAnimationFrame(frame);
    light(null);
  };
}
