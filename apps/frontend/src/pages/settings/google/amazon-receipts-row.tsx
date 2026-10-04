// money-hub patch: Amazon orders on the Receipts page (owner, 2026-10-04: "I need the receipts page also track amz orders",
// then "why do we need a the toggle under amazon orders? like we have a dedicated section called Receipt emails?"). One row
// inside the Receipt emails card on Settings, Google, the home of everything about receipts: the switch, what it does, a link
// to the page. The money-hub service (lib/amazonReceipts.js) makes a receipt of every Amazon charge, sorts the items into the
// owner's categories with the AI the receipts use, and files the charge like any receipt. Kept in its own file so
// google-page.tsx stays mergeable.
import { Link } from "react-router-dom";
import { Switch } from "@wealthfolio/ui/components/ui/switch";
import { AMAZON_LOGO } from "@/features/spending/lib/receipts";

export function AmazonReceiptsRow({
  amazonOn,
  on,
  ready,
  sorted,
  busy,
  onToggle,
}: {
  /** Amazon orders are being read (What reads them): receipts are made from what that reads. */
  amazonOn: boolean;
  on: boolean;
  ready: boolean;
  sorted: number;
  busy: boolean;
  onToggle: (on: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 border-t px-4 py-3 text-xs">
      <img src={AMAZON_LOGO} width={28} height={28} alt="" aria-hidden="true" className="ring-border mt-0.5 size-7 shrink-0 rounded-md bg-white object-contain ring-1" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="text-foreground font-medium">Amazon orders</div>
        <p className="text-muted-foreground">
          Each Amazon charge becomes a receipt; the AI sorts its items and splits the charge when they differ. Off puts the ones you have not touched back.
        </p>
        {on ? (
          <p className="text-muted-foreground">
            {sorted ? `${sorted} orders sorted. ` : "Sorting your orders now, this takes a couple of minutes. "}
            <Link to="/spending/receipts" className="text-primary underline-offset-4 hover:underline">Open Receipts</Link>
          </p>
        ) : null}
        {!amazonOn && !on ? <p className="text-muted-foreground">Turn on Amazon orders under What reads them first.</p> : null}
        {!ready ? <p className="text-warning">The AI is not set up on the server yet.</p> : null}
      </div>
      <Switch
        checked={on}
        disabled={busy || (!on && (!ready || !amazonOn))}
        aria-label="Make receipts from Amazon orders"
        onCheckedChange={onToggle}
      />
    </div>
  );
}
