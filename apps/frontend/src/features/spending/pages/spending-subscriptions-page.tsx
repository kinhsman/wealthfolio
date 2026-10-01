// money-hub patch: Subscriptions & bills (lib/subscriptions.ts): every charge that repeats, in two
// groups, with its status and next due date; the owner ticks, hides, moves, adds by hand, sets a
// cancel reminder and picks which alerts go out.
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  Page,
  PageContent,
  PageHeader,
  PrivacyAmount,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui";
import { Switch } from "@wealthfolio/ui/components/ui/switch";

import { cn } from "@/lib/utils";

import { StreamLogo } from "../components/stream-logo";
import {
  ALERT_LABELS,
  EVERY_LABELS,
  dueLabel,
  statusLabel,
  subscriptionsApi,
  transactionsHref,
  useSetSubscriptions,
  useSubscriptions,
  type AlertKind,
  type Every,
  type ManualEntry,
  type ManualInput,
  type Stream,
  type StreamGroup,
  type SubscriptionsView,
} from "../lib/subscriptions";

const TONE = {
  fine: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  look: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  over: "bg-muted text-muted-foreground",
} as const;

const day = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const errorText = (e: unknown) => (e as Error)?.message ?? String(e);

export default function SpendingSubscriptionsPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useSubscriptions();
  const currency = data?.currency || "USD";
  const set = useSetSubscriptions();
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState<ManualEntry | "new" | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  /** One change at a time; the view the helper returns replaces what is shown. */
  const act = async (label: string, fn: () => Promise<SubscriptionsView>, done?: string) => {
    setBusy(label);
    try {
      set(await fn());
      if (done) toast.success(done);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const items = data?.items ?? [];
  const live = items.filter((s) => s.status !== "stopped");
  const groups: { group: StreamGroup; title: string; monthly: number; blurb: string }[] = [
    { group: "subscriptions", title: "Subscriptions", monthly: data?.totals.subscriptionsMonthly ?? 0, blurb: "Services you pay for again and again." },
    { group: "bills", title: "Bills", monthly: data?.totals.billsMonthly ?? 0, blurb: "Utilities, phone, insurance and the like." },
  ];
  const stopped = items.filter((s) => s.status === "stopped");

  const rowProps = { currency, busy, act, onEditManual: (m: ManualEntry) => setAdding(m) };

  return (
    <Page>
      <PageHeader
        heading="Subscriptions & bills"
        text="Charges that repeat: what they cost, and when the next one is due."
        onBack={() => {
          if (window.history.length > 1) navigate(-1);
          else navigate("/dashboard?tab=spending");
        }}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={busy !== null}
              onClick={() => act("rescan", subscriptionsApi.rescan, "Checked again.")}
            >
              {busy === "rescan" ? <Icons.Spinner className="h-3.5 w-3.5 animate-spin sm:mr-1.5" /> : <Icons.RotateCcw className="h-3.5 w-3.5 sm:mr-1.5" />}
              <span className="hidden sm:inline">Check again</span>
              <span className="sr-only sm:hidden">Check again</span>
            </Button>
            <Button size="sm" onClick={() => setAdding("new")}>
              <Icons.Plus className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Add one</span>
              <span className="sr-only sm:hidden">Add one</span>
            </Button>
          </div>
        }
      />
      <PageContent className="space-y-6">
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Looking for repeating charges.</p>
        ) : isError ? (
          <p className="text-destructive text-sm">{errorText(error)}</p>
        ) : !data ? null : (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              <Tile label="A month" value={<PrivacyAmount value={data.totals.monthly} currency={currency} />} />
              <Tile label="A year" value={<PrivacyAmount value={data.totals.yearly} currency={currency} />} />
              <Tile label="Repeating" value={<span>{live.length}</span>} sub={stopped.length ? `${stopped.length} stopped` : undefined} />
            </div>

            {items.length === 0 ? (
              <div className="border-border/40 bg-card/70 rounded-xl border p-6 text-center backdrop-blur-xl">
                <p className="text-sm">No repeating charges found yet.</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  One shows up once it has come back a few months in a row. A yearly one you already know about can be added by hand.
                </p>
              </div>
            ) : null}

            {groups.map((g) => {
              const rows = live.filter((s) => s.group === g.group);
              if (!rows.length) return null;
              return (
                <Section key={g.group} title={g.title} blurb={g.blurb} aside={<><PrivacyAmount value={g.monthly} currency={currency} /> a month</>}>
                  {rows.map((s) => (
                    <StreamRow key={s.key} s={s} {...rowProps} />
                  ))}
                </Section>
              );
            })}

            {stopped.length ? (
              <Section title="Stopped" blurb="No charge for two periods. Cancelled, or the card changed.">
                {stopped.map((s) => (
                  <StreamRow key={s.key} s={s} {...rowProps} />
                ))}
              </Section>
            ) : null}

            {data.hidden.length ? (
              <div>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
                  onClick={() => setShowHidden((v) => !v)}
                >
                  {showHidden ? "Hide" : "Show"} the {data.hidden.length} marked not a subscription
                </button>
                {showHidden ? (
                  <div className="bg-card/70 border-border/40 mt-2 divide-y rounded-xl border backdrop-blur-xl">
                    {data.hidden.map((s) => (
                      <div key={s.key} className="flex items-center gap-3 px-4 py-2.5">
                        <StreamLogo s={s} className="h-7 w-7 text-[10px]" />
                        <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
                        <span className="text-muted-foreground text-xs tabular-nums">
                          <PrivacyAmount value={s.usual} currency={currency} /> {s.everyLabel}
                        </span>
                        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={busy !== null} onClick={() => act(s.key, () => subscriptionsApi.update(s.key, { hidden: false }))}>
                          Put back
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <Section title="Alerts" blurb="Sent to Discord, and to ntfy when it is set up in the helper's config.">
              {(Object.keys(ALERT_LABELS) as AlertKind[]).map((k) => (
                <div key={k} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <Label htmlFor={`alert-${k}`} className="text-sm">
                      {ALERT_LABELS[k].title}
                    </Label>
                    <p className="text-muted-foreground text-xs">{ALERT_LABELS[k].text}</p>
                  </div>
                  <Switch
                    id={`alert-${k}`}
                    checked={data.alerts[k] !== false}
                    disabled={busy !== null}
                    onCheckedChange={(on) => act(`alert-${k}`, () => subscriptionsApi.setAlerts({ [k]: on }))}
                  />
                </div>
              ))}
            </Section>

            {data.last ? (
              <p className="text-muted-foreground text-xs">
                Last checked {new Date(data.last.at).toLocaleString()}, {data.last.scanned.toLocaleString()} transactions. It checks again every hour.
              </p>
            ) : null}
          </>
        )}
      </PageContent>
      {adding ? (
        <ManualDialog
          entry={adding === "new" ? null : adding}
          busy={busy !== null}
          onClose={() => setAdding(null)}
          onSave={(input, id) =>
            act("manual", () => (id ? subscriptionsApi.updateManual(id, input) : subscriptionsApi.addManual(input)), id ? "Saved." : `${input.name} added.`).then(() => setAdding(null))
          }
          onRemove={(id) => act("manual", () => subscriptionsApi.removeManual(id), "Removed.").then(() => setAdding(null))}
        />
      ) : null}
    </Page>
  );
}

function Tile({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="border-border/40 bg-card/70 rounded-xl border p-3 backdrop-blur-xl md:p-4">
      <div className="text-muted-foreground/70 text-[10px] font-semibold uppercase tracking-wide">{label}</div>
      <div className="mt-1 whitespace-nowrap text-base font-semibold tabular-nums sm:text-xl md:text-2xl">{value}</div>
      {sub ? <div className="text-muted-foreground text-xs">{sub}</div> : null}
    </div>
  );
}

function Section({ title, blurb, aside, children }: { title: string; blurb?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 pb-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {blurb ? <span className="text-muted-foreground/60 hidden text-xs sm:inline">{blurb}</span> : null}
        </div>
        {aside ? <span className="text-muted-foreground text-xs tabular-nums">{aside}</span> : null}
      </div>
      <div className="border-border/40 bg-card/70 divide-y rounded-xl border backdrop-blur-xl">{children}</div>
    </div>
  );
}

function StreamRow({
  s,
  currency,
  busy,
  act,
  onEditManual,
}: {
  s: Stream;
  currency: string;
  busy: string | null;
  act: (label: string, fn: () => Promise<SubscriptionsView>, done?: string) => Promise<void>;
  onEditManual: (m: ManualEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reminder, setReminder] = useState(s.reminder ?? "");
  const st = statusLabel(s);
  const other: StreamGroup = s.group === "bills" ? "subscriptions" : "bills";
  const change = (patch: Parameters<typeof subscriptionsApi.update>[1], done?: string) => act(s.key, () => subscriptionsApi.update(s.key, patch), done);
  const disabled = busy !== null;
  const { data } = useSubscriptions();
  const manual = s.manualId ? data?.manual.find((m) => m.id === s.manualId) : undefined;

  return (
    <div className={cn("px-4 py-3", s.status === "stopped" && "opacity-70")}>
      <div className="flex items-center gap-3">
        <StreamLogo s={s} className="h-9 w-9 text-sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Link to={transactionsHref(s)} className="text-sm font-medium underline-offset-4 hover:underline">
              {s.name}
            </Link>
            {s.confirmed ? <Icons.Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Looks right" /> : null}
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", TONE[st.tone])}>{st.label}</span>
          </div>
          <div className="text-muted-foreground truncate text-xs">
            {EVERY_LABELS[s.every]} · {dueLabel(s)}
            {s.reminder ? ` · Reminder ${day(s.reminder)}` : ""}
            {s.count ? ` · ${s.count} charge${s.count === 1 ? "" : "s"}` : " · not charged yet"}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm tabular-nums">
            {s.variable ? <span className="text-muted-foreground">about </span> : null}
            <PrivacyAmount value={s.usual} currency={currency} />
          </div>
          {s.variable ? (
            <div className="text-muted-foreground text-[11px]">varies</div>
          ) : s.every !== "month" ? (
            <div className="text-muted-foreground text-[11px] tabular-nums">
              <PrivacyAmount value={s.monthly} currency={currency} /> a month
            </div>
          ) : (s.status === "price-up" || s.status === "price-down") && s.previousAmount != null ? (
            <div className="text-muted-foreground text-[11px] tabular-nums">
              was <PrivacyAmount value={s.previousAmount} currency={currency} />
            </div>
          ) : null}
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="More" onClick={() => setOpen((v) => !v)}>
          <Icons.MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>
      {open ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-12">
          {manual ? (
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={disabled} onClick={() => onEditManual(manual)}>
              Edit
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={disabled} onClick={() => change({ confirmed: !s.confirmed })}>
                {s.confirmed ? "Untick" : "Looks right"}
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={disabled} onClick={() => change({ hidden: true }, `${s.name} marked not a subscription.`)}>
                Not a subscription
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={disabled} onClick={() => change({ group: other })}>
            Move to {other === "bills" ? "Bills" : "Subscriptions"}
          </Button>
          <span className="flex items-center gap-1.5">
            <Label htmlFor={`rem-${s.key}`} className="text-muted-foreground text-xs">
              Remind me
            </Label>
            <Input id={`rem-${s.key}`} type="date" value={reminder} onChange={(e) => setReminder(e.target.value)} className="h-7 w-36 text-xs" />
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={disabled || !reminder || reminder === (s.reminder ?? "")} onClick={() => change({ reminder }, "Reminder set.")}>
              Set
            </Button>
            {s.reminder ? (
              <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={disabled} onClick={() => { setReminder(""); void change({ reminder: null }); }}>
                Clear
              </Button>
            ) : null}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function ManualDialog({
  entry,
  busy,
  onClose,
  onSave,
  onRemove,
}: {
  entry: ManualEntry | null;
  busy: boolean;
  onClose: () => void;
  onSave: (input: ManualInput, id?: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(entry?.name ?? "");
  const [words, setWords] = useState(entry?.words.join(", ") ?? "");
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const [every, setEvery] = useState<Every>(entry?.every ?? "year");
  const [nextDate, setNextDate] = useState(entry?.nextDate ?? "");
  const [group, setGroup] = useState<StreamGroup>(entry?.group ?? "subscriptions");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const ready = name.trim().length > 0 && Number(amount) > 0;
  const submit = () =>
    onSave(
      { name: name.trim(), words: (words || name).split(",").map((w) => w.trim()).filter(Boolean), amount: Number(amount), every, nextDate: nextDate || null, group },
      entry?.id,
    );

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{entry ? "Change this one" : "Add a subscription or bill"}</DialogTitle>
          <DialogDescription>For a charge the app has not seen repeat yet, like a yearly membership. Its words find the charges once they come.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sub-name">Name</Label>
            <Input id="sub-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Amazon Prime" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sub-words">Words to look for</Label>
            <Input id="sub-words" value={words} onChange={(e) => setWords(e.target.value)} placeholder="Prime, Amazon Prime" autoComplete="off" />
            <p className="text-muted-foreground text-xs">Separate several with commas. Left empty, the name is used.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sub-amount">Amount</Label>
              <Input id="sub-amount" type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="139.00" />
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
              <Label htmlFor="sub-next">Next charge</Label>
              <Input id="sub-next" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
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
        <DialogFooter className="gap-2 sm:justify-between">
          {entry ? (
            confirmRemove ? (
              <Button type="button" variant="destructive" disabled={busy} onClick={() => onRemove(entry.id)}>
                Yes, remove it
              </Button>
            ) : (
              <Button type="button" variant="ghost" className="text-destructive" disabled={busy} onClick={() => setConfirmRemove(true)}>
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
            <Button type="button" onClick={submit} disabled={!ready || busy}>
              {busy ? <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
              {entry ? "Save" : "Add"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
