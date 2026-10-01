// money-hub patch: the company behind a bill no bank charge names (owner, 10-01: home insurance is
// paid from the mortgage escrow, "i want an icon for the insurance provider too because there is no
// transaction"). It is one of the owner's merchants (lib/merchants.ts): picked from the list, or a
// new one made in the usual merchant window (logo by upload, paste or drop). Rendered inside the
// window that opened it, like MerchantDialog.
import { useMemo, useState } from "react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Icons,
  Input,
} from "@wealthfolio/ui";

import { cn } from "@/lib/utils";

import { useMerchants, type Merchant } from "../lib/merchants";
import { MerchantDialog } from "./merchant-dialog";
import { MerchantLogo } from "./merchant-logo";

/** The owner's own merchants with a picture: friends' photos and bank logos are not companies. */
const companies = (list: Merchant[] | undefined) =>
  (list ?? []).filter((m) => !m.source && !m.useBank && m.logoUrl).sort((a, b) => a.name.localeCompare(b.name));

/** A field's button: the company's logo and name, or "Choose the company". */
export function CompanyButton({ merchantId, onClick, disabled }: { merchantId: string | null; onClick: () => void; disabled?: boolean }) {
  const { data } = useMerchants();
  const m = merchantId ? data?.find((x) => x.id === merchantId) : undefined;
  // The same box as the Select beside it (its height, fill and border).
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="border-input bg-input-bg dark:bg-input/30 focus:ring-ring ring-offset-background h-input-height flex w-full min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-left text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {m ? (
        <MerchantLogo url={m.logoUrl} name={m.name} className="h-5 w-5" />
      ) : (
        <Icons.Store className="text-muted-foreground h-4 w-4 shrink-0" />
      )}
      <span className={cn("min-w-0 flex-1 truncate", !m && "text-muted-foreground")}>{m ? m.name : "Choose the company"}</span>
      <Icons.ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
    </button>
  );
}

export function CompanyPicker({
  merchantId,
  onPick,
  onClose,
}: {
  merchantId: string | null;
  onPick: (m: Merchant | null) => void;
  onClose: () => void;
}) {
  const { data, isLoading } = useMerchants();
  const [q, setQ] = useState("");
  const [making, setMaking] = useState(false);
  const all = useMemo(() => companies(data), [data]);
  const needle = q.trim().toLowerCase();
  const shown = needle ? all.filter((m) => m.name.toLowerCase().includes(needle)) : all;
  // A new company starts with what was typed in the search.
  const fresh = q.trim();

  return (
    <>
      <Dialog open={!making} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[90dvh] overflow-hidden sm:max-w-[420px]">
          <DialogHeader className="text-left">
            <DialogTitle>Company</DialogTitle>
            <DialogDescription>Its logo shows on the bill. No bank charge names it, so it is picked here.</DialogDescription>
          </DialogHeader>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your logos" autoComplete="off" autoFocus />
          <div className="-mx-1 max-h-[45dvh] overflow-y-auto">
            {isLoading ? (
              <p className="text-muted-foreground px-1 py-4 text-sm">Loading your logos.</p>
            ) : shown.length === 0 ? (
              <p className="text-muted-foreground px-1 py-4 text-sm">{needle ? `No logo called "${q.trim()}" yet.` : "No logos yet."}</p>
            ) : (
              shown.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onPick(m)}
                  className={cn(
                    "hover:bg-muted/60 flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors",
                    m.id === merchantId && "bg-muted",
                  )}
                >
                  <MerchantLogo url={m.logoUrl} name={m.name} className="h-7 w-7" />
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  {m.id === merchantId ? <Icons.Check className="h-4 w-4 shrink-0" /> : null}
                </button>
              ))
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
            {merchantId ? (
              <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onPick(null)}>
                No company
              </Button>
            ) : (
              <span />
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => setMaking(true)}>
              <Icons.Plus className="mr-1 h-3.5 w-3.5" />
              {fresh ? `New: ${fresh}` : "New company"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {making ? (
        <MerchantDialog
          draft={{ name: fresh, pattern: fresh }}
          onClose={() => setMaking(false)}
          onSaved={(m) => onPick(m)}
        />
      ) : null}
    </>
  );
}
