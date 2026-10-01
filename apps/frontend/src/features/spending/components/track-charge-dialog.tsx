// money-hub patch: the "which one is it?" window (lib/track-charge.ts). A charge just filed as a
// subscription or a bill is linked to one on Subscriptions & bills (the one it is in, or looks like,
// picked already), or starts a new one drafted from it. Mounted once in App.tsx.
import { useMemo, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  AnimatedToggleGroup,
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
import { cn } from "@/lib/utils";

import { useMerchantFor } from "../lib/merchants";
import { rulePatternFrom } from "../lib/rule-offer";
import {
  EVERY_LABELS,
  SUBSCRIPTIONS_KEY,
  shortDate,
  subscriptionsApi,
  useSubscriptions,
  type Every,
  type Stream,
  type StreamGroup,
  type WhichOne,
} from "../lib/subscriptions";
import { useCategoryGroups } from "../lib/category-groups";
import { trackChargeStore, type TrackCharge } from "../lib/track-charge";
import { MerchantLogo } from "./merchant-logo";
import { StreamLogo } from "./stream-logo";

const GROUP_LABEL: Record<StreamGroup, string> = { subscriptions: "Subscriptions", bills: "Bills" };
const caps = "text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.08em]";
const errorText = (e: unknown) => (e as Error)?.message ?? String(e);

export function TrackChargeHost() {
  useCategoryGroups(); // keeps each category's Subscriptions & bills choice at hand (lib/category-groups.ts)
  const charge = useSyncExternalStore(trackChargeStore.subscribe, trackChargeStore.get);
  if (!charge) return null;
  return <TrackChargeDialog key={charge.id} charge={charge} onClose={trackChargeStore.close} />;
}

function TrackChargeDialog({ charge, onClose }: { charge: TrackCharge; onClose: () => void }) {
  const list = useSubscriptions();
  const which = useQuery({
    queryKey: ["money-hub", "subscriptions", "which", charge.id, charge.notes, charge.amount, charge.date],
    queryFn: () => subscriptionsApi.which({ id: charge.id, notes: charge.notes, amount: charge.amount, date: charge.date }),
    retry: false,
    staleTime: 0,
  });
  const { accounts } = useAccounts({ filterActive: false });
  const account = accounts?.find((a) => a.id === charge.accountId);
  const merchant = useMerchantFor(charge.notes, account, charge.activityType);
  const currency = list.data?.currency || "USD";
  const [busy, setBusy] = useState(false);
  const settled = !which.isLoading && !list.isLoading;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[480px]" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader className="text-left">
          <DialogTitle>{charge.group === "bills" ? "Which bill is this?" : "Which subscription is this?"}</DialogTitle>
          <DialogDescription>Link it to one you track, or start a new one, so it counts with its other charges.</DialogDescription>
        </DialogHeader>

        <div className="bg-muted/40 flex items-center gap-3 rounded-lg border px-3 py-2.5">
          {merchant ? (
            <MerchantLogo url={merchant.logoUrl} name={merchant.name} whole={merchant.source === "bank"} className="h-9 w-9" />
          ) : (
            <span aria-hidden className="bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold">
              {(charge.notes.trim().charAt(0) || "?").toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{merchant?.name || charge.notes || "This charge"}</div>
            <div className="text-muted-foreground truncate text-xs">
              {[shortDate(charge.date), account?.name, `Filed as ${charge.categoryName}`].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className="shrink-0 text-sm font-medium tabular-nums">
            <PrivacyAmount value={charge.amount} currency={currency} />
          </div>
        </div>

        {settled ? (
          <Choose
            charge={charge}
            items={(list.data?.items ?? []).filter((s) => !s.escrow)}
            listError={list.isError ? errorText(list.error) : null}
            w={which.data ?? null}
            currency={currency}
            busy={busy}
            setBusy={setBusy}
            onClose={onClose}
          />
        ) : (
          <>
            <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
              <Icons.Spinner className="h-4 w-4 animate-spin" />
              Looking for it in your list
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                Not now
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Choose({
  charge,
  items,
  listError,
  w,
  currency,
  busy,
  setBusy,
  onClose,
}: {
  charge: TrackCharge;
  items: Stream[];
  listError: string | null;
  w: WhichOne | null;
  currency: string;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const member = w?.member && items.some((s) => s.key === w.member) ? w.member : null;
  const likely = w?.likely && w.likely !== member && items.some((s) => s.key === w.likely) ? w.likely : null;
  // Opens on the one it is in or looks like; with neither, on a new one drafted from the charge.
  const [tab, setTab] = useState<"link" | "new">(member || likely || (items.length > 0 && !w) ? "link" : "new");
  const [picked, setPicked] = useState<string | null>(member ?? likely);
  const [q, setQ] = useState("");

  const draft = w?.draft;
  const [name, setName] = useState(draft?.name ?? charge.notes.slice(0, 60));
  const [words, setWords] = useState((draft?.words.length ? draft.words : [rulePatternFrom(charge.notes) ?? charge.notes.slice(0, 40)]).join(", "));
  const [amount, setAmount] = useState(String(draft?.amount || charge.amount || ""));
  const [every, setEvery] = useState<Every>(draft?.every ?? "month");
  const [nextDate, setNextDate] = useState(draft?.nextDate ?? "");
  const [group, setGroup] = useState<StreamGroup>(charge.group);

  // The one it is in and the one it looks like on top; then the charge's own group, then the other.
  const sections = useMemo(() => {
    const byName = (a: Stream, b: Stream) =>
      Number(a.status === "stopped") - Number(b.status === "stopped") || a.name.localeCompare(b.name);
    const needle = q.trim().toLowerCase();
    if (needle) return [{ title: null, rows: items.filter((s) => s.name.toLowerCase().includes(needle)).sort(byName) }];
    const top = [member, likely].map((k) => items.find((s) => s.key === k)).filter((s): s is Stream => !!s);
    const rest = items.filter((s) => !top.includes(s));
    const order: StreamGroup[] = charge.group === "bills" ? ["bills", "subscriptions"] : ["subscriptions", "bills"];
    return [
      { title: null, rows: top },
      ...order.map((g) => ({ title: GROUP_LABEL[g], rows: rest.filter((s) => s.group === g).sort(byName) })),
    ].filter((x) => x.rows.length > 0);
  }, [items, member, likely, q, charge.group]);

  const chosen = items.find((s) => s.key === picked) ?? null;
  const wordList = (words || name).split(",").map((x) => x.trim()).filter(Boolean);
  const ready = tab === "link" ? !!chosen : name.trim().length > 0 && Number(amount) > 0 && wordList.length > 0;

  const submit = async () => {
    if (tab === "link" && member && chosen?.key === member) return onClose();
    setBusy(true);
    try {
      if (tab === "link" && chosen) {
        qc.setQueryData(SUBSCRIPTIONS_KEY, await subscriptionsApi.link(charge.id, chosen.key));
        toast.success(`Linked to ${chosen.name}.`);
      } else {
        qc.setQueryData(
          SUBSCRIPTIONS_KEY,
          await subscriptionsApi.addManual({
            name: name.trim(),
            words: wordList,
            amount: Number(amount),
            every,
            nextDate: nextDate || null,
            group,
            linkIds: [charge.id],
          }),
        );
        toast.success(`${name.trim()} added to ${GROUP_LABEL[group]}.`);
      }
      setBusy(false);
      onClose();
    } catch (e) {
      toast.error(`Not saved: ${errorText(e)}`);
      setBusy(false);
    }
  };

  const row = (s: Stream) => {
    const on = s.key === picked;
    const tag = s.key === member ? "In it now" : s.key === likely ? "Looks like it" : null;
    return (
      <button
        key={s.key}
        type="button"
        role="radio"
        aria-checked={on}
        onClick={() => setPicked(s.key)}
        className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors", on ? "bg-primary/5" : "hover:bg-muted/40")}
      >
        <StreamLogo s={s} className="h-8 w-8 text-xs" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{s.name}</span>
          <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
            {tag ? <span className="bg-primary/10 text-primary shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium">{tag}</span> : null}
            <span className="truncate">
              {EVERY_LABELS[s.every]} · {s.status === "stopped" ? "Stopped" : `next ${shortDate(s.next)}`}
            </span>
          </span>
        </span>
        {/* A shared bill: the whole bank charge, the amount the charge above is compared with. */}
        <span className="shrink-0 text-sm tabular-nums">
          {s.variable ? <span className="text-muted-foreground">about </span> : null}
          <PrivacyAmount value={s.sharedOn && s.billUsual ? s.billUsual : s.usual} currency={currency} />
        </span>
        <span
          aria-hidden
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
            on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
          )}
        >
          {on ? <Icons.Check className="h-3 w-3" /> : null}
        </span>
      </button>
    );
  };

  const doneLabel =
    tab === "new" ? `Add ${name.trim() || "it"}` : !chosen ? "Pick one" : chosen.key === member ? "Done" : `Link to ${chosen.name}`;

  return (
    <>
      <AnimatedToggleGroup<"link" | "new">
        aria-label="Link or start a new one"
        rounded="lg"
        size="sm"
        className="w-fit"
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "link", label: "Link to one" },
          { value: "new", label: "Start a new one" },
        ]}
      />

      {tab === "link" ? (
        <div className="space-y-2">
          {items.length > 6 ? (
            <div className="relative">
              <Icons.Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your list" className="pl-9" autoComplete="off" aria-label="Search your list" />
            </div>
          ) : null}
          {listError ? (
            <p className="text-destructive text-sm">Your list could not load: {listError}</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border px-3 py-4 text-sm">Nothing tracked yet. Start a new one with this charge.</p>
          ) : (
            <div role="radiogroup" aria-label="Your subscriptions and bills" className="max-h-[min(42dvh,340px)] overflow-y-auto rounded-lg border">
              {sections.length === 0 ? <p className="text-muted-foreground px-3 py-4 text-sm">None by that name.</p> : null}
              {sections.map((sec, i) => (
                <div key={sec.title ?? `top-${i}`} className={cn(i > 0 && "border-t")}>
                  {sec.title ? <div className={cn(caps, "bg-muted/30 px-3 py-1.5")}>{sec.title}</div> : null}
                  <div className="divide-y">{sec.rows.map(row)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="track-name">Name</Label>
            <Input id="track-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="track-words">Words to look for</Label>
            <Input id="track-words" value={words} onChange={(e) => setWords(e.target.value)} autoComplete="off" />
            <p className="text-muted-foreground text-xs">This charge is its first. Later charges with these words join it. Separate several with commas.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="track-amount">Amount</Label>
              <Input id="track-amount" type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>How often</Label>
              <Select value={every} onValueChange={(v) => setEvery(v as Every)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(EVERY_LABELS) as Every[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {EVERY_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="track-next">Next charge</Label>
              <Input id="track-next" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Group</Label>
              <Select value={group} onValueChange={(v) => setGroup(v as StreamGroup)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="subscriptions">Subscriptions</SelectItem>
                  <SelectItem value="bills">Bills</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      <DialogFooter className="gap-2 sm:justify-between">
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          Not now
        </Button>
        <Button type="button" onClick={submit} disabled={!ready || busy} className="min-w-0">
          {busy ? <Icons.Spinner className="mr-2 h-4 w-4 shrink-0 animate-spin" /> : null}
          <span className="max-w-[260px] truncate">{doneLabel}</span>
        </Button>
      </DialogFooter>
    </>
  );
}
