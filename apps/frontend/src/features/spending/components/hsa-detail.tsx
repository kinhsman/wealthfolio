// money-hub patch: one HSA receipt opened (lib/hsa.ts): the picture beside the fields on a wide screen, every
// field editable (only what changed is sent), the status with Mark reimbursed, the card charge to find for a
// receipt whose dollar figure is not from one, a photo to add when it has fewer than 4, and Delete. A window
// on a computer, a sheet from the bottom on a phone, portalled to <body> (the Dialog does it); the buttons
// stay pinned at the bottom while the fields scroll.
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Icons,
  Textarea,
} from "@wealthfolio/ui";

import {
  HSA_KEY,
  MAX_PHOTOS,
  SOURCE_LABEL,
  SOURCE_ORDER,
  STATUS_LABEL,
  STATUS_ORDER,
  dayText,
  dollarsRecalculated,
  draftError,
  draftOf,
  formatUsd,
  hsaApi,
  patchOf,
  photoUrl,
  pictured,
  refreshAfterHsa,
  reimbursedPatch,
  todayIso,
  useHsaCharges,
  type HsaCharge,
  type HsaDraft,
  type HsaPatch,
  type HsaReceipt,
  type HsaSettings,
  type HsaView,
} from "../lib/hsa";
import { ReceiptFileLinks, ReceiptPhotoPanel } from "./receipt-file";
import { Field, SourceTag, StatusTag, Tag, fieldClass } from "./hsa-parts";

const errorText = (e: unknown) => (e as Error)?.message ?? String(e);

/** The list holds the answer now, so the row and the opened window agree before the list asks again. */
function putReceipt(qc: ReturnType<typeof useQueryClient>, next: HsaReceipt) {
  qc.setQueryData<HsaView>(HSA_KEY, (v) =>
    v ? { ...v, receipts: v.receipts.map((x) => (x.id === next.id ? next : x)) } : v,
  );
}

/** The card charge in Transactions: that day, that amount. */
const chargeLink = (r: HsaReceipt) => {
  if (!r.chargeDate || r.usd == null) return null;
  const q = new URLSearchParams({
    tab: "spending",
    from: r.chargeDate,
    to: r.chargeDate,
    amountMin: r.usd.toFixed(2),
    amountMax: r.usd.toFixed(2),
  });
  return `/activities?${q.toString()}`;
};

/** The charges a receipt may be for, most likely first; a tap makes that charge's amount the figure. */
function ChargeFinder({
  receipt: r,
  busy,
  onPick,
}: {
  receipt: HsaReceipt;
  busy: boolean;
  onPick: (c: HsaCharge) => void;
}) {
  const { data, isLoading, isError, error } = useHsaCharges(r.id, true);
  if (isLoading)
    return (
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Icons.Spinner className="size-3.5 animate-spin" />
        Looking for charges
      </div>
    );
  if (isError) return <p className="text-xs text-[var(--m-warn)]">{errorText(error)}</p>;
  const items = data?.items ?? [];
  if (!items.length)
    return <p className="text-muted-foreground text-xs">No matching charge found yet</p>;
  return (
    <ul className="divide-border/60 divide-y rounded-lg border">
      {items.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            disabled={busy}
            onClick={() => onPick(c)}
            className="hover:bg-muted/40 flex w-full items-center gap-2 px-3 py-2 text-left transition-colors disabled:opacity-50"
          >
            <div className="min-w-0 flex-1">
              <div className="text-foreground truncate text-[13px]">{c.name || "Charge"}</div>
              <div className="text-muted-foreground truncate text-[11px]">
                {[dayText(c.date), c.account].filter(Boolean).join(" · ")}
              </div>
            </div>
            {c.sameTotal ? <Tag tone="good">Same total</Tag> : null}
            {c.store && !c.sameTotal ? <Tag tone="plain">Name matches</Tag> : null}
            <span className="text-foreground shrink-0 text-[13px] tabular-nums">
              {formatUsd(c.amount)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function HsaDetailBody({
  receipt: r,
  settings,
  types,
  onClose,
}: {
  receipt: HsaReceipt;
  settings: HsaSettings;
  types: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<HsaDraft>(() => draftOf(r));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const [sure, setSure] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  const patch = patchOf(r, draft);
  const dirty = Object.keys(patch).length > 0;
  const set = (p: Partial<HsaDraft>) => setDraft((d) => ({ ...d, ...p }));
  const hasPicture = r.photos > 0;
  const typeList = types.includes(draft.type) ? types : [...types, draft.type];
  const note = dollarsRecalculated(r, draft);

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  /** Save what changed, with `extra` (the one tap that marks it paid back or good). */
  const save = (extra: HsaPatch = {}, done = "Changes saved") =>
    run("save", async () => {
      const bad = draftError(draft);
      if (bad) throw new Error(bad);
      const body = { ...patch, ...extra };
      if (!Object.keys(body).length) return onClose();
      const next = await hsaApi.edit(r.id, body);
      putReceipt(qc, next);
      void refreshAfterHsa(qc);
      toast.success(done);
      onClose();
    });

  const pick = (c: HsaCharge) =>
    run("charge", async () => {
      const next = await hsaApi.setCharge(r.id, c.id);
      putReceipt(qc, next);
      void refreshAfterHsa(qc);
      // The charge sets the dollars, where they are from and (for one that needed a look) the status.
      setDraft((d) => ({
        ...d,
        usd: next.usd != null ? next.usd.toFixed(2) : "",
        amountSource: next.amountSource,
        status: next.status,
        reimbursedOn: next.reimbursedOn ?? "",
      }));
      setFinding(false);
      toast.success("Matched to the card charge");
    });

  const addPhotos = (files: File[]) =>
    run("photo", async () => {
      const room = MAX_PHOTOS - r.photos;
      if (room <= 0 || !files.length) return;
      const next = await hsaApi.addPhotos(r.id, files.slice(0, room));
      putReceipt(qc, next);
      void refreshAfterHsa(qc);
      toast.success(files.length > 1 ? "Photos added" : "Photo added");
    });

  const remove = () =>
    run("delete", async () => {
      qc.setQueryData(HSA_KEY, await hsaApi.remove(r.id));
      toast.success("Receipt deleted");
      onClose();
    });

  const reimbursed = draft.status === "reimbursed";
  const canMark = r.status !== "reimbursed" && r.status !== "junk";

  return (
    <>
      {/* The title row leaves room for the window's own close button. */}
      <div className="shrink-0 space-y-1.5 px-4 pb-2.5 pr-14 pt-4 sm:px-6 sm:pt-5">
        <DialogTitle className="truncate text-base font-medium">{r.provider}</DialogTitle>
        <DialogDescription className="sr-only">Edit this HSA receipt.</DialogDescription>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusTag status={r.status} />
          <SourceTag source={r.amountSource} />
          <span className="text-muted-foreground text-xs">{dayText(r.date)}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 sm:px-6">
        <div className="lg:flex lg:items-start lg:gap-5">
          <ReceiptPhotoPanel receipt={pictured(r)} urlOf={photoUrl} />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
              {r.amountSource !== "card" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  aria-expanded={finding}
                  disabled={busy !== null}
                  onClick={() => setFinding(!finding)}
                >
                  {finding ? "Close the list" : "Find the card charge"}
                </Button>
              ) : (
                <span className="text-muted-foreground inline-flex items-center gap-1.5">
                  <Icons.CreditCard className="size-3.5" aria-hidden />
                  {r.chargeDate ? `Card charge of ${dayText(r.chargeDate)}` : "Card charge"}
                  {chargeLink(r) ? (
                    <Link
                      to={chargeLink(r)!}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      See the charge
                    </Link>
                  ) : null}
                </span>
              )}
              {r.photos < MAX_PHOTOS ? (
                <>
                  <input
                    ref={photoInput}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      e.target.value = "";
                      void addPhotos(files);
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={busy !== null}
                    onClick={() => photoInput.current?.click()}
                  >
                    {busy === "photo" ? (
                      <Icons.Spinner className="size-3.5 animate-spin" />
                    ) : (
                      <Icons.ImageUp className="size-3.5" />
                    )}
                    Add a photo
                  </Button>
                </>
              ) : null}
              <ReceiptFileLinks receipt={pictured(r)} urlOf={photoUrl} />
              {r.oldLink ? (
                <a
                  href={r.oldLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline"
                >
                  <Icons.ExternalLink className="size-3.5" />
                  Old picture
                </a>
              ) : null}
              {!hasPicture && !r.oldLink ? (
                <span className="text-[var(--m-warn)]">No photo yet</span>
              ) : null}
            </div>
            {finding && r.amountSource !== "card" ? (
              <ChargeFinder receipt={r} busy={busy !== null} onPick={(c) => void pick(c)} />
            ) : null}
            <div className="grid grid-cols-2 gap-x-2.5 gap-y-2.5">
              <Field label="Provider" className="col-span-2">
                <input
                  value={draft.provider}
                  onChange={(e) => set({ provider: e.target.value })}
                  className={fieldClass}
                  autoComplete="off"
                />
              </Field>
              <Field label="Date">
                <input
                  type="date"
                  value={draft.date}
                  onChange={(e) => set({ date: e.target.value })}
                  className={fieldClass}
                />
              </Field>
              <Field label="Type">
                <select
                  value={draft.type}
                  onChange={(e) => set({ type: e.target.value })}
                  className={fieldClass}
                >
                  {typeList.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="col-span-2 space-y-1.5">
                <Field label="Patient">
                  <input
                    value={draft.patient}
                    onChange={(e) => set({ patient: e.target.value })}
                    className={fieldClass}
                    placeholder="No patient"
                    autoComplete="off"
                  />
                </Field>
                {settings.patients.length ? (
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pick a patient">
                    {settings.patients.map((p) => (
                      <button
                        key={p}
                        type="button"
                        aria-pressed={draft.patient === p}
                        onClick={() => set({ patient: draft.patient === p ? "" : p })}
                        className={cn(
                          "h-6 rounded-full px-2.5 text-[11.5px] transition-colors",
                          draft.patient === p
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted border",
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <Field label="Amount on receipt">
                <input
                  value={draft.amount}
                  inputMode="decimal"
                  onChange={(e) => set({ amount: e.target.value })}
                  className={cn(fieldClass, "tabular-nums")}
                />
              </Field>
              <Field label="Currency">
                <input
                  value={draft.currency}
                  maxLength={3}
                  onChange={(e) => set({ currency: e.target.value.toUpperCase() })}
                  className={cn(fieldClass, "uppercase")}
                  autoComplete="off"
                />
              </Field>
              <div className="col-span-2 grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-x-2.5">
                <Field label="Dollar amount">
                  <input
                    value={draft.usd}
                    inputMode="decimal"
                    placeholder="None yet"
                    // A figure typed by hand is Unverified until you say where it is from.
                    onChange={(e) => set({ usd: e.target.value, amountSource: "unverified" })}
                    className={cn(fieldClass, "tabular-nums")}
                  />
                </Field>
                <Field label="Dollars come from">
                  <select
                    value={draft.amountSource}
                    onChange={(e) =>
                      set({ amountSource: e.target.value as HsaDraft["amountSource"] })
                    }
                    className={fieldClass}
                  >
                    {SOURCE_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {SOURCE_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {note ? (
                <p className="text-muted-foreground col-span-2 -mt-1 text-[11px]">
                  The dollar amount is worked out again when you save.
                </p>
              ) : null}
              <Field label="Status" className={reimbursed ? "" : "col-span-2"}>
                <select
                  value={draft.status}
                  onChange={(e) => {
                    const status = e.target.value as HsaDraft["status"];
                    // Paid back today unless the day is changed.
                    set({
                      status,
                      ...(status === "reimbursed" && !draft.reimbursedOn
                        ? { reimbursedOn: todayIso() }
                        : {}),
                    });
                  }}
                  className={fieldClass}
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </Field>
              {reimbursed ? (
                <Field label="Reimbursed on">
                  <input
                    type="date"
                    value={draft.reimbursedOn}
                    onChange={(e) => set({ reimbursedOn: e.target.value })}
                    className={fieldClass}
                  />
                </Field>
              ) : null}
              <Field label="Description" className="col-span-2">
                <input
                  value={draft.description}
                  onChange={(e) => set({ description: e.target.value })}
                  className={fieldClass}
                  autoComplete="off"
                />
              </Field>
              <Field label="Notes" className="col-span-2">
                <Textarea
                  value={draft.notes}
                  rows={2}
                  onChange={(e) => set({ notes: e.target.value })}
                  className="min-h-0 text-base sm:text-[13px]"
                />
              </Field>
              <Field label="Duplicate group (optional)" className="col-span-2 sm:col-span-1">
                <input
                  value={draft.dupeGroup}
                  onChange={(e) => set({ dupeGroup: e.target.value })}
                  className={fieldClass}
                  autoComplete="off"
                />
              </Field>
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 space-y-1.5 border-t px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
        {error ? (
          <p role="alert" className="text-xs text-[var(--m-down)]">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {sure ? (
            <>
              <span className="text-muted-foreground text-xs">
                Delete this receipt and its pictures?
              </span>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="h-8"
                disabled={busy !== null}
                onClick={() => void remove()}
              >
                {busy === "delete" ? <Icons.Spinner className="size-3.5 animate-spin" /> : null}
                Delete
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={() => setSure(false)}
              >
                Keep
              </Button>
            </>
          ) : (
            <button
              type="button"
              className="text-muted-foreground hover:text-destructive text-xs"
              onClick={() => setSure(true)}
            >
              Delete receipt
            </button>
          )}
          <span className="flex-1" />
          {r.status === "review" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={busy !== null}
              onClick={() => void save({ status: "unreimbursed" }, "Marked as good")}
            >
              Looks good
            </Button>
          ) : null}
          {canMark ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={busy !== null}
              onClick={() => void save(reimbursedPatch(todayIso()), "Marked reimbursed")}
            >
              Mark reimbursed
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={busy !== null || !dirty}
            onClick={() => void save()}
          >
            {busy === "save" ? <Icons.Spinner className="size-3.5 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </div>
    </>
  );
}

/** The opened receipt. `receipt` is read fresh from the list, so a change shows at once. */
export function HsaDetail({
  receipt,
  settings,
  types,
  onClose,
}: {
  receipt: HsaReceipt | null;
  settings: HsaSettings;
  types: string[];
  onClose: () => void;
}) {
  const wide = !!receipt && receipt.photos > 0;
  return (
    <Dialog open={!!receipt} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        mobileClassName="h-[90dvh]"
        onOpenAutoFocus={(e) => e.preventDefault()}
        className={cn(
          "flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[40rem]",
          wide && "lg:max-w-[58rem]",
        )}
      >
        {receipt ? (
          <HsaDetailBody
            key={receipt.id}
            receipt={receipt}
            settings={settings}
            types={types}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
