// money-hub patch: Subscriptions & bills (lib/subscriptions.ts): every charge that repeats, in two
// groups, with its status and next due date; the owner ticks, hides, moves, adds by hand, sets a
// cancel reminder and picks which alerts go out.
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Button,
  Checkbox,
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

import { useAccounts } from "@/hooks/use-accounts";
import { cn } from "@/lib/utils";

import { StreamLogo } from "../components/stream-logo";
import { ruleOfferStore } from "../lib/rule-offer";
import {
  ALERT_LABELS,
  EVERY_LABELS,
  SUBSCRIPTIONS_KEY,
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

/** A labelled setting: label above, a short note below. */
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
  const [adding, setAdding] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [showLeftOut, setShowLeftOut] = useState(false);

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
  // The next one due on top (owner, 10-01: "sort the subscription by due day, up coming on top");
  // stopped ones by when they were last paid, the latest first.
  const live = items.filter((s) => s.status !== "stopped").sort((a, b) => a.dueInDays - b.dueInDays || a.name.localeCompare(b.name));
  const groups: { group: StreamGroup; title: string; monthly: number; blurb: string }[] = [
    { group: "subscriptions", title: "Subscriptions", monthly: data?.totals.subscriptionsMonthly ?? 0, blurb: "Services you pay for again and again." },
    { group: "bills", title: "Bills", monthly: data?.totals.billsMonthly ?? 0, blurb: "Utilities, phone, insurance and the like." },
  ];
  const stopped = items
    .filter((s) => s.status === "stopped")
    .sort((a, b) => (b.last?.date ?? "").localeCompare(a.last?.date ?? "") || a.name.localeCompare(b.name));

  const rowProps = { currency, busy, act };

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
            <Button size="sm" onClick={() => setAdding(true)}>
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

            {data.leftOut?.length ? (
              <div>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
                  onClick={() => setShowLeftOut((v) => !v)}
                >
                  {showLeftOut ? "Hide" : "Show"} the {data.leftOut.length} charge{data.leftOut.length === 1 ? "" : "s"} you left out of a subscription that is gone now
                </button>
                {showLeftOut ? (
                  <div className="bg-card/70 border-border/40 mt-2 divide-y rounded-xl border backdrop-blur-xl">
                    {data.leftOut.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{c.notes || "No description"}</span>
                          <span className="text-muted-foreground block text-xs">{day(c.date)}</span>
                        </span>
                        <span className="text-muted-foreground text-xs tabular-nums">
                          <PrivacyAmount value={Math.abs(c.amount)} currency={currency} />
                        </span>
                        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={busy !== null} onClick={() => act(c.id, () => subscriptionsApi.exclusions(c.key, { include: [c.id] }), "Put back.")}>
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
          busy={busy !== null}
          onClose={() => setAdding(false)}
          onSave={(input) => act("manual", () => subscriptionsApi.addManual(input), `${input.name} added.`).then(() => setAdding(false))}
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
}: {
  s: Stream;
  currency: string;
  busy: string | null;
  act: (label: string, fn: () => Promise<SubscriptionsView>, done?: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const st = statusLabel(s);
  const { data } = useSubscriptions();
  const manual = s.manualId ? data?.manual.find((m) => m.id === s.manualId) : undefined;
  // One window for every row (owner, 10-01: "why the edit modal look different between each
  // subscriptions"): a hand-added one shows its amount and words in it too.
  const openEdit = () => setEditing(true);

  return (
    // A click anywhere on the row opens it; the pencil is the keyboard's way in (no button inside a button).
    <div onClick={openEdit} className={cn("hover:bg-muted/40 cursor-pointer px-4 py-3 transition-colors", s.status === "stopped" && "opacity-70")}>
      <div className="flex items-center gap-3">
        <StreamLogo s={s} className="h-9 w-9 text-sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Link to={transactionsHref(s)} onClick={(e) => e.stopPropagation()} className="text-sm font-medium underline-offset-4 hover:underline">
              {s.name}
            </Link>
            {/* A reminder is on (owner, 10-01: "show a notification bell next to a subscription whenever a reminder is turned on"). */}
            {s.remindBefore || (s.reminder && s.reminder >= new Date().toISOString().slice(0, 10)) ? (
              <span
                title={s.remindBefore ? `Reminder ${s.remindBefore} day${s.remindBefore === 1 ? "" : "s"} before each charge` : `Reminder on ${day(s.reminder!)}`}
                className="inline-flex"
              >
                <Icons.Bell className="h-3.5 w-3.5 shrink-0" style={{ color: "#d97706" }} aria-label="Reminder on" />
              </span>
            ) : null}
            {s.shared ? (
              <span className="bg-primary/10 text-primary shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium">
                {s.sharedOn ? "Your part" : "Shared in Owly"}
              </span>
            ) : null}
            {/* Active is a green circle with a check (owner, 10-01); Stopped a grey pause; the rest keep their words.
                The old small check ("Looks right" ticked) is gone: two checks side by side read the same. */}
            {st.label === "Active" ? (
              // The green is fixed: the dark theme turns emerald utilities white, and this one must stay green.
              <span title="Active" aria-label="Active" className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "#16a34a" }}>
                <Icons.Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
              </span>
            ) : s.status === "stopped" ? (
              // Stopped: a grey pause, the same badge as Active (owner, 10-01: "stopped just show a grey pause icon").
              <span title="Stopped" aria-label="Stopped" className="bg-muted-foreground/70 inline-flex h-4 w-4 shrink-0 items-center justify-center gap-[2px] rounded-full">
                <span className="bg-background h-[7px] w-[2px] rounded-[1px]" />
                <span className="bg-background h-[7px] w-[2px] rounded-[1px]" />
              </span>
            ) : (
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", TONE[st.tone])}>{st.label}</span>
            )}
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
            <PrivacyAmount value={s.sharedOn && s.shared?.latest ? s.shared.latest.mine : s.usual} currency={currency} />
          </div>
          {s.sharedOn && s.shared?.latest ? (
            <div className="text-muted-foreground text-[11px] tabular-nums">
              of <PrivacyAmount value={s.shared.latest.amount} currency={currency} /> bill
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
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label={`Edit ${s.name}`}
          onClick={(e) => {
            e.stopPropagation();
            openEdit();
          }}
        >
          <Icons.Pencil className="h-4 w-4" />
        </Button>
      </div>
      {editing ? (
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <EditStreamDialog s={s} manual={manual} currency={currency} busy={busy !== null} act={act} onClose={() => setEditing(false)} />
        </div>
      ) : null}
    </div>
  );
}

/** One repeating charge's settings, in a window like Add one (owner, 10-01: "i dont like the inline
 *  edit style ... make it a proper modal like the Add one subscription button modal"). Everything
 *  is saved together; splitting a shared bill keeps its own preview window. */
function EditStreamDialog({
  s,
  manual,
  currency,
  busy,
  act,
  onClose,
}: {
  s: Stream;
  /** Added by hand: its own amount and words, saved with it; Remove instead of Not a subscription. */
  manual?: ManualEntry;
  currency: string;
  busy: boolean;
  act: (label: string, fn: () => Promise<SubscriptionsView>, done?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(s.name);
  const [group, setGroup] = useState<StreamGroup>(s.group);
  const [every, setEvery] = useState<Every>(s.every);
  const [nextDate, setNextDate] = useState(s.next);
  const [remind, setRemind] = useState(s.remindBefore ? String(s.remindBefore) : "off");
  const [confirmed, setConfirmed] = useState(!!s.confirmed);
  const [sendTotal, setSendTotal] = useState(!!s.sendTotal);
  const [amount, setAmount] = useState(manual ? String(manual.amount) : "");
  const [words, setWords] = useState(manual ? manual.words.join(", ") : "");
  const [sharing, setSharing] = useState(false);
  const [confirmHide, setConfirmHide] = useState(false);
  const qc = useQueryClient();
  // Its charges, newest first, with the ones taken out by hand (unticked). A tick change is saved with
  // the rest (owner, 10-01: "see all linked transactions in the subscription and a check box to
  // manually exclude (will by pass all rules)").
  const charges = [
    ...(s.charges ?? []).map((c) => ({ ...c, notes: c.notes ?? "", accountId: c.accountId ?? null, wasOut: false })),
    ...(s.excluded ?? []).map((c) => ({ ...c, wasOut: true })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const [out, setOut] = useState<Set<string>>(() => new Set((s.excluded ?? []).map((c) => c.id)));
  const toExclude = charges.filter((c) => !c.wasOut && out.has(c.id)).map((c) => c.id);
  const toInclude = charges.filter((c) => c.wasOut && !out.has(c.id)).map((c) => c.id);
  const outChanged = toExclude.length + toInclude.length > 0;
  const keptCount = charges.length - out.size;
  const { accounts } = useAccounts({ filterActive: false });
  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]));
  const linked = new Set(s.linkedIds ?? []);
  const ruled = new Set(s.ruledIds ?? []);

  const patch: Parameters<typeof subscriptionsApi.update>[1] = {};
  // A hand-added one keeps its name, group, rhythm and next date on itself (updateManual).
  const own: ManualInput | null = manual
    ? {
        name: name.trim() || manual.name,
        words: (words || name).split(",").map((w) => w.trim()).filter(Boolean),
        amount: Number(amount),
        every,
        nextDate: nextDate || null,
        group,
      }
    : null;
  // Changed against what the window opened with (its date may come from the charges, not the entry).
  const [shown] = useState(() => JSON.stringify([name, words, amount, every, nextDate, group]));
  const ownChanged = !!manual && JSON.stringify([name, words, amount, every, nextDate, group]) !== shown;
  if (!manual) {
    if (name.trim() && name.trim() !== s.name) patch.name = name.trim();
    if (group !== s.group) patch.group = group;
    if (every !== s.every) patch.every = every;
    if (nextDate && nextDate !== s.next) patch.nextDate = nextDate;
  }
  if ((remind === "off" ? null : Number(remind)) !== (s.remindBefore ?? null)) patch.remindBefore = remind === "off" ? null : Number(remind);
  if (confirmed !== !!s.confirmed) patch.confirmed = confirmed;
  const sendChanged = sendTotal !== !!s.sendTotal;
  const dirty = Object.keys(patch).length > 0 || sendChanged || ownChanged || outChanged;
  // Every charge out of a found one would drop it with no way back from here: Not a subscription is that.
  const allOut = !manual && charges.length > 0 && keptCount === 0;
  const valid = (!manual || (Number(amount) > 0 && name.trim().length > 0)) && !allOut;

  const save = () =>
    act(
      s.key,
      async () => {
        let view = ownChanged && manual && own ? await subscriptionsApi.updateManual(manual.id, own) : undefined;
        // Before the key-bound changes below: taking charges out can change what it finds.
        if (outChanged) view = await subscriptionsApi.exclusions(s.key, { exclude: toExclude, include: toInclude });
        if (Object.keys(patch).length) view = await subscriptionsApi.update(s.key, patch);
        if (sendChanged) view = await subscriptionsApi.setSendTotal(s.key, sendTotal);
        return view!;
      },
      `${name.trim() || s.name} saved.`,
    ).then(onClose);

  // A rule for charges like these (owner, 10-01: "i clicked edit and i cant see a place to add any
  // rule"): the rule window opens on its words; once made, a scan brings what it matches here.
  const addRule = () => {
    onClose();
    ruleOfferStore.open({
      pattern: s.search || s.name,
      taxonomyId: "spending_categories",
      categoryId: s.categoryId ?? s.rules?.[0]?.categoryId ?? "",
      onDone: () => {
        subscriptionsApi.rescan().then((v) => qc.setQueryData(SUBSCRIPTIONS_KEY, v)).catch(() => {});
      },
    });
  };
  const rules = s.rules ?? [];

  const latest = s.shared?.latest;
  const owly = s.owlyTotal;

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[520px]" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader className="text-left">
            <div className="flex items-center gap-3 pr-8">
              <StreamLogo s={s} className="h-10 w-10 text-sm" />
              <div className="min-w-0">
                <DialogTitle className="truncate">{s.name}</DialogTitle>
                <DialogDescription>
                  {EVERY_LABELS[s.every]} · {dueLabel(s)}
                  {s.count ? ` · ${s.count} charge${s.count === 1 ? "" : "s"}` : ""}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" htmlFor="edit-name">
                <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
              </Field>
              <Field label="Group">
                <Select value={group} onValueChange={(v) => setGroup(v as StreamGroup)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="subscriptions">Subscriptions</SelectItem>
                    <SelectItem value="bills">Bills</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {manual ? (
                <>
                  <Field label="Amount" htmlFor="edit-amount">
                    <Input id="edit-amount" type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </Field>
                  <Field label="Words to look for" htmlFor="edit-words" foot="Separate several with commas.">
                    <Input id="edit-words" value={words} onChange={(e) => setWords(e.target.value)} placeholder={name} autoComplete="off" />
                  </Field>
                </>
              ) : null}
              <Field label="How often"
                foot={manual ? "As you set it." : s.everySetByOwner ? (
                  <button type="button" className="hover:text-foreground underline-offset-4 hover:underline" disabled={busy}
                    onClick={() => act(s.key, () => subscriptionsApi.update(s.key, { every: null }), "Back to what its charges show.").then(onClose)}>
                    Use what its charges show
                  </button>
                ) : "As its charges show."}>
                <Select value={every} onValueChange={(v) => setEvery(v as Every)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(EVERY_LABELS) as Every[]).map((k) => (
                      <SelectItem key={k} value={k}>{EVERY_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Next charge" htmlFor="edit-next"
                foot={manual ? "For your records: no transaction is made." : s.nextSetByOwner ? (
                  <button type="button" className="hover:text-foreground underline-offset-4 hover:underline" disabled={busy}
                    onClick={() => act(s.key, () => subscriptionsApi.update(s.key, { nextDate: null }), "Back to the date from its charges.").then(onClose)}>
                    Use the date from its charges
                  </button>
                ) : "For your records: no transaction is made."}>
                <Input id="edit-next" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} disabled={s.status === "stopped" && !manual} />
              </Field>
              <Field label="Remind me" foot="On Discord and your phone, in the daytime.">
                <Select value={remind} onValueChange={setRemind} disabled={s.status === "stopped"}>
                  <SelectTrigger>
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
              <Field label="Looks right" foot="It really is a subscription or bill.">
                <div className="flex h-9 items-center">
                  <Switch checked={confirmed} onCheckedChange={setConfirmed} aria-label="Looks right" />
                </div>
              </Field>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">Rules</div>
                <div className="text-muted-foreground space-y-0.5 text-xs leading-snug">
                  {/* What brings its charges here: the owner's rules, and the merchant words (owner, 10-01:
                      Membership Fee "def have a rule" = merchant Bank fees & credits, word Membership fee). */}
                  {rules.length ? (
                    <div>
                      Rule{rules.length === 1 ? "" : "s"}: <span className="text-foreground">{rules.map((r) => r.name).join(", ")}</span>.{" "}
                      What {rules.length === 1 ? "it files" : "they file"} joins {s.name}, on any card.
                    </div>
                  ) : null}
                  {s.merchantWords ? (
                    <div>
                      Merchant:{" "}
                      <Link to="/settings/spending/merchants" className="text-foreground underline-offset-4 hover:underline">
                        {s.merchantWords.name}
                      </Link>
                      , word{s.merchantWords.words.length === 1 ? "" : "s"} {s.merchantWords.words.map((w) => `"${w}"`).join(", ")}.
                    </div>
                  ) : null}
                  {!rules.length && !s.merchantWords ? (
                    <div>No rule yet. A rule files charges like these and keeps them in {s.name}, on any card.</div>
                  ) : null}
                  <Link to="/settings/spending/rules" className="text-foreground inline-block underline-offset-4 hover:underline">
                    All rules
                  </Link>
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" className="shrink-0 self-start" disabled={busy} onClick={addRule}>
                <Icons.Plus className="mr-1 h-3.5 w-3.5" />
                Add a rule
              </Button>
            </div>

            {charges.length ? (
              <div className="rounded-lg border">
                <div className="flex items-start justify-between gap-3 border-b px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">Charges</div>
                    <div className="text-muted-foreground text-xs leading-snug">
                      {keptCount} of {charges.length} in {s.name}. Untick one to leave it out: no word, merchant or rule brings it back.
                    </div>
                  </div>
                </div>
                <div className="max-h-[40dvh] divide-y overflow-y-auto">
                  {charges.map((c) => {
                    const isOut = out.has(c.id);
                    const why = c.wasOut ? "left out by you" : linked.has(c.id) ? "linked by you" : ruled.has(c.id) ? "by a rule" : null;
                    return (
                      <label key={c.id} className={cn("flex cursor-pointer items-center gap-3 px-3 py-2", isOut && "opacity-60")}>
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate text-sm", isOut && "line-through")}>{c.notes || "No description"}</span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {[day(c.date), c.accountId ? accountName.get(c.accountId) : null, why].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm tabular-nums">
                          <PrivacyAmount value={Math.abs(c.amount)} currency={currency} />
                        </span>
                        <Checkbox
                          checked={!isOut}
                          disabled={busy}
                          onCheckedChange={(v) =>
                            setOut((prev) => {
                              const next = new Set(prev);
                              if (v === true) next.delete(c.id);
                              else next.add(c.id);
                              return next;
                            })
                          }
                          aria-label={`${isOut ? "Put back" : "Leave out"} ${c.notes}, ${day(c.date)}`}
                        />
                      </label>
                    );
                  })}
                </div>
                {allOut ? (
                  <p className="border-t px-3 py-2 text-xs" style={{ color: "#d97706" }}>
                    Every charge is unticked. To drop {s.name} altogether, use Not a subscription below.
                  </p>
                ) : null}
              </div>
            ) : null}

            {s.shared ? (
              <div className="divide-y rounded-lg border">
                <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">Count only my part</div>
                    <div className="text-muted-foreground text-xs leading-snug">
                      {s.sharedOn && latest ? (
                        <>Your part <PrivacyAmount value={latest.mine} currency={currency} /> of the latest <PrivacyAmount value={latest.amount} currency={currency} /> bill; friends&rsquo; part in Counted elsewhere.</>
                      ) : latest ? (
                        <>Owly&rsquo;s {s.shared.service}: friends owe <PrivacyAmount value={latest.friends} currency={currency} /> of the latest <PrivacyAmount value={latest.amount} currency={currency} /> bill.</>
                      ) : (
                        <>Shared in Owly as {s.shared.service}; no friends&rsquo; shares for its charges yet.</>
                      )}
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="shrink-0 self-start" disabled={busy || (!s.sharedOn && !s.shared.count)} onClick={() => setSharing(true)}>
                    {s.sharedOn ? "Count the whole bill" : "Review and split"}
                  </Button>
                </div>
                <div className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <Label htmlFor="edit-send" className="text-sm font-medium">Send the bank&rsquo;s amount to Owly</Label>
                    <div className={cn("text-xs leading-snug", owly?.error ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
                      {owly?.error
                        ? owly.error
                        : owly?.amount != null && owly.from
                          ? <>Owly&rsquo;s total: <PrivacyAmount value={owly.amount} currency={currency} /> from {day(owly.from)}. Each new charge updates it.</>
                          : "Each new charge becomes Owly's total, so its next bill uses it. Friends' amounts stay as typed."}
                    </div>
                  </div>
                  <Switch id="edit-send" checked={sendTotal} onCheckedChange={setSendTotal} />
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {confirmHide ? (
              <Button type="button" variant="destructive" disabled={busy}
                onClick={() =>
                  manual
                    ? act(s.key, () => subscriptionsApi.removeManual(manual.id), `${s.name} removed.`).then(onClose)
                    : act(s.key, () => subscriptionsApi.update(s.key, { hidden: true }), `${s.name} marked not a subscription.`).then(onClose)
                }>
                {manual ? "Yes, remove it" : "Yes, not a subscription"}
              </Button>
            ) : (
              <Button type="button" variant="ghost" className="text-destructive" disabled={busy} onClick={() => setConfirmHide(true)}>
                {manual ? "Remove" : "Not a subscription"}
              </Button>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="button" onClick={save} disabled={busy || !dirty || !valid}>
                {busy ? <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {sharing && s.shared ? (
        <SharedDialog
          s={s}
          currency={currency}
          busy={busy}
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
    </>
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

/** Add one by hand; changing it later is the same window as every other row (EditStreamDialog). */
function ManualDialog({
  busy,
  onClose,
  onSave,
}: {
  busy: boolean;
  onClose: () => void;
  onSave: (input: ManualInput) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [words, setWords] = useState("");
  const [amount, setAmount] = useState("");
  const [every, setEvery] = useState<Every>("year");
  const [nextDate, setNextDate] = useState("");
  const [group, setGroup] = useState<StreamGroup>("subscriptions");
  const ready = name.trim().length > 0 && Number(amount) > 0;
  const submit = () =>
    onSave(
      { name: name.trim(), words: (words || name).split(",").map((w) => w.trim()).filter(Boolean), amount: Number(amount), every, nextDate: nextDate || null, group },
    );

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Add a subscription or bill</DialogTitle>
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
        <DialogFooter className="gap-2 sm:justify-end">
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={!ready || busy}>
              {busy ? <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
