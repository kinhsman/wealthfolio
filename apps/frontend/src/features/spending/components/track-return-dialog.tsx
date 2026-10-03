// money-hub patch: the Returns window (lib/returns.ts). From a purchase's menu it starts a return:
// how much is coming back, the day it went back, how long the store takes. On one already tracked
// it also shows the refund: what came, what could be it (yes or no), a pick from the money in by
// hand, settling without the money, and stopping. Mounted once in App.tsx.
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui";

import { useAccounts } from "@/hooks/use-accounts";

import { useMerchantFor } from "../lib/merchants";
import {
  WITHIN_DAYS,
  offerHint,
  returnLine,
  returnsApi,
  currencyDigits,
  shortDay,
  trackReturnStore,
  useReturns,
  useSetReturns,
  type PurchaseOption,
  type RefundOffer,
  type RefundRow,
  type ReturnItem,
  type ReturnsView,
  type TrackReturnTarget,
} from "../lib/returns";
import { MerchantLogo } from "./merchant-logo";
import { StreamLogo } from "./stream-logo";

const caps = "text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.08em]";
const errorText = (e: unknown) => (e as Error)?.message ?? String(e);
/** Today on the owner's own clock, YYYY-MM-DD. */
const today = () => new Date().toLocaleDateString("en-CA");
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function TrackReturnHost() {
  const target = useSyncExternalStore(trackReturnStore.subscribe, trackReturnStore.get);
  if (!target) return null;
  return <TrackReturnDialog key={target.returnId ?? target.purchase?.id ?? "pick"} target={target} onClose={trackReturnStore.close} />;
}

/** A labelled setting: label above, a short note below. */
function Field({ label, htmlFor, foot, className, children }: { label: string; htmlFor?: string; foot?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={`min-w-0 space-y-1 ${className ?? ""}`}>
      <Label htmlFor={htmlFor} className="text-muted-foreground text-[11px] font-medium">
        {label}
      </Label>
      {children}
      {foot ? <div className="text-muted-foreground text-[11px] leading-snug">{foot}</div> : null}
    </div>
  );
}

/** A transaction's picture: the owner's merchant logo, else its first letter. */
function PayeeLogo({ notes, accountId, type, className = "h-9 w-9" }: { notes: string; accountId: string | null; type: string; className?: string }) {
  const { accounts } = useAccounts({ filterActive: false });
  const account = accounts?.find((a) => a.id === accountId);
  const merchant = useMerchantFor(notes, account, type);
  if (merchant) return <MerchantLogo url={merchant.logoUrl} name={merchant.name} whole={merchant.source === "bank"} className={className} />;
  return (
    <span aria-hidden className={`bg-muted text-muted-foreground flex shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${className}`}>
      {(notes.trim().charAt(0) || "?").toUpperCase()}
    </span>
  );
}

function TrackReturnDialog({ target, onClose }: { target: TrackReturnTarget; onClose: () => void }) {
  const { data } = useReturns();
  const item = target.returnId ? data?.items.find((x) => x.id === target.returnId) : undefined;
  const [picked, setPicked] = useState<PurchaseOption | null>(target.purchase ?? null);
  const [busy, setBusy] = useState(false);
  const currency = data?.currency || "USD";
  // The one being edited was removed (Stop tracking, or elsewhere): nothing left to show.
  useEffect(() => {
    if (target.returnId && data && !item) onClose();
  }, [target.returnId, data, item, onClose]);

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[520px]" onOpenAutoFocus={(e) => e.preventDefault()}>
        {item ? (
          <ReturnForm key={item.id} item={item} currency={currency} busy={busy} setBusy={setBusy} onClose={onClose} />
        ) : target.returnId ? null : picked ? (
          <ReturnForm key={picked.id} purchase={picked} currency={currency} busy={busy} setBusy={setBusy} onClose={onClose} onBack={target.purchase ? undefined : () => setPicked(null)} />
        ) : (
          <PickPurchase currency={currency} onPick={setPicked} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The page's Track a return: which purchase went back. */
function PickPurchase({ currency, onPick, onClose }: { currency: string; onPick: (p: PurchaseOption) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const found = useQuery({ queryKey: ["money-hub", "returns", "purchases", q], queryFn: () => returnsApi.purchases(q), retry: false, staleTime: 30 * 1000 });
  const { accounts } = useAccounts({ filterActive: false });
  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]));

  return (
    <>
      <DialogHeader className="text-left">
        <DialogTitle>Track a return</DialogTitle>
        <DialogDescription>Which purchase did you send back? The last four months are listed.</DialogDescription>
      </DialogHeader>
      <div className="relative">
        <Icons.Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden="true" />
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Store or words on the charge" className="pl-9" autoComplete="off" autoFocus aria-label="Find the purchase" />
      </div>
      <div className="max-h-[46dvh] min-h-[160px] divide-y overflow-y-auto rounded-lg border">
        {found.isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 px-3 py-6 text-sm">
            <Icons.Spinner className="h-4 w-4 animate-spin" />
            Looking through your purchases
          </div>
        ) : found.isError ? (
          <div className="text-destructive px-3 py-6 text-sm">{errorText(found.error)}</div>
        ) : !found.data?.length ? (
          <div className="text-muted-foreground px-3 py-6 text-sm">{q ? `No purchase with "${q}" in the last four months.` : "No purchases in the last four months."}</div>
        ) : (
          found.data.map((p) => (
            <button key={p.id} type="button" onClick={() => onPick(p)} className="hover:bg-muted/40 flex w-full items-center gap-3 px-3 py-2 text-left transition-colors">
              <PayeeLogo notes={p.notes} accountId={p.accountId} type="WITHDRAWAL" className="h-8 w-8" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{p.notes || "No description"}</span>
                <span className="text-muted-foreground block truncate text-xs">{[shortDay(p.date), accountName.get(p.accountId)].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="shrink-0 text-sm tabular-nums">
                <PrivacyAmount value={p.amount} currency={p.currency ?? currency} />
              </span>
            </button>
          ))
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </DialogFooter>
    </>
  );
}

function ReturnForm({
  item,
  purchase,
  currency: base,
  busy,
  setBusy,
  onClose,
  onBack,
}: {
  /** One already tracked (edit), or */
  item?: ReturnItem;
  /** the purchase a new one starts from. */
  purchase?: PurchaseOption;
  currency: string;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onClose: () => void;
  onBack?: () => void;
}) {
  const set = useSetReturns();
  const bought = item ? { ...item.purchase, accountId: item.accountId } : purchase!;
  // What it was paid in (dong from ACB or MB): its amounts, and the refund, are in that, with its decimals.
  const currency = (item ? item.currency : purchase?.currency) ?? base;
  const digits = currencyDigits(currency);
  const { accounts } = useAccounts({ filterActive: false });
  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]));
  const [expected, setExpected] = useState((item?.expected ?? bought.amount).toFixed(digits));
  const [returnedOn, setReturnedOn] = useState(item?.returnedOn ?? (today() < bought.date ? bought.date : today()));
  const [within, setWithin] = useState(String(item?.within ?? 14));
  const [note, setNote] = useState(item?.note ?? "");
  const [confirmStop, setConfirmStop] = useState(false);
  const [picking, setPicking] = useState(false);

  const amount = Number(expected);
  const amountError = !(amount > 0) ? "How much is coming back?" : Math.round(amount * 100) > Math.round(bought.amount * 100) ? "That is more than you paid." : null;
  const dateError = !returnedOn ? "Which day did it go back?" : returnedOn < bought.date ? "That is before you bought it." : null;
  const valid = !amountError && !dateError;
  const dirty = !item || amount !== item.expected || returnedOn !== item.returnedOn || Number(within) !== item.within || note.trim() !== item.note;
  const dueOn = returnedOn && !dateError ? addDays(returnedOn, Number(within)) : null;
  const withinOptions = [...new Set([...WITHIN_DAYS, Number(within)])].sort((a, b) => a - b);

  /** One change at a time; the view the helper returns replaces what is shown. */
  const act = async (fn: () => Promise<ReturnsView>, done?: string | ((v: ReturnsView) => string), then?: () => void) => {
    setBusy(true);
    try {
      const view = await fn();
      set(view);
      if (done) toast.success(typeof done === "function" ? done(view) : done);
      then?.();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const terms = { expected: amount, returnedOn, within: Number(within), note: note.trim() };
  const save = () =>
    item
      ? act(() => returnsApi.update(item.id, terms), "Saved.", onClose)
      : act(
          () => returnsApi.create(purchase!, terms),
          (view) => {
            const made = view.items.find((x) => x.purchaseId === purchase!.id);
            if (made?.status === "back") return "Already back: the refund was found in your transactions.";
            if (made?.suggestions.length) return "Tracking it. Some money in could be it: say yes or no on Returns.";
            return "Tracking it. You are told when the refund lands.";
          },
          onClose,
        );

  return (
    <>
      <DialogHeader className="text-left">
        <DialogTitle>{item ? "Return" : "Track a return"}</DialogTitle>
        <DialogDescription>
          {item ? returnLine(item) : "You sent it back. The money app watches for the refund and tells you when it lands, or when it is late."}
        </DialogDescription>
      </DialogHeader>

      <div className="bg-muted/40 flex items-center gap-3 rounded-lg border px-3 py-2.5">
        {item ? <StreamLogo s={item} className="h-9 w-9 text-sm" /> : <PayeeLogo notes={bought.notes} accountId={bought.accountId} type="WITHDRAWAL" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{item?.name || bought.notes || "This purchase"}</div>
          <div className="text-muted-foreground truncate text-xs">
            {["Bought " + shortDay(bought.date), bought.accountId ? accountName.get(bought.accountId) : null].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="shrink-0 text-sm font-medium tabular-nums">
          <PrivacyAmount value={bought.amount} currency={currency} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Coming back"
          htmlFor="return-amount"
          foot={amountError ? <span className="text-destructive">{amountError}</span> : "Lower it when only part goes back."}
        >
          <Input id="return-amount" type="number" inputMode={digits ? "decimal" : "numeric"} step={digits ? "0.01" : "1"} min="0" value={expected} onChange={(e) => setExpected(e.target.value)} />
        </Field>
        <Field label="Sent back on" htmlFor="return-date" foot={dateError ? <span className="text-destructive">{dateError}</span> : "The day you dropped it off or handed it in."}>
          <Input id="return-date" type="date" value={returnedOn} min={bought.date} onChange={(e) => setReturnedOn(e.target.value)} />
        </Field>
        <Field label="The refund usually takes" foot={dueOn ? `Expected by ${shortDay(dueOn)}. You are told if it is late.` : undefined}>
          <Select value={within} onValueChange={setWithin}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {withinOptions.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  Up to {n} days
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Note" htmlFor="return-note" foot="A tracking number, or where it went.">
          <Input id="return-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} autoComplete="off" />
        </Field>
      </div>

      {item ? (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className={caps}>The refund</span>
            <span className="text-muted-foreground text-xs tabular-nums">
              <PrivacyAmount value={item.received} currency={currency} /> of <PrivacyAmount value={item.expected} currency={currency} /> back
            </span>
          </div>
          {item.refunds.map((f) => (
            <MoneyInRow key={f.id} row={f} currency={currency} account={f.accountId ? accountName.get(f.accountId) : undefined} hint={f.auto ? "Found on its own" : "Picked by you"}>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground h-7 text-xs"
                disabled={busy}
                onClick={() => act(() => returnsApi.unlinkRefund(item.id, f.id), "Taken off. It will not be matched to this return again.")}
              >
                Take off
              </Button>
            </MoneyInRow>
          ))}
          {item.suggestions.map((c) => (
            <MoneyInRow key={c.id} row={c} currency={currency} account={c.accountId ? accountName.get(c.accountId) : undefined} hint={offerHint(c)} look>
              <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={() => act(() => returnsApi.linkRefund(item.id, c), "That refund is on this return now.")}>
                This is it
              </Button>
              <Button variant="ghost" size="sm" className="text-muted-foreground h-7 text-xs" disabled={busy} onClick={() => act(() => returnsApi.notIt(item.id, c.id))}>
                Not it
              </Button>
            </MoneyInRow>
          ))}
          {!item.refunds.length && !item.suggestions.length ? (
            <p className="text-muted-foreground text-xs">
              {item.closedAt ? "Settled without the money." : "Nothing yet. It checks every hour, after each bank sync."}
            </p>
          ) : null}
          {picking ? <PickRefund item={item} currency={currency} busy={busy} accountName={accountName} onPick={(c) => act(() => returnsApi.linkRefund(item.id, c), "That refund is on this return now.", () => setPicking(false))} /> : null}
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs">
            {!item.closedAt || item.status === "settled" ? (
              <button type="button" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline" disabled={busy} onClick={() => setPicking((v) => !v)}>
                {picking ? "Hide the money in" : "Pick the refund myself"}
              </button>
            ) : null}
            {item.closedAt ? (
              item.status === "settled" ? (
                <button type="button" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline" disabled={busy} onClick={() => act(() => returnsApi.setClosed(item.id, false), "Open again.")}>
                  Open it again
                </button>
              ) : null
            ) : (
              <button
                type="button"
                title="Store credit, an exchange, or it was never refunded"
                className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                disabled={busy}
                onClick={() => act(() => returnsApi.setClosed(item.id, true), "Settled. It is off the waiting list.", onClose)}
              >
                Settled without the money
              </button>
            )}
          </div>
        </div>
      ) : null}

      <DialogFooter className="gap-2 sm:justify-between">
        <div>
          {item ? (
            confirmStop ? (
              <Button type="button" variant="destructive" disabled={busy} onClick={() => act(() => returnsApi.remove(item.id), "Stopped tracking. Your transactions are untouched.", onClose)}>
                Yes, stop tracking
              </Button>
            ) : (
              <Button type="button" variant="ghost" className="text-muted-foreground" disabled={busy} onClick={() => setConfirmStop(true)}>
                Stop tracking
              </Button>
            )
          ) : onBack ? (
            <Button type="button" variant="ghost" className="text-muted-foreground" disabled={busy} onClick={onBack}>
              Another purchase
            </Button>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            {item && !dirty ? "Close" : "Cancel"}
          </Button>
          <Button type="button" disabled={busy || !valid || !dirty} onClick={save}>
            {busy ? <Icons.Spinner className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {item ? "Save" : "Track it"}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

/** One line of money in: the date, its words, the amount, and what can be done with it. */
export function MoneyInRow({ row, currency, account, hint, look, children }: { row: RefundRow; currency: string; account?: string; hint?: string; look?: boolean; children?: ReactNode }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md px-2.5 py-2 ${look ? "bg-amber-500/10" : "bg-muted/40"}`}>
      <div className="min-w-0 flex-1 basis-40">
        <div className="truncate text-sm">{row.notes || "Money in"}</div>
        <div className="text-muted-foreground text-xs leading-snug">{[shortDay(row.date), account, hint].filter(Boolean).join(" · ")}</div>
      </div>
      <span className="shrink-0 text-sm tabular-nums" style={{ color: "#16a34a" }}>
        +<PrivacyAmount value={row.amount} currency={row.currency ?? currency} />
      </span>
      {children ? <div className="flex shrink-0 items-center gap-1.5">{children}</div> : null}
    </div>
  );
}

/** The money in since the purchase, the likeliest first, to pick the refund by hand. */
function PickRefund({ item, currency, busy, accountName, onPick }: { item: ReturnItem; currency: string; busy: boolean; accountName: Map<string, string>; onPick: (c: RefundOffer) => void }) {
  const found = useQuery({ queryKey: ["money-hub", "returns", "candidates", item.id, item.refunds.length], queryFn: () => returnsApi.candidates(item.id), retry: false, staleTime: 0 });
  if (found.isLoading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-3 text-xs">
        <Icons.Spinner className="h-3.5 w-3.5 animate-spin" />
        Reading the money in since {shortDay(item.purchase.date)}
      </div>
    );
  }
  if (found.isError) return <p className="text-destructive text-xs">{errorText(found.error)}</p>;
  if (!found.data?.length) return <p className="text-muted-foreground text-xs">No money in since {shortDay(item.purchase.date)} that is not on a return already.</p>;
  return (
    <div className="max-h-[32dvh] space-y-1.5 overflow-y-auto">
      {found.data.map((c) => (
        <MoneyInRow key={c.id} row={c} currency={currency} account={c.accountId ? accountName.get(c.accountId) : undefined} hint={c.store || c.exact ? offerHint(c) : undefined}>
          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => onPick(c)}>
            This is it
          </Button>
        </MoneyInRow>
      ))}
    </div>
  );
}
