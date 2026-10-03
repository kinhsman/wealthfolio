// money-hub patch: receipts (lib/receipts.ts): snap a store receipt, see its lines and their categories,
// change one (the charge is split again, and the store's next receipts remember it). Used in a
// transaction's edit window (ReceiptFor) and on the Receipts page (pages/spending-receipts-page.tsx), which
// Transactions links to. A photo can also be pasted (owner, 10-03: "allow receipt photo pasting"): Ctrl or
// Cmd V on the Receipts page or in the edit window, or the Paste button.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button, Icons } from "@wealthfolio/ui";
import { cn } from "@/lib/utils";

import {
  chargeLink,
  photoUrl,
  receiptSplit,
  receiptState,
  receiptsApi,
  refreshAfterReceipt,
  shortCategory,
  storeName,
  useChargeChoices,
  useReceiptFor,
  type ChargeChoice,
  type Receipt,
  type ReceiptAnswer,
  type ReceiptCategory,
} from "../lib/receipts";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const errorText = (e: unknown) => (e as Error)?.message ?? String(e);

// The theme's own good and worth-a-look colours, as on Returns.
export const STATE_TONE = {
  fine: "bg-[var(--m-good-soft)] text-[var(--m-up)]",
  look: "bg-[var(--m-warn-soft)] text-[var(--m-warn)]",
  plain: "bg-muted text-muted-foreground",
} as const;

/** The categories under their parent ("Housing"), the ones with no parent first (pure order kept). */
function groupsOf(categories: ReceiptCategory[]): [string, ReceiptCategory[]][] {
  const out = new Map<string, ReceiptCategory[]>();
  for (const c of categories) {
    const group = c.name.includes(" > ") ? c.name.split(" > ")[0] : "";
    out.set(group, [...(out.get(group) ?? []), c]);
  }
  return [...out.entries()].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
}

const field =
  "h-7 w-full rounded-md border bg-background px-1.5 text-xs text-foreground focus:border-primary focus:outline-none disabled:opacity-50";

/** What happened, in a toast: where it was filed, or what it waits for. */
export function receiptToast(r: ReceiptAnswer) {
  const name = `${storeName(r.store)}${r.total != null ? `, ${usd(r.total)}` : ""}`;
  if (r.duplicate) {
    toast.message(`Already added: ${name}`, { description: `This receipt${r.date ? ` from ${day(r.date)}` : ""} was snapped before, so nothing new was added.` });
    return;
  }
  if (r.status === "filed") {
    const parts = receiptSplit(r).map((l) => `${shortCategory(r.categories, l.categoryId)} ${usd(l.amount)}`);
    toast.success(name, { description: parts.join(" · ") });
  } else if (r.status === "waiting") toast.success(name, { description: "Read. It files itself when the card charge comes in." });
  else if (r.status === "failed") toast.error(r.error || "The receipt could not be read.");
  else toast.message(name, { description: r.held || receiptState(r).text });
}

interface UploadOptions {
  activityId?: string;
  activityDate?: string;
  onDone?: (r: ReceiptAnswer) => void;
}

/** Send photos of one receipt, with a toast while it reads and one with what it did. */
export function useReceiptUpload({ activityId, activityDate, onDone }: UploadOptions = {}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const send = async (files: File[]) => {
    if (!files.length || busy) return;
    setBusy(true);
    const id = toast.loading("Reading the receipt…", { description: "About 10 seconds." });
    try {
      const r = await receiptsApi.add(files.slice(0, 4), { activityId, activityDate });
      toast.dismiss(id);
      receiptToast(r);
      refreshAfterReceipt(qc);
      onDone?.(r);
    } catch (e) {
      toast.dismiss(id);
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, send };
}

/** The pictures in a paste or a clipboard read (a screenshot, a photo copied from Photos or a page). */
export function imagesIn(dt: Pick<DataTransfer, "items" | "files"> | null): File[] {
  if (!dt) return [];
  const out: File[] = [];
  for (const it of Array.from(dt.items ?? [])) {
    if (it.kind !== "file" || !it.type.startsWith("image/")) continue;
    const f = it.getAsFile();
    if (f) out.push(f);
  }
  if (!out.length) for (const f of Array.from(dt.files ?? [])) if (f.type.startsWith("image/")) out.push(f);
  return out;
}

/**
 * Ctrl or Cmd V with a picture on the clipboard sends it as a receipt while `enabled`. Text pasted into a
 * box stays text: a picture is taken only when the clipboard has no text, or the paste is not in a box.
 */
export function usePastedReceipt(send: (files: File[]) => void, enabled = true) {
  const latest = useRef(send);
  latest.current = send;
  useEffect(() => {
    if (!enabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = imagesIn(e.clipboardData);
      if (!files.length) return;
      const t = e.target as HTMLElement | null;
      const inBox = !!t && (t.isContentEditable || ["INPUT", "TEXTAREA"].includes(t.tagName));
      if (inBox && e.clipboardData?.getData("text/plain")) return;
      e.preventDefault();
      latest.current(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [enabled]);
}

/** Read the pictures on the clipboard (a phone has no Ctrl V: this asks the browser for them). */
async function clipboardImages(): Promise<File[]> {
  if (!navigator.clipboard?.read) throw new Error("This browser can't read the clipboard here. Press Ctrl or Cmd V instead.");
  let items: ClipboardItems;
  try {
    items = await navigator.clipboard.read();
  } catch {
    throw new Error("The browser didn't allow reading the clipboard. Allow it, or press Ctrl or Cmd V.");
  }
  const out: File[] = [];
  for (const item of items) {
    const type = item.types.find((x) => x.startsWith("image/"));
    if (!type) continue;
    const blob = await item.getType(type);
    out.push(new File([blob], `pasted-receipt.${type.split("/")[1] || "png"}`, { type }));
  }
  if (!out.length) throw new Error("No picture on the clipboard. Copy the receipt photo first.");
  return out;
}

/** The Paste button: the picture on the clipboard as a receipt. */
export function PasteReceiptButton({
  send,
  busy,
  className,
  children,
  size = "sm",
}: {
  send: (files: File[]) => void;
  busy: boolean;
  className?: string;
  children?: ReactNode;
  size?: "sm" | "icon" | "default";
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      title="Paste a receipt photo"
      aria-label="Paste a receipt photo"
      disabled={busy}
      className={className}
      onClick={async () => {
        try {
          send(await clipboardImages());
        } catch (e) {
          toast.error(errorText(e));
        }
      }}
    >
      {children ?? <Icons.Copy className="size-4" />}
    </Button>
  );
}

/**
 * A button that opens the camera or the photo picker (up to 4 photos for a long receipt) and sends them.
 * `children` is the button's face; `activityId` ties the receipt to that transaction. `upload`: a shared
 * sender (so a Paste button beside it shows the same busy state).
 */
export function SnapReceiptButton({
  activityId,
  activityDate,
  onDone,
  children,
  className,
  variant = "outline",
  size = "sm",
  title = "Snap a receipt",
  upload,
}: UploadOptions & {
  children?: ReactNode;
  className?: string;
  variant?: "outline" | "ghost" | "default";
  size?: "sm" | "icon" | "default";
  title?: string;
  upload?: ReturnType<typeof useReceiptUpload>;
}) {
  const own = useReceiptUpload({ activityId, activityDate, onDone });
  const { busy, send } = upload ?? own;
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void send(files);
        }}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        title={title}
        aria-label={title}
        disabled={busy}
        className={className}
        onClick={() => input.current?.click()}
      >
        {busy ? <Icons.Spinner className="size-4 animate-spin" /> : children ?? <Icons.Receipt className="size-4" />}
      </Button>
    </>
  );
}

/** A receipt's lines with their categories, and what it did to its charge. */
export function ReceiptDetails({
  receipt: r,
  categories,
  onChanged,
  compact = false,
  showHead = true,
  className,
}: {
  receipt: Receipt;
  categories: ReceiptCategory[];
  onChanged?: (r: ReceiptAnswer | null) => void;
  /** In the edit window: no link to the charge. */
  compact?: boolean;
  /** The photo, store and state on top (the Receipts page's row shows them already). */
  showHead?: boolean;
  className?: string;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const [picking, setPicking] = useState(false);
  const st = receiptState(r);
  const split = receiptSplit(r);
  // No charge found by itself yet: the owner can pick it (a gift card paid part, or two alike).
  const canPick = !compact && !r.activityId && (r.status === "waiting" || r.status === "unmatched" || r.status === "read");

  const act = async (what: string, fn: () => Promise<ReceiptAnswer | { ok: true }>) => {
    setBusy(what);
    try {
      const out = await fn();
      refreshAfterReceipt(qc);
      onChanged?.("id" in out ? out : null);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn("space-y-2.5 text-xs", className)}>
      {showHead ? (
      <div className="flex items-start gap-2.5">
        <a href={photoUrl(r.id)} target="_blank" rel="noreferrer" className="shrink-0" title="Open the photo">
          <img src={photoUrl(r.id)} alt="Receipt" className="bg-muted h-12 w-9 rounded border object-cover object-top" />
        </a>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-foreground truncate text-sm font-medium">{storeName(r.store)}</span>
            <span className={cn("shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium", STATE_TONE[st.tone])}>{st.text}</span>
          </div>
          <div className="text-muted-foreground truncate">
            {[r.date && day(r.date), r.total != null && usd(r.total), r.tax ? `tax ${usd(r.tax)}` : null, r.cardLast4 && `card ••${r.cardLast4}`]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      </div>
      ) : (
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3">
          <span>{[r.total != null && usd(r.total), r.tax ? `tax ${usd(r.tax)}` : null, r.cardLast4 && `card ••${r.cardLast4}`].filter(Boolean).join(" · ")}</span>
          <a href={photoUrl(r.id)} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
            Photo{r.photos > 1 ? "s" : ""}
          </a>
          {r.photos > 1
            ? Array.from({ length: r.photos - 1 }, (_, i) => (
                <a key={i} href={photoUrl(r.id, i + 1)} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                  {i + 2}
                </a>
              ))
            : null}
        </div>
      )}

      {split.length ? (
        <div className="flex flex-wrap gap-1.5">
          {split.map((l) => (
            <span key={l.categoryId} className="bg-muted/60 text-foreground rounded-md px-2 py-0.5 tabular-nums">
              {shortCategory(categories, l.categoryId)} {usd(l.amount)}
            </span>
          ))}
        </div>
      ) : null}

      {r.error ? <p className="text-[var(--m-warn)]">{r.error}</p> : null}
      {r.held ? <p className="text-[var(--m-warn)]">{r.held}</p> : null}
      {r.status === "waiting" ? <p className="text-muted-foreground">It files itself when the card charge comes in, usually in 1 to 3 days.</p> : null}
      {r.status === "unmatched" ? (
        <p className="text-muted-foreground">No card charge of {r.total != null ? usd(r.total) : "this total"} came in. Pick the charge it was.</p>
      ) : null}
      {r.check ? <p className="text-muted-foreground">{r.check}</p> : null}
      {r.filed && r.total != null && Math.abs(r.filed.charge - r.total) > 0.005 ? (
        <p className="text-muted-foreground">The charge is {usd(r.filed.charge)}; each part is scaled to it.</p>
      ) : null}

      {r.items.length ? (
        <ul className="divide-border/60 divide-y border-t">
          {r.items.map((it) => {
            const discount = it.price < 0;
            return (
              <li key={it.n} className="flex items-center gap-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <div className={cn("truncate", discount ? "text-muted-foreground" : "text-foreground")}>{it.what || it.name}</div>
                  {/* On a phone and in the edit window the price sits here, so the category gets the room. */}
                  <div className="text-muted-foreground truncate text-[11px]">
                    <span className={cn("tabular-nums", !compact && "sm:hidden")}>{usd(it.price)}</span>
                    {it.what && it.name ? <span><span className={cn(!compact && "sm:hidden")}> · </span>{it.name}</span> : null}
                  </div>
                </div>
                {compact ? null : (
                  <span className={cn("hidden shrink-0 tabular-nums sm:inline", discount ? "text-muted-foreground" : "text-foreground")}>{usd(it.price)}</span>
                )}
                <div className={cn("w-[52%] shrink-0", !compact && "sm:w-48")}>
                  {discount ? (
                    <span className="text-muted-foreground block truncate px-1.5">{shortCategory(categories, it.categoryId)}</span>
                  ) : (
                    <select
                      value={it.categoryId}
                      disabled={busy !== null || !categories.length}
                      onChange={(e) => void act(`cat-${it.n}`, () => receiptsApi.setCategory(r.id, it.n, e.target.value))}
                      className={field}
                      aria-label={`Category for ${it.what || it.name}`}
                    >
                      {groupsOf(categories).map(([group, cats]) =>
                        group ? (
                          <optgroup key={group} label={group}>
                            {cats.map((c) => (
                              <option key={c.id} value={c.id}>
                                {shortCategory(categories, c.id)}
                              </option>
                            ))}
                          </optgroup>
                        ) : (
                          cats.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))
                        ),
                      )}
                      {categories.some((c) => c.id === it.categoryId) ? null : <option value={it.categoryId}>{it.categoryId}</option>}
                    </select>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {canPick && picking ? (
        <ChargePicker
          receipt={r}
          busy={busy !== null}
          onPick={(c) =>
            void act("pick", async () => {
              const out = await receiptsApi.setCharge(r.id, c.id, c.date);
              receiptToast(out);
              setPicking(false);
              return out;
            })
          }
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t pt-2">
        {canPick ? (
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy !== null} onClick={() => setPicking(!picking)} aria-expanded={picking}>
            {busy === "pick" ? <Icons.Spinner className="mr-1.5 size-3.5 animate-spin" /> : null}
            {picking ? "Close the list" : "Pick the charge"}
          </Button>
        ) : null}
        {r.status === "held" && r.activityId ? (
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy !== null} onClick={() => void act("file", () => receiptsApi.fileAnyway(r.id))}>
            {busy === "file" ? <Icons.Spinner className="mr-1.5 size-3.5 animate-spin" /> : null}
            Use the receipt
          </Button>
        ) : null}
        {!compact && chargeLink(r) ? (
          <Link to={chargeLink(r)!} className="text-primary underline-offset-4 hover:underline">
            See the charge
          </Link>
        ) : null}
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground disabled:opacity-50"
          disabled={busy !== null}
          onClick={() => void act("read", () => receiptsApi.readAgain(r.id))}
        >
          {busy === "read" ? "Reading…" : "Read again"}
        </button>
        <span className="flex-1" />
        {sure ? (
          <span className="flex items-center gap-2">
            <span className="text-muted-foreground">The charge keeps its categories.</span>
            <button type="button" className="text-destructive hover:underline" disabled={busy !== null} onClick={() => void act("remove", () => receiptsApi.remove(r.id))}>
              Delete
            </button>
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setSure(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setSure(true)}>
            Delete receipt
          </button>
        )}
      </div>
    </div>
  );
}

/** The charges a receipt may be for, most likely first; a click files the receipt on that one. */
function ChargePicker({ receipt: r, busy, onPick }: { receipt: Receipt; busy: boolean; onPick: (c: ChargeChoice) => void }) {
  const { data, isLoading, isError, error } = useChargeChoices(r.id, true);
  if (isLoading) {
    return (
      <div className="text-muted-foreground flex items-center gap-1.5">
        <Icons.Spinner className="size-3.5 animate-spin" />
        Looking for charges…
      </div>
    );
  }
  if (isError) return <p className="text-[var(--m-warn)]">{errorText(error)}</p>;
  const items = data?.items ?? [];
  if (!items.length) {
    return (
      <p className="text-muted-foreground">
        No {storeName(r.store)} charge{r.total != null ? ` and none of ${usd(r.total)}` : ""}
        {data ? ` from ${day(data.from)} to ${day(data.to)}` : ""}. Open the charge in Transactions and add the receipt there.
      </p>
    );
  }
  return (
    <div className="rounded-lg border">
      <div className="text-muted-foreground border-b px-3 py-1.5">Which charge is it? The parts are scaled to it.</div>
      <ul className="divide-border/60 divide-y">
        {items.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              disabled={busy}
              onClick={() => onPick(c)}
              className="hover:bg-muted/40 flex w-full items-center gap-2 px-3 py-2 text-left transition-colors disabled:opacity-50"
            >
              <div className="min-w-0 flex-1">
                <div className="text-foreground truncate">{c.name || "Charge"}</div>
                <div className="text-muted-foreground truncate text-[11px]">{[day(c.date), c.account].filter(Boolean).join(" · ")}</div>
              </div>
              {c.sameTotal ? <span className={cn("shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium", STATE_TONE.fine)}>Same total</span> : null}
              <span className="text-foreground shrink-0 tabular-nums">{usd(c.amount)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A transaction's receipt in its edit window, or the buttons to add one (a photo, or a pasted one). */
export function ReceiptFor({ activityId, activityDate, onFiled }: { activityId: string; activityDate?: string; onFiled?: (r: ReceiptAnswer) => void }) {
  const { data } = useReceiptFor(activityId);
  const upload = useReceiptUpload({ activityId, activityDate, onDone: onFiled });
  const canAdd = !!data && !data.receipt && data.ready;
  usePastedReceipt((files) => void upload.send(files), canAdd);
  if (!data) return null;
  if (data.receipt) {
    return (
      <ReceiptDetails
        receipt={data.receipt}
        categories={data.categories}
        compact
        className="rounded-lg border p-3"
        onChanged={(r) => (r ? onFiled?.(r) : undefined)}
      />
    );
  }
  if (!data.ready) return null;
  return (
    <div className="flex items-stretch gap-2">
      <SnapReceiptButton
        upload={upload}
        variant="outline"
        size="default"
        className="text-muted-foreground h-auto min-w-0 flex-1 justify-start gap-2.5 whitespace-normal rounded-lg border-dashed px-3 py-2.5 text-left text-xs font-normal"
      >
        <Icons.Receipt className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="text-foreground block text-sm font-medium">Add a receipt</span>
          <span className="block">Take or pick a photo, or paste one here. Each item gets its category, and the charge is split to match.</span>
        </span>
      </SnapReceiptButton>
      <PasteReceiptButton
        send={(files) => void upload.send(files)}
        busy={upload.busy}
        size="default"
        className="text-muted-foreground h-auto shrink-0 flex-col gap-1 rounded-lg border-dashed px-3 text-xs font-normal"
      >
        <Icons.Copy className="size-4" />
        Paste
      </PasteReceiptButton>
    </div>
  );
}
