// money-hub patch: Settings, Spending, Merchants. The owner's merchant logos (features/spending/
// lib/merchants.ts): each a logo, a name and the words to look for; transactions whose text contains
// the words show the logo. Laid out like the Rules page next to it.
import { useMemo, useState } from "react";

import { Button, EmptyPlaceholder, Icons, Input, Skeleton } from "@wealthfolio/ui";

import { MerchantDialog } from "@/features/spending/components/merchant-dialog";
import { MerchantLogo } from "@/features/spending/components/merchant-logo";
import { useMerchants, wordsOf, type MerchantDraft } from "@/features/spending/lib/merchants";

import { SettingsHeader } from "../../settings-header";
import { SpendingBackLink } from "../components/spending-back-link";

export default function SpendingMerchantsPage() {
  const { data: all = [], isLoading, isError, error } = useMerchants();
  // Owly friends' photos come along for their Zelle transactions; they are changed in Owly, not here.
  const merchants = useMemo(() => all.filter((m) => !m.source), [all]);
  const friends = all.length - merchants.length;
  const [draft, setDraft] = useState<MerchantDraft | null>(null);
  const [search, setSearch] = useState("");
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? merchants.filter((m) => m.name.toLowerCase().includes(q) || wordsOf(m).some((w) => w.toLowerCase().includes(q))) : merchants;
  }, [merchants, search]);

  return (
    <>
      <div className="space-y-6">
        <SpendingBackLink />
        <SettingsHeader
          heading="Merchants"
          text="Your own logos on transactions. Each merchant has the words to look for; every transaction whose text contains them shows its logo."
          backTo="/settings/spending"
        >
          <Button size="sm" onClick={() => setDraft({})}>
            <Icons.Plus className="mr-1.5 h-3.5 w-3.5" />
            Add merchant
          </Button>
        </SettingsHeader>

        {merchants.length > 6 ? (
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search merchants" className="max-w-xs" />
        ) : null}

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : isError ? (
          <p className="text-destructive text-sm">The merchants could not load: {(error as Error)?.message}</p>
        ) : merchants.length === 0 ? (
          <EmptyPlaceholder>
            <EmptyPlaceholder.Icon name="Store" />
            <EmptyPlaceholder.Title>No merchants yet</EmptyPlaceholder.Title>
            <EmptyPlaceholder.Description>
              Add a merchant with its logo and the words to look for, like Costco. You can also add one from a transaction: open it and press Add a logo.
            </EmptyPlaceholder.Description>
            <Button size="sm" onClick={() => setDraft({})}>
              <Icons.Plus className="mr-1.5 h-3.5 w-3.5" />
              Add merchant
            </Button>
          </EmptyPlaceholder>
        ) : (
          <div className="bg-card divide-y rounded-lg border">
            {shown.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setDraft({ merchant: m })}
                className="hover:bg-muted/40 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
              >
                <MerchantLogo url={m.logoUrl} name={m.name} className="h-9 w-9" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{m.name}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    Looks for {wordsOf(m).map((w) => `\u201c${w}\u201d`).join(" or ")}
                  </span>
                </span>
                <Icons.ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
              </button>
            ))}
            {shown.length === 0 ? <p className="text-muted-foreground px-4 py-6 text-sm">No merchant matches &ldquo;{search}&rdquo;.</p> : null}
          </div>
        )}
        {friends > 0 ? (
          <p className="text-muted-foreground text-xs">
            {friends} friend{friends === 1 ? "" : "s"} from Owly show their photo on their Zelle transactions too. Change a photo in Owly.
          </p>
        ) : null}
      </div>
      {draft ? <MerchantDialog key={draft.merchant?.id ?? "new"} draft={draft} onClose={() => setDraft(null)} /> : null}
    </>
  );
}
