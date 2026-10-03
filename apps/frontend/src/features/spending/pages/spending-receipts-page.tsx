// money-hub patch: Receipts (/spending/receipts; lib/receipts.ts, owner 2026-10-03: "build an auto category
// for costco", "the only way is to snap the receipt"). Every receipt snapped, the ones that need a look
// first, then the ones waiting for their card charge, then the filed ones; a row opens its lines. A photo
// pasted anywhere on the page (Ctrl or Cmd V) or with the Paste button is snapped too.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { DashboardCard } from "@/components/dashboard-card";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { cn } from "@/lib/utils";
import { Icons, Page, PageContent, PageHeader } from "@wealthfolio/ui";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";

import { PasteReceiptButton, ReceiptDetails, SnapReceiptButton, STATE_TONE, usePastedReceipt, useReceiptUpload } from "../components/receipt-panel";
import { useDashboardSkins } from "../lib/dashboard-skin";
import { photoUrl, receiptState, storeName, toReview, useReceipts, type Receipt } from "../lib/receipts";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const day = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Needs a look first (could not be read, or no charge), then the ones to review (owner, 10-03: what the AI
 *  read waits for their Looks good), then waiting, then filed; newest first in each. */
const RANK: Record<Receipt["status"], number> = { failed: 0, held: 0, unmatched: 0, reading: 2, read: 2, waiting: 2, filed: 3 };
const rankOf = (r: Receipt) => (RANK[r.status] > 0 && toReview(r) ? 1 : RANK[r.status]);

export default function SpendingReceiptsPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobileViewport();
  const skins = useDashboardSkins();
  const { data, isLoading, isError, error } = useReceipts();
  const [open, setOpen] = useState<string | null>(null);
  const upload = useReceiptUpload({ onDone: (r) => setOpen(r.id) });
  usePastedReceipt((files) => void upload.send(files), !!data?.ready);

  const rows = useMemo(
    () => [...(data?.receipts ?? [])].sort((a, b) => rankOf(a) - rankOf(b) || String(b.date ?? b.at).localeCompare(String(a.date ?? a.at))),
    [data],
  );
  const look = rows.filter((r) => RANK[r.status] === 0).length;
  const reviews = rows.filter(toReview).length;
  const waiting = rows.filter((r) => r.status === "waiting").length;

  const snap = (
    <div className="flex items-center gap-2">
      <PasteReceiptButton send={(files) => void upload.send(files)} busy={upload.busy}>
        <Icons.Copy className="size-4 sm:mr-1.5" />
        <span className="hidden sm:inline">Paste</span>
      </PasteReceiptButton>
      <SnapReceiptButton variant="default" size="sm" upload={upload}>
        <Icons.Receipt className="size-4 sm:mr-1.5" />
        <span className="hidden sm:inline">Snap a receipt</span>
      </SnapReceiptButton>
    </div>
  );

  return (
    <div className="meadow min-h-screen" data-light-skin={skins.light} data-dark-skin={skins.dark}>
      <Page>
        <PageHeader
          heading="Receipts"
          text={isMobile ? undefined : "Snap or paste a receipt; the card charge is split to match."}
          onBack={() => (window.history.length > 1 ? navigate(-1) : navigate("/activities?tab=spending"))}
          actions={data?.ready ? snap : undefined}
        />
        <PageContent className="space-y-4">
          {isError ? <p className="text-destructive text-sm">{(error as Error)?.message}</p> : null}
          {data && !data.ready ? (
            <p className="text-muted-foreground rounded-lg border px-4 py-3 text-sm">Receipts need the AI set up on the server first.</p>
          ) : null}
          {isLoading ? (
            <Skeleton className="h-[220px] w-full rounded-lg" />
          ) : data?.ready && !rows.length ? (
            <DashboardCard title="Receipts">
              <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
                <Icons.Receipt className="text-muted-foreground size-8" />
                <div className="space-y-1">
                  <p className="text-foreground text-sm font-medium">No receipts yet</p>
                  <p className="text-muted-foreground mx-auto max-w-sm text-xs">
                    Snap one at the store, or paste a photo here. Food stays Groceries, things for the house go to Maintenance & Repairs, and the card charge is split to match when it comes in.
                  </p>
                </div>
                <SnapReceiptButton variant="default" size="sm" upload={upload}>
                  <Icons.Receipt className="mr-1.5 size-4" />
                  Snap a receipt
                </SnapReceiptButton>
              </div>
            </DashboardCard>
          ) : rows.length ? (
            <DashboardCard
              title="Receipts"
              subtitle={[`${rows.length}`, reviews ? `${reviews} to review` : null, look ? `${look} to look at` : null, waiting ? `${waiting} waiting` : null].filter(Boolean).join(" · ")}
              padded={false}
            >
              <ul className="divide-border/60 divide-y">
                {rows.map((r) => {
                  const st = receiptState(r);
                  const isOpen = open === r.id;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? null : r.id)}
                        className="hover:bg-muted/40 flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors md:px-5"
                        aria-expanded={isOpen}
                      >
                        <img src={photoUrl(r.id)} alt="" className="bg-muted h-10 w-8 shrink-0 rounded border object-cover object-top" loading="lazy" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-foreground truncate text-sm font-medium">{storeName(r.store)}</span>
                            <span className={cn("shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium", STATE_TONE[st.tone])}>
                              <span className="sm:hidden">{st.short}</span>
                              <span className="hidden sm:inline">{st.text}</span>
                            </span>
                            {toReview(r) ? (
                              <span className={cn("shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium", STATE_TONE.look)}>
                                <span className="sm:hidden">Review</span>
                                <span className="hidden sm:inline">To review</span>
                              </span>
                            ) : null}
                          </div>
                          <div className="text-muted-foreground truncate text-xs">
                            {[r.date ? day(r.date) : `Snapped ${day(r.at)}`, r.items.length ? `${r.items.filter((x) => x.price > 0).length} items` : null].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        <span className="text-foreground shrink-0 text-sm tabular-nums">{r.total != null ? usd(r.total) : ""}</span>
                        <Icons.ChevronDown className={cn("text-muted-foreground size-4 shrink-0 transition-transform", isOpen && "rotate-180")} />
                      </button>
                      {isOpen ? (
                        <div className="px-4 pb-3 md:px-5">
                          <ReceiptDetails receipt={r} categories={data?.categories ?? []} showHead={false} onChanged={(x) => setOpen(x ? x.id : null)} />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </DashboardCard>
          ) : null}
        </PageContent>
      </Page>
    </div>
  );
}
