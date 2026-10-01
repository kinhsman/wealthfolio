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
import { accountLogoUrl } from "@/lib/account-logo";
import type { Account } from "@/lib/types";
import { Switch } from "@wealthfolio/ui/components/ui/switch";

import { searchCashActivities } from "../adapters/cash-activities";

import { matchLength, merchantsApi, useMerchantFor, useSetMerchants, wordsOf, type MerchantDraft } from "../lib/merchants";
import { KeywordChips, withTyped } from "./keyword-chips";
import { bankWordsFor, useBankLines } from "../lib/bank-lines";
import { useNotes } from "../lib/notes";
import { rulePatternFrom } from "../lib/rule-offer";
import { MerchantLogo } from "./merchant-logo";

const MAX_BYTES = 5 * 1024 * 1024;

/** Under a transaction's text in its edit form: its merchant with Change, or Add a logo. */
export function MerchantShortcut({
  notes,
  account,
  activityType,
  activityId,
}: {
  notes?: string | null;
  account?: Account | null;
  activityType?: string | null;
  activityId?: string;
}) {
  const { data: bankLines } = useBankLines();
  const { data: notesById } = useNotes();
  const merchant = useMerchantFor(notes, account, activityType, activityId ? bankWordsFor(bankLines, activityId, notesById) : null);
  const [draft, setDraft] = useState<MerchantDraft | null>(null);
  const words = rulePatternFrom(notes);
  if (!merchant && !words) return null;
  return (
    <>
      {merchant ? (
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <MerchantLogo url={merchant.logoUrl} name={merchant.name} whole={merchant.source === "bank"} />
          <span className="truncate">{merchant.name}</span>
          {merchant.source === "owly" ? (
            <span>· photo from Owly</span>
          ) : merchant.source === "bank" ? (
            <span className="truncate">· {merchant.pattern}, your bank&rsquo;s logo</span>
          ) : null}
          {merchant.source !== "owly" && (merchant.source !== "bank" || merchant.from) ? (
            <button
              type="button"
              className="text-foreground shrink-0 underline-offset-4 hover:underline"
              onClick={() => setDraft({ merchant: merchant.from ?? merchant })}
            >
              Change
            </button>
          ) : null}
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
  const [words, setWords] = useState<string[]>(editing ? wordsOf(editing) : draft.pattern ? [draft.pattern] : []);
  const [typing, setTyping] = useState("");
  const all = withTyped(words, typing);
  const [file, setFile] = useState<File | null>(null);
  // "Use the bank's logo" (owner, 09-30: "toggle use bank icon for transactions instead of using a
  // merchant"): no picture; each matching transaction shows the bank it is on.
  const [useBank, setUseBank] = useState(!!editing?.useBank);
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
    setUseBank(false);
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
  const key = all.join("\u0001");
  const [debounced, setDebounced] = useState(key);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(key), 400);
    return () => clearTimeout(t);
  }, [key]);
  // One search per word, joined; then the same whole-word test the logos use (a short word must
  // not count a transaction it would not light up).
  const { data: bankLines } = useBankLines();
  const { data: notesById } = useNotes();
  const matches = useQuery({
    queryKey: ["money-hub", "merchant-matches", debounced, !!bankLines, !!notesById],
    queryFn: async () => {
      const ws = debounced.split("\u0001").filter(Boolean);
      const pages = await Promise.all(
        ws.map((w) => searchCashActivities({ search: w, status: "all", sortBy: "date", sortDir: "desc", offset: 0, limit: 200 })),
      );
      // money-hub patch: the payee or what the bank wrote, as the logos match (lib/bank-lines.ts).
      const byId = new Map(
        pages
          .flatMap((p) => p.items)
          .filter((x) => matchLength(x.notes, ws) > 0 || matchLength(bankWordsFor(bankLines, x.id, notesById), ws) > 0)
          .map((x) => [x.id, x]),
      );
      const items = [...byId.values()].sort((a, b) => (a.activityDate < b.activityDate ? 1 : -1));
      return { items, more: pages.some((p) => p.totalCount > p.items.length) };
    },
    enabled: debounced.length > 0,
  });
  const [showMatches, setShowMatches] = useState(false);
  const { accounts } = useAccounts({ filterActive: false });
  const accountName = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a.name])), [accounts]);
  const bankLogo = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, accountLogoUrl(a)])), [accounts]);
  const matchCount = matches.data?.items.length ?? 0;
  const countText = `${matchCount}${matches.data?.more ? "+" : ""}`;
  const settled = all.length > 0 && debounced === key && !matches.isFetching;
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  const ready = name.trim().length > 0 && all.length > 0 && (useBank || !!file || !!editing?.logoUrl);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const fields = { name: name.trim(), patterns: all, useBank };
      const list = editing
        ? await merchantsApi.update(editing.id, { ...fields, logo: file })
        : await merchantsApi.create({ ...fields, logo: file });
      setMerchants(list);
      toast.success(
        editing
          ? `${fields.name} saved.`
          : useBank
            ? `${fields.name} added. Matching transactions show their bank's logo.`
            : `${fields.name} added. Its logo shows on matching transactions.`,
      );
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

        <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
          <div className="min-w-0">
            <Label htmlFor="merchant-use-bank">Use the bank&rsquo;s logo</Label>
            <p className="text-muted-foreground text-xs">
              No picture needed: each transaction shows the logo of the bank it is on, like Chase or Citi. Good for fees, ATM cash and card perks.
            </p>
          </div>
          <Switch id="merchant-use-bank" checked={useBank} onCheckedChange={setUseBank} disabled={busy} />
        </div>

        {useBank ? null : (
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
              {shown ? <img src={shown} alt="" className={chosen ? "h-full w-full object-contain p-2.5" : "h-full w-full object-cover"} /> : <Icons.Store className="text-muted-foreground h-6 w-6" />}
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
                Or paste a copied picture with Ctrl+V (Cmd+V on a Mac), or drop one on the circle. PNG, JPG or WebP, up to 5 MB. It is fitted inside the circle, never cut off.
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
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="merchant-name">Name</Label>
            <Input id="merchant-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Costco" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="merchant-words">Words to look for</Label>
            <KeywordChips id="merchant-words" words={words} onChange={setWords} typing={typing} onTyping={setTyping} placeholder="COSTCO" />
            <p className="text-muted-foreground text-xs">Any of these words shows the logo. Press Enter to add another.</p>
          </div>
        </div>

        <div className="rounded-lg border">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="text-muted-foreground flex items-center gap-2 text-xs">
              {matches.isFetching ? <Icons.Spinner className="h-3.5 w-3.5 animate-spin" /> : null}
              {all.length === 0
                ? "Type the words to look for."
                : !settled
                  ? "Looking for transactions with these words"
                  : matchCount === 0
                    ? "No transaction has these words yet. New ones will show the logo."
                    : `${countText} transaction${matchCount === 1 ? "" : "s"} will show ${useBank ? "their bank's logo" : "this logo"}, and new ones as they come in.`}
            </span>
            {settled && matchCount > 0 ? (
              <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 text-xs" onClick={() => setShowMatches((v) => !v)}>
                {showMatches ? "Hide" : `Preview ${countText} ${matchCount === 1 ? "match" : "matches"}`}
              </Button>
            ) : null}
          </div>
          {showMatches && settled && matchCount > 0 ? (
            <div className="max-h-56 divide-y overflow-y-auto border-t">
              {(matches.data?.items ?? []).slice(0, 50).map((x) => (
                <div key={x.id} className="flex items-center gap-3 px-3 py-2">
                  {useBank ? (
                    <MerchantLogo url={bankLogo.get(x.accountId) ?? null} name={name} whole className="h-6 w-6" />
                  ) : shown ? (
                    <img src={shown} alt="" className="bg-muted h-6 w-6 shrink-0 rounded-full border object-cover" />
                  ) : null}
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
              {matchCount > 50 ? (
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
