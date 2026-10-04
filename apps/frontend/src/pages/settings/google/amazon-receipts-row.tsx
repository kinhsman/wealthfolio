// money-hub patch: Amazon orders on the Receipts page (owner, 2026-10-04: "I need the receipts page also track amz
// orders"). One row in the Amazon orders card on Settings, Google: the switch, what it does, a link to the page. The
// money-hub service (lib/amazonReceipts.js) makes a receipt of every Amazon charge, sorts the items into the owner's
// categories with the AI the receipts use, and files the charge like any receipt. Kept in its own file so
// google-page.tsx stays mergeable.
import { Link } from "react-router-dom";
import { Switch } from "@wealthfolio/ui/components/ui/switch";

export function AmazonReceiptsRow({ on, ready, sorted, busy, onToggle }: { on: boolean; ready: boolean; sorted: number; busy: boolean; onToggle: (on: boolean) => void }) {
  return (
    <div className="flex items-start gap-3 border-t px-4 py-3 text-xs">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="text-foreground font-medium">Show on the Receipts page</div>
        <p className="text-muted-foreground">
          Each Amazon charge becomes a receipt with its items. The AI sorts them into your categories and the charge is split when they differ; you check it and press Looks good.
          Switching off removes the ones you have not touched and puts their charges back.
        </p>
        {on ? (
          <p className="text-muted-foreground">
            {sorted ? `${sorted} orders sorted. ` : "Sorting your orders now, this takes a couple of minutes. "}
            <Link to="/spending/receipts" className="text-primary underline-offset-4 hover:underline">Open Receipts</Link>
          </p>
        ) : null}
        {!ready ? <p className="text-warning">The AI is not set up on the server yet.</p> : null}
      </div>
      <Switch checked={on} disabled={busy || (!on && !ready)} aria-label="Show Amazon orders on the Receipts page" onCheckedChange={onToggle} />
    </div>
  );
}
