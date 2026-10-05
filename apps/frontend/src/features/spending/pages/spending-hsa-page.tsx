// money-hub patch: HSA receipts (/spending/hsa; lib/hsa.ts, owner 2026-10-04: "plan to move it directly to this
// app instead", the n8n Telegram bot that logged medical receipts for HSA reimbursement). Snap a receipt, upload
// a PDF or type the details; the AI reads provider, date, amount and currency; the page lists every receipt with
// what is still unreimbursed, marks them reimbursed, lets the owner fix what was read, find the card charge,
// add a photo, and export a packet for a claim. The page sits inside `.meadow` like Receipts, so it follows the
// Spending theme (Meadow or Bronze Titanium, light or dark). What an add did is said in a banner under the
// header; the Drive copy has one quiet status line. A phone gets its own compact layout, chosen in JS.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { DashboardCard } from "@/components/dashboard-card";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { cn } from "@/lib/utils";
import { Button, Icons, Input, Page, PageContent, PageHeader, Skeleton } from "@wealthfolio/ui";

import { HsaCopyLine } from "../components/hsa-copy-line";
import { ExportMenu, HsaSettingsDialog, PasteDetailsDialog } from "../components/hsa-dialogs";
import { HsaDetail } from "../components/hsa-detail";
import { Banner, Chip, ChipSelect, type ShownBanner } from "../components/hsa-parts";
import { HsaCardRow, HsaTableHead, HsaTableRow } from "../components/hsa-rows";
import { HsaTotalsStrip } from "../components/hsa-totals";
import { UploadPdfButton } from "../components/receipt-file";
import { SnapReceiptButton, usePastedReceipt } from "../components/receipt-panel";
import { useDashboardSkins } from "../lib/dashboard-skin";
import {
  HSA_KEY,
  NOT_READY_TEXT,
  NO_FILTERS,
  NO_PATIENT,
  STATUS_LABEL,
  countText,
  errorBanner,
  filterHsa,
  formatUsd,
  hsaApi,
  hsaSearchIndex,
  isFiltered,
  junkCount,
  outcomeBanner,
  pollAfterCopy,
  refreshAfterHsa,
  scopeRows,
  searchHsa,
  totalsOfRows,
  useHsa,
  type HsaAnswer,
  type HsaFilters,
} from "../lib/hsa";

/** Whether the window is at least this wide (JS, so only one layout is ever mounted). */
function useViewportAtLeast(px: number) {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(`(min-width: ${px}px)`);
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    () => window.matchMedia(`(min-width: ${px}px)`).matches,
    () => true,
  );
}

const errorText = (e: unknown) => (e as Error)?.message ?? String(e);

export default function SpendingHsaPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const phone = useIsMobileViewport();
  const table = useViewportAtLeast(1280);
  const skins = useDashboardSkins();

  // After Copy now the list is asked again every few seconds while pictures wait (lib/hsa.ts pollAfterCopy).
  const copyStarted = useRef<number | null>(null);
  const { data, isLoading, isError, error } = useHsa((view) =>
    pollAfterCopy({
      startedAt: copyStarted.current,
      now: Date.now(),
      waiting: view?.mirror.waiting ?? 0,
    }),
  );

  const [filters, setFilters] = useState<HsaFilters>(NO_FILTERS);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [banner, setBanner] = useState<ShownBanner | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [gearOpen, setGearOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [copying, setCopying] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  // One add at a time: reading takes about 10 seconds, and the answer is a banner (never a subtitle).
  const add = async (what: () => Promise<HsaAnswer>) => {
    if (adding) return;
    setAdding(true);
    setBanner({
      tone: "plain",
      title: "Reading the receipt.",
      text: "About 10 seconds.",
      busy: true,
    });
    try {
      setBanner(outcomeBanner(await what()));
      void refreshAfterHsa(qc);
    } catch (e) {
      setBanner(errorBanner(errorText(e)));
    } finally {
      setAdding(false);
    }
  };
  const sendFiles = (files: File[]) => add(() => hsaApi.add(files));
  const upload = { busy: adding, send: sendFiles };
  usePastedReceipt((files) => void sendFiles(files), !!data?.ready && !pasteOpen && !open);

  // The banner is where the eye is after a tap in the sticky header: bring it into view.
  useEffect(() => {
    if (banner) bannerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [banner]);

  const copyNow = async () => {
    if (copying) return;
    setCopying(true);
    copyStarted.current = Date.now();
    try {
      qc.setQueryData(HSA_KEY, await hsaApi.runMirror());
    } catch (e) {
      copyStarted.current = null;
      setBanner(errorBanner(errorText(e)));
    } finally {
      setCopying(false);
    }
  };

  const rows = useMemo(() => data?.receipts ?? [], [data]);
  const index = useMemo(() => hsaSearchIndex(rows), [rows]);
  const strip = useMemo(() => totalsOfRows(scopeRows(rows, filters)), [rows, filters]);
  const searching = query.trim() !== "";
  const shown = useMemo(() => {
    const found = searching ? new Set(searchHsa(index, query).map((r) => r.id)) : null;
    return filterHsa(rows, filters).filter((r) => !found || found.has(r.id));
  }, [rows, index, filters, query, searching]);
  const shownUsd = shown.reduce((a, r) => a + Math.round((r.usd ?? 0) * 100), 0) / 100;
  const years = data?.totals.byYear ?? [];
  const people = data?.totals.byPatient ?? [];
  const junk = junkCount(rows);
  const opened = open ? (rows.find((r) => r.id === open) ?? null) : null;
  const filtering = isFiltered(filters) || searching;
  const set = (p: Partial<HsaFilters>) => setFilters((f) => ({ ...f, ...p }));

  // Below 1280 the header buttons are icons (the phone's keywords); Snap, the main one, keeps its name from 768 up.
  const iconOnly = table ? undefined : "!size-8 !px-0";
  const word = (icon: ReactNode, text: string) => (
    <>
      <span className={cn(table && "mr-1.5")}>{icon}</span>
      {table ? text : null}
    </>
  );
  const addButtons = data?.ready ? (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        title="Paste details"
        aria-label="Paste details"
        disabled={adding}
        className={iconOnly}
        onClick={() => setPasteOpen(true)}
      >
        {word(<Icons.Pencil className="size-4" />, "Paste details")}
      </Button>
      <UploadPdfButton send={sendFiles} busy={adding} className={iconOnly}>
        {word(<Icons.FileText className="size-4" />, "Upload PDF")}
      </UploadPdfButton>
      <SnapReceiptButton
        variant="default"
        size="sm"
        upload={upload}
        className="max-md:!size-8 max-md:!px-0"
      >
        <Icons.Receipt className="size-4 md:mr-1.5" />
        <span className="hidden md:inline">Snap a receipt</span>
      </SnapReceiptButton>
    </>
  ) : null;

  const actions = (
    <div className="flex items-center gap-1.5 md:gap-2">
      {addButtons}
      <ExportMenu totals={data?.totals} labelled={table} className={iconOnly} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        title="HSA settings"
        aria-label="HSA settings"
        className="!size-8 !px-0 md:!size-9"
        disabled={!data}
        onClick={() => setGearOpen(true)}
      >
        <Icons.Settings className="size-4" />
      </Button>
    </div>
  );

  const searchBox = (
    <div className="relative md:w-80">
      <Icons.Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search provider, patient, amount"
        className="h-9 px-9 [&::-webkit-search-cancel-button]:appearance-none"
        autoComplete="off"
        aria-label="Search HSA receipts"
      />
      {query ? (
        <button
          type="button"
          onClick={() => setQuery("")}
          aria-label="Clear search"
          className="text-muted-foreground hover:text-foreground absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full"
        >
          <Icons.X className="size-4" />
        </button>
      ) : null}
    </div>
  );

  const photos = data?.totals.needsPhoto ?? 0;
  const photoChip =
    photos > 0 || filters.needsPhoto ? (
      <Chip on={filters.needsPhoto} onClick={() => set({ needsPhoto: !filters.needsPhoto })}>
        Needs photo ({photos})
      </Chip>
    ) : null;
  const junkChip =
    junk > 0 || filters.status === "junk" ? (
      <Chip
        on={filters.status === "junk"}
        onClick={() => set({ status: filters.status === "junk" ? null : "junk" })}
        className={phone ? "h-6 px-2.5 text-[11.5px]" : undefined}
      >
        Junk ({junk})
      </Chip>
    ) : null;
  const personKey = (p: string | null) => p ?? NO_PATIENT;
  // A wide screen shows every year and person as a chip; a phone folds each group into one chip you pick from,
  // so the filters stay in one row (owner rule: a phone gets half the height).
  const chips = phone ? (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {years.length > 1 ? (
        <ChipSelect
          label="Year"
          value={filters.year ?? ""}
          onChange={(v) => set({ year: v || null })}
          options={[
            { value: "", label: "All years" },
            ...years.map((y) => ({ value: y.year, label: y.year })),
          ]}
        />
      ) : null}
      {people.length > 1 ? (
        <ChipSelect
          label="Person"
          value={filters.patient ?? ""}
          onChange={(v) => set({ patient: v || null })}
          className="max-w-[9.5rem]"
          options={[
            { value: "", label: "Everyone" },
            ...people.map((p) => ({
              value: personKey(p.patient),
              label: p.patient ?? "No patient",
            })),
          ]}
        />
      ) : null}
      {photoChip}
    </div>
  ) : (
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
      {years.length > 1 ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Year">
          <Chip on={!filters.year} onClick={() => set({ year: null })}>
            All years
          </Chip>
          {years.map((y) => (
            <Chip
              key={y.year}
              on={filters.year === y.year}
              onClick={() => set({ year: filters.year === y.year ? null : y.year })}
            >
              {y.year}
            </Chip>
          ))}
        </div>
      ) : null}
      {people.length > 1 ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Person">
          <Chip on={filters.patient == null} onClick={() => set({ patient: null })}>
            Everyone
          </Chip>
          {people.map((p) => (
            <Chip
              key={personKey(p.patient)}
              on={filters.patient === personKey(p.patient)}
              onClick={() =>
                set({
                  patient: filters.patient === personKey(p.patient) ? null : personKey(p.patient),
                })
              }
            >
              {p.patient ?? "No patient"}
            </Chip>
          ))}
        </div>
      ) : null}
      {photoChip || junkChip ? (
        <div className="flex flex-wrap gap-1.5">
          {photoChip}
          {junkChip}
        </div>
      ) : null}
    </div>
  );

  const clear = () => {
    setFilters(NO_FILTERS);
    setQuery("");
  };

  const empty = (
    <DashboardCard title="HSA receipts">
      <div className="flex flex-col items-center gap-3 px-4 py-8 text-center max-md:gap-2 max-md:py-5">
        <Icons.Receipt className="text-muted-foreground size-8" />
        <div className="space-y-1">
          <p className="text-foreground text-sm">No HSA receipts yet</p>
          {phone ? null : (
            <p className="text-muted-foreground mx-auto max-w-sm text-xs">
              Snap a receipt, upload a PDF, or type the details. The provider, date and amount are
              read for you.
            </p>
          )}
        </div>
        {data?.ready ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <SnapReceiptButton variant="default" size="sm" upload={upload}>
              <Icons.Receipt className="mr-1.5 size-4" />
              Snap a receipt
            </SnapReceiptButton>
            <UploadPdfButton send={sendFiles} busy={adding}>
              <Icons.FileText className="mr-1.5 size-4" />
              Upload PDF
            </UploadPdfButton>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={adding}
              onClick={() => setPasteOpen(true)}
            >
              <Icons.Pencil className="mr-1.5 size-4" />
              Paste details
            </Button>
          </div>
        ) : null}
      </div>
    </DashboardCard>
  );

  const listTitle = filters.status ? STATUS_LABEL[filters.status] : "Receipts";
  const body = !data ? null : !rows.length ? (
    empty
  ) : (
    <>
      <HsaTotalsStrip
        totals={strip}
        status={filters.status === "junk" ? null : filters.status}
        onPick={(s) => set({ status: s })}
        phone={phone}
      />
      {phone ? (
        <div className="flex flex-col gap-2">
          {searchBox}
          {chips}
        </div>
      ) : (
        chips
      )}
      <DashboardCard
        title={listTitle}
        subtitle={[
          shown.length === rows.length || !filtering
            ? countText(shown.length)
            : `${shown.length} of ${rows.length}`,
          shown.length ? formatUsd(shownUsd) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        action={
          <div className="flex items-center gap-3 max-md:gap-2">
            {filtering ? (
              <button
                type="button"
                onClick={clear}
                className="text-primary text-xs underline-offset-4 hover:underline"
              >
                Clear filters
              </button>
            ) : null}
            {phone ? junkChip : searchBox}
          </div>
        }
        padded={false}
      >
        {!shown.length ? (
          <div className="flex items-center justify-between gap-3 px-5 py-6 max-md:px-3 max-md:py-4">
            <p className="text-muted-foreground min-w-0 truncate text-sm">
              {searching ? `No receipts match "${query.trim()}".` : "No receipts here."}
            </p>
            <button
              type="button"
              onClick={clear}
              className="text-primary shrink-0 text-sm underline-offset-4 hover:underline"
            >
              Clear
            </button>
          </div>
        ) : (
          <div role="table" aria-label="HSA receipts">
            {table ? <HsaTableHead /> : null}
            <ul>
              {shown.map((r) =>
                table ? (
                  <HsaTableRow key={r.id} r={r} onOpen={() => setOpen(r.id)} />
                ) : (
                  <HsaCardRow key={r.id} r={r} phone={phone} onOpen={() => setOpen(r.id)} />
                ),
              )}
            </ul>
          </div>
        )}
      </DashboardCard>
    </>
  );

  return (
    <div className="meadow min-h-screen" data-light-skin={skins.light} data-dark-skin={skins.dark}>
      <Page>
        <PageHeader
          heading="HSA receipts"
          text={phone ? undefined : "Medical receipts for HSA reimbursement."}
          onBack={() =>
            window.history.length > 1 ? navigate(-1) : navigate("/activities?tab=spending")
          }
          actions={actions}
        />
        <PageContent className="px-3 pb-[var(--mobile-nav-total-offset)] md:px-6 md:pb-8 lg:px-8">
          <div className="flex flex-col gap-3.5 max-md:gap-2">
            {data ? (
              <HsaCopyLine
                mirror={data.mirror}
                phone={phone}
                running={copying}
                onRun={() => void copyNow()}
              />
            ) : null}
            <div ref={bannerRef} className="flex flex-col gap-2 empty:hidden">
              {banner ? (
                <Banner banner={banner} onClose={() => setBanner(null)} onOpen={setOpen} />
              ) : null}
              {data && !data.ready ? (
                <Banner banner={errorBanner(NOT_READY_TEXT)} onOpen={setOpen} />
              ) : null}
              {isError ? <Banner banner={errorBanner(errorText(error))} onOpen={setOpen} /> : null}
            </div>
            {isLoading ? (
              <div className="flex flex-col gap-3.5 max-md:gap-2" aria-busy>
                <Skeleton
                  className={cn(
                    "w-full",
                    phone ? "h-[72px] rounded-[14px]" : "h-[116px] rounded-[20px]",
                  )}
                />
                <Skeleton
                  className={cn(
                    "w-full",
                    phone ? "h-[200px] rounded-[14px]" : "h-[320px] rounded-[20px]",
                  )}
                />
              </div>
            ) : (
              body
            )}
          </div>
        </PageContent>
      </Page>
      {data ? (
        <>
          <HsaDetail
            receipt={opened}
            settings={data.settings}
            types={data.types}
            onClose={() => setOpen(null)}
          />
          <HsaSettingsDialog open={gearOpen} onOpenChange={setGearOpen} settings={data.settings} />
          <PasteDetailsDialog
            open={pasteOpen}
            onOpenChange={setPasteOpen}
            onSend={(text) => void add(() => hsaApi.addText(text))}
          />
        </>
      ) : null}
    </div>
  );
}
