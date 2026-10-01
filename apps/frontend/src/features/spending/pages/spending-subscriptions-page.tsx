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

/** How many days before each charge a reminder can come. */
const REMIND_DAYS = [1, 2, 3, 5, 7, 14];
/** One height for every button, box and list in a row's menu (the boxes' own height setting wins
 *  over a plain one, hence the !). */
const ctl = "h-8 text-xs";
const box = "h-8! py-1 text-xs";

/** A labelled setting in a row's menu: label above, a short note below. */
function Field({ label, htmlFor, foot, children }: { label: string; htmlFor?: string; foot?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={htmlFor} className="text-muted-foreground text-[11px] font-medium">
        {label}
      </Label>
      {children}
      {foot ? <div className="text-muted-foreground text-[11px] leading-snug">{foot}</div> : null}
    </div>
  );
}

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

            <Section title="Alerts" blurb="Which of these to tell you about.">
              {(Object.keys(ALERT_LABELS) as AlertKind[]).map((k) => (
                <div key={k} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <Label htmlFor={`alert-${k}`} className="text-sm">
                      {ALERT_LABELS[k].title}
                    </Label>
                    <p className="text-muted-foreground text-xs">{ALERT_LABELS[k].text}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={busy !== null}
                    onClick={async () => {
                      setBusy(`test-${k}`);
                      try {
                        const r = await subscriptionsApi.testAlert(k);
                        set(r);
                        const where = [r.went.discord && "Discord", r.went.ntfy && "your phone"].filter(Boolean).join(" and ");
                        toast.success(`Sample sent to ${where}, using ${r.sample}.`);
                      } catch (e) {
                        toast.error(errorText(e));
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    {busy === `test-${k}` ? <Icons.Spinner className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    Test
                  </Button>
                  <Switch
                    id={`alert-${k}`}
                    checked={data.alerts[k] !== false}
                    disabled={busy !== null}
                    onCheckedChange={(on) => act(`alert-${k}`, () => subscriptionsApi.setAlerts({ [k]: on }))}
                  />
                  </div>
                </div>
              ))}
            </Section>

            <p className="text-muted-foreground -mt-3 text-xs">
              They go to Discord and your phone, as set in{" "}
              <Link to="/settings/alerts" className="text-foreground underline-offset-4 hover:underline">
                Settings, Alerts
              </Link>
              .
            </p>

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
  const [nextDate, setNextDate] = useState(s.next);
  const [sharing, setSharing] = useState(false);
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
            {s.shared ? (
              <span className="bg-primary/10 text-primary shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium">
                {s.sharedOn ? "Your part" : "Shared in Owly"}
              </span>
            ) : null}
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", TONE[st.tone])}>{st.label}</span>
          </div>
          <div className="text-muted-foreground text-xs leading-snug">
            {EVERY_LABELS[s.every]}
            {s.everySetByOwner ? " (your choice)" : ""} · {dueLabel(s)}
            {s.nextSetByOwner ? " (your date)" : ""}
            {s.remindBefore
              ? ` · Reminder ${s.remindBefore} day${s.remindBefore === 1 ? "" : "s"} before`
              : s.reminder
                ? ` · Reminder ${day(s.reminder)}`
                : ""}
            {s.count ? ` · ${s.count} charge${s.count === 1 ? "" : "s"}` : " · not charged yet"}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm tabular-nums">
            {s.variable && !s.sharedOn ? <span className="text-muted-foreground">about </span> : null}
            <PrivacyAmount value={s.usual} currency={currency} />
          </div>
          {s.sharedOn && s.billUsual != null ? (
            <div className="text-muted-foreground text-[11px] tabular-nums">
              of <PrivacyAmount value={s.billUsual} currency={currency} /> bill
            </div>
          ) : s.variable ? (
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
        <div className="mt-3 space-y-3 sm:pl-12">
          {/* What to do with it: one row of buttons. */}
          <div className="flex flex-wrap gap-2">
            {manual ? (
              <Button variant="outline" size="sm" className={ctl} disabled={disabled} onClick={() => onEditManual(manual)}>
                Edit
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" className={ctl} disabled={disabled} onClick={() => change({ confirmed: !s.confirmed })}>
                  {s.confirmed ? "Untick" : "Looks right"}
                </Button>
                <Button variant="outline" size="sm" className={ctl} disabled={disabled} onClick={() => change({ hidden: true }, `${s.name} marked not a subscription.`)}>
                  Not a subscription
                </Button>
              </>
            )}
            {s.shared ? (
              <Button variant="outline" size="sm" className={ctl} disabled={disabled} onClick={() => setSharing(true)}>
                {s.sharedOn ? "Count the whole bill" : "Count only my part"}
              </Button>
            ) : null}
            <Button variant="outline" size="sm" className={ctl} disabled={disabled} onClick={() => change({ group: other })}>
              Move to {other === "bills" ? "Bills" : "Subscriptions"}
            </Button>
          </div>

          {/* Its settings: three fields of one size, side by side, stacked on a phone. */}
          <div className="grid gap-3 sm:grid-cols-3">
            {s.status !== "stopped" ? (
              <Field label="Next charge" htmlFor={`next-${s.key}`}
                foot={s.nextSetByOwner ? (
                  <button type="button" className="hover:text-foreground underline-offset-4 hover:underline" disabled={disabled}
                    onClick={() => change({ nextDate: null }, "Back to the date from its charges.")}>
                    Use the date from its charges
                  </button>
                ) : "For your records: no transaction is made."}>
                <div className="flex gap-2">
                  <Input id={`next-${s.key}`} type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className={`${box} min-w-0 flex-1`} />
                  <Button variant="outline" size="sm" className={ctl} disabled={disabled || !nextDate || nextDate === s.next}
                    onClick={() => change({ nextDate }, "Date saved, for your records. No transaction was made.")}>
                    Save
                  </Button>
                </div>
              </Field>
            ) : null}
            {!s.manualId ? (
              <Field label="How often"
                foot={s.everySetByOwner ? (
                  <button type="button" className="hover:text-foreground underline-offset-4 hover:underline" disabled={disabled}
                    onClick={() => change({ every: null }, "Back to what its charges show.")}>
                    Use what its charges show
                  </button>
                ) : "As its charges show."}>
                <Select value={s.every} disabled={disabled}
                  onValueChange={(v) => change({ every: v as Every }, `${s.name}: ${EVERY_LABELS[v as Every].toLowerCase()}.`)}>
                  <SelectTrigger className={`${box} w-full`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(EVERY_LABELS) as Every[]).map((k) => (
                      <SelectItem key={k} value={k}>{EVERY_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            {s.status !== "stopped" ? (
              <Field label="Remind me"
                foot={s.reminder ? (
                  <span>
                    Also once on {day(s.reminder)}.{" "}
                    <button type="button" className="hover:text-foreground underline-offset-4 hover:underline" disabled={disabled}
                      onClick={() => void change({ reminder: null })}>
                      Clear
                    </button>
                  </span>
                ) : "On Discord and your phone, in the daytime."}>
                <Select value={s.remindBefore ? String(s.remindBefore) : "off"} disabled={disabled}
                  onValueChange={(v) => change(
                    { remindBefore: v === "off" ? null : Number(v) },
                    v === "off" ? "Reminder off." : `You'll hear ${v} day${v === "1" ? "" : "s"} before each ${s.name} charge.`,
                  )}>
                  <SelectTrigger className={`${box} w-full`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">Off</SelectItem>
                    {REMIND_DAYS.map((n) => (
                      <SelectItem key={n} value={String(n)}>{n} day{n === 1 ? "" : "s"} before each charge</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
          </div>
        </div>
      ) : null}
      {sharing && s.shared ? (
        <SharedDialog
          s={s}
          currency={currency}
          busy={disabled}
          onClose={() => setSharing(false)}
          onConfirm={() =>
            act(
              s.key,
              () => subscriptionsApi.setShared(s.key, !s.sharedOn),
              s.sharedOn ? `${s.name}: whole bill counted again.` : `${s.name}: only your part counts now. The friends' part is in Counted elsewhere.`,
            ).then(() => setSharing(false))
          }
        />
      ) : null}
    </div>
  );
}

/** What "Count only my part" does to each charge, before it does it. */
function SharedDialog({
  s,
  currency,
  busy,
  onClose,
  onConfirm,
}: {
  s: Stream;
  currency: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const plan = [...(s.shared?.plan ?? [])].reverse();
  const split = plan.filter((p) => p.ok);
  const sum = (f: (p: (typeof plan)[number]) => number) => split.reduce((a, p) => a + f(p), 0);
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{s.sharedOn ? `Count the whole ${s.name} bill again?` : `Count only your part of ${s.name}?`}</DialogTitle>
          <DialogDescription>
            {s.sharedOn
              ? "Each charge goes back whole into its category, as the bank sent it."
              : `Owly's ${s.shared?.service} shares say what your friends owe for each charge. Your part stays in its category; the friends' part moves to Counted elsewhere, out of Spending. New charges are split the same way as they come in.`}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border">
          <div className="text-muted-foreground grid grid-cols-[1fr_auto_auto_auto] gap-x-4 border-b px-3 py-2 text-[11px] font-medium">
            <span>Charge</span>
            <span className="text-right">Bill</span>
            <span className="text-right">Friends</span>
            <span className="text-right">Yours</span>
          </div>
          <div className="max-h-72 divide-y overflow-y-auto">
            {plan.map((p) => (
              <div key={p.id} className={cn("grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 px-3 py-2 text-xs tabular-nums", !p.ok && "text-muted-foreground")}>
                <span className="min-w-0">
                  <span className="block">{day(p.date)}</span>
                  <span className="text-muted-foreground block truncate text-[11px]">
                    {p.ok ? p.people.join(", ") : p.tooMuch ? "Friends owe all of it: left whole" : "Not in Owly: left whole"}
                  </span>
                </span>
                <span className="text-right"><PrivacyAmount value={p.amount} currency={currency} /></span>
                <span className="text-right">{p.ok ? <PrivacyAmount value={p.friends} currency={currency} /> : "-"}</span>
                <span className="text-right font-medium">{p.ok ? <PrivacyAmount value={p.mine} currency={currency} /> : <PrivacyAmount value={p.amount} currency={currency} />}</span>
              </div>
            ))}
          </div>
          {split.length ? (
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 border-t px-3 py-2 text-xs font-medium tabular-nums">
              <span>{split.length} charge{split.length === 1 ? "" : "s"} split</span>
              <span className="text-right"><PrivacyAmount value={sum((p) => p.amount)} currency={currency} /></span>
              <span className="text-right"><PrivacyAmount value={sum((p) => p.friends)} currency={currency} /></span>
              <span className="text-right"><PrivacyAmount value={sum((p) => p.mine)} currency={currency} /></span>
            </div>
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={busy || (!s.sharedOn && !split.length)}>
            {busy ? <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
            {s.sharedOn ? "Count the whole bill" : `Split ${split.length} charge${split.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
