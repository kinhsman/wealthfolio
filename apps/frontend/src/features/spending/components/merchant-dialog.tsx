// money-hub patch: add or change a merchant (lib/merchants.ts): logo, name, words to look for.
// The service shrinks the logo to 128 by 128 on save. Opened from Settings, Spending, Merchants and
// from a transaction's edit form, rendered inside whatever opened it (a window opened beside the
// form's own would fight it for focus and close it).
import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icons,
  Input,
  Label,
  PrivacyAmount,
} from "@wealthfolio/ui";

import { useAccounts } from "@/hooks/use-accounts";

import { searchCashActivities } from "../adapters/cash-activities";

import { merchantsApi, useMerchantFor, useSetMerchants, type MerchantDraft } from "../lib/merchants";
import { rulePatternFrom } from "../lib/rule-offer";
import { MerchantLogo } from "./merchant-logo";

const MAX_BYTES = 5 * 1024 * 1024;

/** Under a transaction's text in its edit form: its merchant with Change, or Add a logo. */
export function MerchantShortcut({ notes }: { notes?: string | null }) {
  const merchant = useMerchantFor(notes);
  const [draft, setDraft] = useState<MerchantDraft | null>(null);
  const words = rulePatternFrom(notes);
  if (!merchant && !words) return null;
  return (
    <>
      {merchant ? (
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <MerchantLogo url={merchant.logoUrl} name={merchant.name} />
          <span className="truncate">{merchant.name}</span>
          {merchant.source === "owly" ? (
            <span>· photo from Owly</span>
          ) : (
            <button type="button" className="text-foreground underline-offset-4 hover:underline" onClick={() => setDraft({ merchant })}>
              Change
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs"
          onClick={() => setDraft({ name: words!, pattern: words! })}
        >
          <Icons.Store className="h-3.5 w-3.5" />
          Add a logo for &ldquo;{words}&rdquo;
        </button>
      )}
      {draft ? <MerchantDialog draft={draft} onClose={() => setDraft(null)} /> : null}
    </>
  );
}

export function MerchantDialog({ draft, onClose }: { draft: MerchantDraft; onClose: () => void }) {
  const setMerchants = useSetMerchants();
  const editing = draft.merchant;
  const [name, setName] = useState(editing?.name ?? draft.name ?? "");
  const [pattern, setPattern] = useState(editing?.pattern ?? draft.pattern ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const chosen = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (chosen) URL.revokeObjectURL(chosen);
  }, [chosen]);
  const shown = chosen ?? editing?.logoUrl ?? null;

  const pick = (f: File | null | undefined) => {
    setErr(null);
    if (!f) return;
    if (!f.type.startsWith("image/")) return setErr("That file is not a picture. Use a PNG, JPG or WebP.");
    if (f.size > MAX_BYTES) return setErr("That picture is over 5 MB. Choose a smaller one.");
    setFile(f);
  };

  // A copied picture can be pasted anywhere in the window (owner, 09-30: "enable pasting for image
  // upload"); pasted text still goes into the fields as usual.
  const imageFrom = (data: DataTransfer | null): File | null => {
    const file =
      Array.from(data?.files ?? []).find((f) => f.type.startsWith("image/")) ??
      Array.from(data?.items ?? []).find((i) => i.kind === "file" && i.type.startsWith("image/"))?.getAsFile() ??
      null;
    return file ? new File([file], file.name || `pasted.${file.type.split("/")[1] || "png"}`, { type: file.type }) : null;
  };
  const onPaste = (e: ClipboardEvent) => {
    const f = imageFrom(e.clipboardData);
    if (!f) return;
    e.preventDefault();
    pick(f);
  };
  const canReadClipboard = typeof navigator !== "undefined" && !!navigator.clipboard?.read;
  const pasteButton = async () => {
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (!type) continue;
        const blob = await item.getType(type);
        return pick(new File([blob], `pasted.${type.split("/")[1] || "png"}`, { type }));
      }
      setErr("There is no picture on the clipboard. Copy a logo first.");
    } catch {
      setErr("The browser did not let the app read the clipboard. Press Ctrl+V (Cmd+V on a Mac) instead.");
    }
  };
  const [dragging, setDragging] = useState(false);

  // No scan and no update step: transactions are matched each time they show. The preview only
  // shows what the words catch now (owner, 09-30: "how do we scan and preview and update?").
  const [debounced, setDebounced] = useState(pattern.trim());
  useEffect(() => {
    const t = setTimeout(() => setDebounced(pattern.trim()), 400);
    return () => clearTimeout(t);
  }, [pattern]);
  const matches = useQuery({
    queryKey: ["money-hub", "merchant-matches", debounced],
    queryFn: () => searchCashActivities({ search: debounced, status: "all", sortBy: "date", sortDir: "desc", offset: 0, limit: 50 }),
    enabled: debounced.length >= 2,
  });
  const [showMatches, setShowMatches] = useState(false);
  const { accounts } = useAccounts({ filterActive: false });
  const accountName = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a.name])), [accounts]);
  const matchCount = matches.data?.totalCount ?? 0;
  const settled = debounced.length >= 2 && debounced === pattern.trim() && !matches.isFetching;
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  const ready = name.trim().length > 0 && pattern.trim().length >= 2 && (!!file || !!editing);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const fields = { name: name.trim(), pattern: pattern.trim() };
      const list = editing
        ? await merchantsApi.update(editing.id, { ...fields, logo: file })
        : await merchantsApi.create({ ...fields, logo: file! });
      setMerchants(list);
      toast.success(editing ? `${fields.name} saved.` : `${fields.name} added. Its logo shows on matching transactions.`);
      onClose();
    } catch (e) {
      setErr((e as Error)?.message ?? String(e));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      setMerchants(await merchantsApi.remove(editing.id));
      toast.success(`${editing.name} removed.`);
      onClose();
    } catch (e) {
      setErr((e as Error)?.message ?? String(e));
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[480px]" onPaste={onPaste}>
        <DialogHeader>
          <DialogTitle>{editing ? "Change merchant" : "Add a merchant"}</DialogTitle>
          <DialogDescription>Transactions whose text contains these words show this logo, the ones you have and new ones.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(imageFrom(e.dataTransfer));
            }}
            className={`bg-muted hover:bg-muted/70 flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border transition-colors ${dragging ? "ring-primary ring-2" : ""}`}
            aria-label="Choose a logo"
          >
            {shown ? <img src={shown} alt="" className="h-full w-full object-cover" /> : <Icons.Store className="text-muted-foreground h-6 w-6" />}
          </button>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} disabled={busy}>
                <Icons.Upload className="mr-1.5 h-3.5 w-3.5" />
                {shown ? "Choose another" : "Choose a logo"}
              </Button>
              {canReadClipboard ? (
                <Button type="button" variant="outline" size="sm" onClick={pasteButton} disabled={busy}>
                  <Icons.Copy className="mr-1.5 h-3.5 w-3.5" />
                  Paste
                </Button>
              ) : null}
            </div>
            <p className="text-muted-foreground text-xs">
              Or paste a copied picture with Ctrl+V (Cmd+V on a Mac), or drop one on the circle. PNG, JPG or WebP, up to 5 MB. It fills the circle; the edges may be cut off.
            </p>
          </div>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="merchant-name">Name</Label>
            <Input id="merchant-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Costco" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="merchant-words">Words to look for</Label>
            <Input id="merchant-words" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="COSTCO" autoComplete="off" />
          </div>
        </div>

        <div className="rounded-lg border">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="text-muted-foreground flex items-center gap-2 text-xs">
              {matches.isFetching ? <Icons.Spinner className="h-3.5 w-3.5 animate-spin" /> : null}
              {pattern.trim().length < 2
                ? "Type the words to look for."
                : !settled
                  ? "Looking for transactions with these words"
                  : matchCount === 0
                    ? "No transaction has these words yet. New ones will show the logo."
                    : `${matchCount} transaction${matchCount === 1 ? "" : "s"} will show this logo, and new ones as they come in.`}
            </span>
            {settled && matchCount > 0 ? (
              <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 text-xs" onClick={() => setShowMatches((v) => !v)}>
                {showMatches ? "Hide" : `Preview ${matchCount} ${matchCount === 1 ? "match" : "matches"}`}
              </Button>
            ) : null}
          </div>
          {showMatches && settled && matchCount > 0 ? (
            <div className="max-h-56 divide-y overflow-y-auto border-t">
              {(matches.data?.items ?? []).map((x) => (
                <div key={x.id} className="flex items-center gap-3 px-3 py-2">
                  {shown ? <img src={shown} alt="" className="bg-muted h-6 w-6 shrink-0 rounded-full border object-cover" /> : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{x.notes}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {[day(x.activityDate), accountName.get(x.accountId)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">
                    <PrivacyAmount value={Math.abs(Number(x.amount ?? 0))} currency={x.currency || "USD"} />
                  </span>
                </div>
              ))}
              {matchCount > (matches.data?.items.length ?? 0) ? (
                <p className="text-muted-foreground px-3 py-2 text-xs">The latest {matches.data?.items.length} shown.</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {err ? <p className="text-destructive text-sm">{err}</p> : null}

        <DialogFooter className="gap-2 sm:justify-between">
          {editing ? (
            confirmDelete ? (
              <Button type="button" variant="destructive" onClick={remove} disabled={busy}>
                Yes, remove it
              </Button>
            ) : (
              <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={busy}>
                Remove
              </Button>
            )
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={!ready || busy}>
              {busy ? <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editing ? "Save" : "Add merchant"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
