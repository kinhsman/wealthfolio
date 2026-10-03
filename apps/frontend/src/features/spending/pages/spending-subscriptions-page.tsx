// money-hub patch: Subscriptions & bills (lib/subscriptions.ts): every charge that repeats, in two
// groups, with its status and next due date; the owner ticks, hides, moves, adds by hand, sets a
// cancel reminder and picks which alerts go out. On top: this month's paid so far and still to pay.
import { useMemo, useState, type ReactNode } from "react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icons,
  Input,
  Label,
  Page,
  PageContent,
  PageHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  PrivacyAmount,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui";
import { Switch } from "@wealthfolio/ui/components/ui/switch";

import { useAccounts } from "@/hooks/use-accounts";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { cn } from "@/lib/utils";

import { CompanyButton, CompanyPicker } from "../components/company-picker";
import { BillMonthPanel } from "../components/bill-calendar";
import { PhoneFold } from "../components/phone-fold";
import { useDashboardSkins } from "../lib/dashboard-skin";
import { StreamCategory, useStreamCategory } from "../components/stream-category";
import { StreamLogo } from "../components/stream-logo";
import { billMonth, ymd } from "../lib/bill-calendar";
import type { BillDue } from "../lib/budget-forecast";
import { ruleOfferStore } from "../lib/rule-offer";
import { FrequencyPicker } from "../components/frequency-picker";
import {
  EVERY_LABELS,
  SUBSCRIPTIONS_KEY,
  dueLabel,
  formatEveryShort,
  localToday,
  nextChargeAfter,
  openDatePicker,
  rentalSettingsHref,
  shortDate,
  statusLabel,
  subscriptionsApi,
  transactionsHref,
  useSetSubscriptions,
  useSubscriptions,
  type Every,
  type ManualEntry,
  type ManualInput,
  type Stream,
  type StreamGroup,
  type SubscriptionsView,
} from "../lib/subscriptions";

// The page sits in the Spending dashboard's look (Meadow or Bronze, owner 10-02): good news green, things
// to look at amber, the rest quiet.
// On a phone a row's second line keeps its keywords (owner, 10-02: "keep only keywords"): how often and
// when; the rest is in its Edit window.
const RAW_EVERY_SHORT: Record<string, string> = { month: "Monthly", quarter: "Every 3 mo", "half-year": "Every 6 mo", year: "Yearly" };
const EVERY_SHORT: Record<string, string> = new Proxy(RAW_EVERY_SHORT, {
  get(target, prop: string) {
    if (typeof prop === "string") {
      if (prop in target) return target[prop];
      return formatEveryShort(prop);
    }
    return undefined;
  },
});

function phoneDue(label: string) {
  return label
    .replace(/^(Due (today|tomorrow)),.*$/, "$1")
    .replace(/, in \d+ days?$/, "")
    .replace(/, \d+ days? ago$/, "")
    .replace(/, \d{4}/, "");
}

const TONE = {
  fine: "bg-[var(--m-good-soft)] text-[var(--m-up)]",
  look: "bg-[var(--m-warn-soft)] text-[var(--m-warn)]",
  over: "bg-[var(--m-tile)] text-[var(--m-muted)]",
} as const;

/** Owly's mark, the owl its app header draws (owly web/public/logo.svg). */
function OwlyMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="#f2a83c" strokeWidth="1.8" />
      <circle cx="8.6" cy="10.4" r="2.6" stroke="#f2a83c" strokeWidth="1.8" />
      <circle cx="15.4" cy="10.4" r="2.6" stroke="#f2a83c" strokeWidth="1.8" />
      <path d="M12 13.4l-1.4 2.2h2.8L12 13.4z" fill="#f2a83c" />
    </svg>
  );
}

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

/** The currencies a hand-added one can be in: the base one and every account's (owner, 10-03: a loan in
 *  Vietnam is paid in dong). */
function useBillCurrencies(base: string): string[] {
  const { accounts } = useAccounts({ filterActive: false });
  return useMemo(
    () => [...new Set([base, ...(accounts ?? []).map((a) => a.currency).filter(Boolean)].map((c) => c.toUpperCase()))],
    [accounts, base],
  );
}

/** A currency's own decimals (dong has none), for the amount box. */
const stepOf = (currency: string) => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits === 0 ? "1" : "0.01";
  } catch {
    return "0.01";
  }
};
const symbolOf = (currency: string) => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
};

/** An amount box with its currency in front; the pick shows only when there is more than one. */
function AmountInCurrency({
  id,
  amount,
  setAmount,
  currency,
  setCurrency,
  currencies,
  placeholder,
}: {
  id: string;
  amount: string;
  setAmount: (v: string) => void;
  currency: string;
  setCurrency: (v: string) => void;
  currencies: string[];
  placeholder?: string;
}) {
  return (
    <div className="flex gap-2">
      {currencies.length > 1 ? (
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger className="w-[6.75rem] shrink-0" aria-label="Currency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {currencies.map((c) => (
              <SelectItem key={c} value={c}>
                {symbolOf(c) !== c ? `${symbolOf(c)} ${c}` : c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <Input
        id={id}
        type="number"
        inputMode={stepOf(currency) === "1" ? "numeric" : "decimal"}
        step={stepOf(currency)}
        min="0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder={placeholder}
        className="min-w-0"
      />
    </div>
  );
}

/** Paid where the app cannot see it (owner, 10-03: a loan in Vietnam paid from "where I kept my cash at"):
 *  cash, or a bank that is not linked. That period counts as paid; no transaction is made. */
function MarkPaidDialog({
  s,
  manualId,
  currency,
  busy,
  act,
  onClose,
}: {
  s: Stream;
  manualId: string;
  currency: string;
  busy: boolean;
  act: (label: string, fn: () => Promise<SubscriptionsView>, done?: string) => Promise<void>;
  onClose: () => void;
}) {
  const currencies = useBillCurrencies(currency);
  const own = s.native && s.currency ? s.currency : currency;
  const [date, setDate] = useState(() => ymd(new Date()));
  const [cur, setCur] = useState(own);
  const [amount, setAmount] = useState(String(s.native && s.currency ? s.native.usual : s.usual));
  const ready = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number(amount) > 0;
  const submit = () =>
    act(s.key, () => subscriptionsApi.markPaid(manualId, { date, amount: Number(amount), currency: cur }), `${s.name} marked paid.`).then(onClose);

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Mark {s.name} paid</DialogTitle>
          <DialogDescription>Paid in cash or from a bank the app can&rsquo;t see. No transaction is made.</DialogDescription>
        </DialogHeader>
        {/* One under the other: a dong amount runs to eight digits beside its currency. */}
        <div className="grid gap-3">
          <Field label="Paid on" htmlFor="paid-date">
            <Input id="paid-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} onClick={openDatePicker} />
          </Field>
          <Field label="Amount" htmlFor="paid-amount">
            <AmountInCurrency id="paid-amount" amount={amount} setAmount={setAmount} currency={cur} setCurrency={setCur} currencies={currencies} />
          </Field>
        </div>
        <DialogFooter className="gap-2 sm:justify-end">
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={!ready || busy}>
              {busy ? <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
              Mark paid
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SpendingSubscriptionsPage() {
  const navigate = useNavigate();
  const skins = useDashboardSkins();
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
    // The Spending dashboard's look, Meadow or Bronze per mode (owner, 10-02: "redesign ... subs and bills").
    <div className="meadow min-h-screen" data-mdash data-light-skin={skins.light} data-dark-skin={skins.dark}>
    <Page>
      {/* Its own title, not `heading`: a phone cut it to "Subscriptions & Bi…". A size smaller there, and on a
          very narrow screen it wraps instead (owner, 10-01: "the Bills title must be capital"). */}
      <PageHeader
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
      >
        <h1 className="min-w-0 text-base font-semibold leading-tight sm:text-lg md:text-xl">Subscriptions &amp; Bills</h1>
      </PageHeader>
      <PageContent className="space-y-6">
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Looking for repeating charges.</p>
        ) : isError ? (
          <p className="text-destructive text-sm">{errorText(error)}</p>
        ) : !data ? null : (
          <>
            {/* The canvas design (owner, 10-02): this month is the one hero, its totals inside it; the lists in
                two thirds; the calendar beside them, sticky (on a phone, under the hero). overflow visible: at
                1024 and below the app clips every grid (globals.css). */}
            <div
              className="grid items-start gap-3.5 max-md:gap-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
              style={{ overflowX: "visible" }}
            >
              <div className="min-w-0 lg:col-start-1 lg:row-start-1">
                <ThisMonth
                  items={items}
                  currency={currency}
                  totals={{ monthly: data.totals.monthly, yearly: data.totals.yearly, repeating: live.length, stopped: stopped.length }}
                />
              </div>
              {items.length > 0 ? (
                <aside
                  data-m="card"
                  className="min-w-0 self-start rounded-[20px] border border-[var(--m-line)] bg-[var(--m-surface)] px-[18px] py-3.5 max-md:px-3 max-md:py-2.5 lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1"
                >
                  <div className="flex items-baseline gap-2 pb-1">
                    <h2 className="text-sm font-medium">Calendar</h2>
                    <span className="hidden text-[12.5px] text-[var(--m-muted)] sm:inline">When each one comes.</span>
                  </div>
                  <BillMonthPanel items={items} currency={currency} totals={false} />
                </aside>
              ) : null}
              <div className="flex min-w-0 flex-col gap-3.5 max-md:gap-2 lg:col-start-1 lg:row-start-2">
                {items.length === 0 ? (
                  <div data-m="card" className="rounded-[20px] border border-[var(--m-line)] bg-[var(--m-surface)] p-6 text-center">
                    <p className="text-sm">No repeating charges found yet.</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      One shows up once it has come back a few months in a row. A yearly one you already know about can be added by hand.
                    </p>
                  </div>
                ) : null}

                {groups.map((g) => {
                  const rows = live.filter((s) => s.group === g.group);
                  if (!rows.length) return null;
                  // Paid from a mortgage's escrow: shown, but counted once, in the mortgage payment.
                  const inMortgage = rows.filter((s) => s.escrow);
                  const lenders = [...new Set(inMortgage.map((s) => s.escrow?.mortgageName).filter(Boolean))];
                  return (
                    <Section
                      key={g.group}
                      title={g.title}
                      blurb={g.blurb}
                      aside={<><PrivacyAmount value={g.monthly} currency={currency} /> a month</>}
                      note={
                        inMortgage.length ? (
                          <>
                            {inMortgage.map((s) => s.name).join(" and ")} {inMortgage.length === 1 ? "is" : "are"} paid from your{" "}
                            {lenders.length === 1 ? `${lenders[0]} ` : ""}mortgage escrow, so the totals count{" "}
                            {inMortgage.length === 1 ? "it" : "them"} once, in the mortgage payment.
                          </>
                        ) : null
                      }
                    >
                      {rows.slice(0, 6).map((s) => (
                        <StreamRow key={s.key} s={s} {...rowProps} />
                      ))}
                      {rows.length > 6 ? (
                        <PhoneFold id={`subscriptions-${g.group}`} closedLabel={`Show ${rows.length - 6} more`} openLabel="Show less">
                          {rows.slice(6).map((s) => (
                            <StreamRow key={s.key} s={s} {...rowProps} />
                          ))}
                        </PhoneFold>
                      ) : null}
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

                {/* Rarely used: under a quiet More divider (Meadow). */}
                <div className="mt-1 flex items-center gap-2.5">
                  <span className="text-[12.5px] text-[var(--m-muted)]">More</span>
                  <span className="h-px flex-1 bg-[var(--m-line)]" />
                </div>
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
                      <div className="bg-card border-border mt-2 divide-y rounded-[14px] border">
                        {data.hidden.map((s) => (
                          <div key={s.key} className="flex items-center gap-3 px-4 py-2.5">
                            <StreamLogo s={s} className="h-7 w-7 text-[10px]" />
                            <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
                            <span className="text-muted-foreground text-xs tabular-nums">
                              <OwnAmount s={s} currency={currency} /> {s.everyLabel}
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
                      <div className="bg-card border-border mt-2 divide-y rounded-[14px] border">
                        {data.leftOut.map((c) => (
                          <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm">{c.notes || "No description"}</span>
                              <span className="text-muted-foreground block text-xs">{day(c.date)}</span>
                            </span>
                            <span className="text-muted-foreground text-xs tabular-nums">
                              {c.native != null && c.currency ? (
                                <PrivacyAmount value={Math.abs(c.native)} currency={c.currency} />
                              ) : (
                                <PrivacyAmount value={Math.abs(c.amount)} currency={currency} />
                              )}
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
                {/* Which alerts go out, and their tests, live on Settings, Alerts with every other alert (owner, 10-01). */}
                <div className="text-muted-foreground space-y-1 text-xs">
                  {data.last ? (
                    <p>
                      Last checked {new Date(data.last.at).toLocaleString()}, {data.last.scanned.toLocaleString()} transactions. It checks again every hour.
                    </p>
                  ) : null}
                  <p>
                    {data.alerts.on === false ? "Alerts for these are off. " : "Which alerts go out, and where: "}
                    <Link to="/settings/alerts" className="text-foreground underline-offset-4 hover:underline">
                      Settings, Alerts
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </PageContent>
      {adding ? (
        <ManualDialog
          currency={currency}
          busy={busy !== null}
          onClose={() => setAdding(false)}
          onSave={(input) => act("manual", () => subscriptionsApi.addManual(input), `${input.name} added.`).then(() => setAdding(false))}
        />
      ) : null}
    </Page>
    </div>
  );
}

/**
 * This month so far, the page's hero (owner, 10-02 canvas): what is still to pay by the month's end at the
 * usual amount, the bar of paid and to pay, what was paid, then the totals (a month, a year, how many
 * repeat). The figures are lib/bill-calendar.ts's, counted like the Monthly budget card's "bills still
 * due". Paid is green in both looks (Bronze gives progress its own colour). The button lists both.
 */
function ThisMonth({
  items,
  currency,
  totals,
}: {
  items: Stream[];
  currency: string;
  totals: { monthly: number; yearly: number; repeating: number; stopped: number };
}) {
  const phone = useIsMobileViewport();
  const today = ymd(new Date());
  const m = useMemo(() => ({ ...billMonth(items, today), month: new Date().toLocaleDateString(undefined, { month: "long" }), today }), [items, today]);
  const byKey = useMemo(() => new Map(items.map((s) => [s.key, s])), [items]);
  const whole = Math.max(0, m.paidTotal) + m.leftTotal;
  const pct = whole > 0 ? Math.min(100, (Math.max(0, m.paidTotal) / whole) * 100) : 0;

  const line = (b: BillDue, i: number, still: boolean) => {
    const s = byKey.get(b.key);
    // Not charged on its day yet (often still pending at the bank): said like the row says it.
    const was = still && (b.late || b.date < m.today) ? (b.late ?? b.date) : null;
    return (
      <div key={`${b.key}-${b.date}-${i}`} className="flex items-center gap-2 py-1">
        {s ? <StreamLogo s={s} className="h-5 w-5 text-[9px]" /> : null}
        <span className="min-w-0 flex-1 truncate text-xs">{b.name}</span>
        <span className="text-muted-foreground shrink-0 text-[11px]">{was ? `Was due ${shortDate(was)}` : shortDate(b.date)}</span>
        <span className="w-20 shrink-0 text-right text-xs tabular-nums">
          <PrivacyAmount value={b.amount} currency={currency} />
        </span>
      </div>
    );
  };

  const tiles: { label: string; value: ReactNode; sub?: string }[] = [
    { label: "A month", value: <PrivacyAmount value={totals.monthly} currency={currency} /> },
    { label: "A year", value: <PrivacyAmount value={totals.yearly} currency={currency} /> },
    { label: "Repeating", value: <span>{totals.repeating}</span>, sub: totals.stopped ? `${totals.stopped} stopped` : undefined },
  ];

  return (
    <section
      data-m="hero"
      aria-label={m.month}
      className="flex flex-col gap-3 rounded-[20px] bg-[var(--m-mint)] px-5 py-4 text-[var(--m-mint-ink)] max-md:gap-1.5 max-md:px-3 max-md:py-2.5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-medium">{m.month}</h2>
          <span className="text-[12.5px] tabular-nums text-[var(--m-mint-muted)] max-md:text-xs">
            {m.paidCount} of {m.count} paid
          </span>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="min-h-8 shrink-0 rounded-full bg-[var(--m-mint-tile)] px-3 text-[12.5px] text-[var(--m-mint-ink)] hover:opacity-85 max-md:min-h-7 max-md:bg-transparent max-md:px-0"
              aria-label={`${m.month}: what was paid and what is left to pay`}
            >
              {phone ? "This month" : "What was paid, what is left"}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-3">
            <div className="text-muted-foreground flex items-baseline justify-between text-[11px] font-medium">
              <span>Paid in {m.month}</span>
              <span className="text-foreground tabular-nums">
                <PrivacyAmount value={m.paidTotal} currency={currency} />
              </span>
            </div>
            {m.paid.length ? m.paid.map((b, i) => line(b, i, false)) : <p className="text-muted-foreground py-1 text-xs">Nothing yet.</p>}
            <div className="text-muted-foreground mt-2 flex items-baseline justify-between border-t pt-2 text-[11px] font-medium">
              <span>Left to pay by {shortDate(m.end)}</span>
              <span className="text-foreground tabular-nums">
                <PrivacyAmount value={m.leftTotal} currency={currency} />
              </span>
            </div>
            {m.left.length ? m.left.map((b, i) => line(b, i, true)) : <p className="text-muted-foreground py-1 text-xs">All paid for {m.month}.</p>}
            <p className="text-muted-foreground mt-2 border-t pt-2 text-[11px] leading-snug">
              Your part of a shared bill. Still to pay is the usual amount; a bill paid from your mortgage escrow is in the
              mortgage payment.
            </p>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span data-m-num={phone ? "big" : "hero"} className="text-[38px] font-medium leading-[1.1] tracking-[-0.03em] tabular-nums max-md:text-[30px]">
          <PrivacyAmount value={m.leftTotal} currency={currency} />
        </span>
        <span className="text-[13.5px] text-[var(--m-mint-muted)] max-md:text-[12.5px]">
          {phone ? "left to pay" : `left to pay by ${shortDate(m.end)}`}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 max-md:gap-1">
        <div
          role="img"
          aria-label={`${pct.toFixed(0)}% of ${m.month}'s bills paid`}
          className="flex h-3.5 gap-[3px] max-md:h-3"
        >
          <span className="h-full rounded-[6px] bg-[var(--m-done)]" style={{ width: `${pct}%`, minWidth: pct > 0 ? 4 : 0 }} />
          <span className="h-full flex-1 rounded-[6px] border border-[var(--m-mint-line)] bg-[var(--m-mint-tile)]" />
        </div>
        <span className="text-xs tabular-nums text-[var(--m-mint-muted)]">
          <PrivacyAmount value={m.paidTotal} currency={currency} /> paid
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {tiles.map((tile) => (
          <div key={tile.label} className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-[var(--m-mint-tile)] px-3 py-2.5 max-md:px-2 max-md:py-1.5">
            <span className="truncate text-[12.5px] text-[var(--m-mint-muted)] max-md:text-[11.5px]">{tile.label}</span>
            <span data-m-num="tile" className="truncate text-[17px] font-medium tabular-nums max-md:text-[15px]">
              {tile.value}
              {phone && tile.sub ? <span className="ml-1 text-[11.5px] font-normal text-[var(--m-mint-muted)]" data-m-unit>{tile.sub}</span> : null}
            </span>
            {!phone ? <span className="text-xs text-[var(--m-mint-muted)]">{tile.sub ?? "\u00a0"}</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

/** A list in its own Meadow card: the title, a short line about it and its monthly total inside the card. */
function Section({
  title,
  blurb,
  aside,
  note,
  children,
}: {
  title: string;
  blurb?: string;
  aside?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      data-m="card"
      aria-label={title}
      className="min-w-0 rounded-[20px] border border-[var(--m-line)] bg-[var(--m-surface)] px-[18px] pb-2 pt-3.5 max-md:px-3 max-md:pb-1 max-md:pt-2.5"
    >
      <div className="flex items-baseline justify-between gap-3 pb-1.5">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 className="text-sm font-medium">{title}</h2>
          {blurb ? <span className="hidden truncate text-[12.5px] text-[var(--m-muted)] sm:inline">{blurb}</span> : null}
        </div>
        {aside ? <span className="shrink-0 whitespace-nowrap text-[13px] tabular-nums text-[var(--m-muted)] [&>span:first-child]:font-medium [&>span:first-child]:text-[var(--m-ink)]">{aside}</span> : null}
      </div>
      <div className="flex flex-col">{children}</div>
      {note ? (
        <p className="mb-1.5 mt-1 flex gap-2 rounded-[14px] bg-[var(--m-sand)] px-2.5 py-2 text-xs leading-snug text-[var(--m-ink-2)]">
          <Icons.Home className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--m-muted)]" aria-hidden />
          <span>{note}</span>
        </p>
      ) : null}
    </section>
  );
}

/** What one charge of it usually costs, in what the bank charges it in: dong for one paid from ACB or MB
 *  (owner, 10-03), with no cents; the dollars, which the totals add up, then sit under it on the row. */
function OwnAmount({ s, currency }: { s: Stream; currency: string }) {
  return s.native && s.currency ? <PrivacyAmount value={s.native.usual} currency={s.currency} /> : <PrivacyAmount value={s.usual} currency={currency} />;
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
  const [marking, setMarking] = useState(false);
  const phone = useIsMobileViewport();
  const st = statusLabel(s);
  const category = useStreamCategory(s.categoryId);
  const { data } = useSubscriptions();
  const manual = s.manualId ? data?.manual.find((m) => m.id === s.manualId) : undefined;
  // One window for every row (owner, 10-01: "why the edit modal look different between each
  // subscriptions"): a hand-added one shows its amount and words in it too.
  const openEdit = () => setEditing(true);
  // Still going, the owner says (paid from a card the app cannot see): back on the list until a new
  // charge comes in; undone the same way (owner, 10-01: "enable reactivate stopped bills").
  const setActive = (active: boolean) =>
    act(s.key, () => subscriptionsApi.update(s.key, { active }), active ? `${s.name} is active again.` : `${s.name} is stopped again.`);

  return (
    // A click anywhere on the row opens it; the menu is the keyboard's way in (no button inside a button).
    <div
      onClick={openEdit}
      className={cn(
        "-mx-2 cursor-pointer rounded-xl border-t border-[var(--m-line-soft)] px-2 py-2.5 transition-colors first:border-t-0 hover:bg-[var(--m-tile)] max-md:py-2",
        s.status === "stopped" && "opacity-70",
      )}
    >
      <div className="flex items-center gap-3">
        <StreamLogo s={s} className="h-9 w-9 text-sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {s.escrow ? (
              // No bank charge names it: nothing to list in the transactions.
              <span className="text-sm font-medium">{s.name}</span>
            ) : (
              <Link to={transactionsHref(s)} onClick={(e) => e.stopPropagation()} className="text-sm font-medium underline-offset-4 hover:underline">
                {s.name}
              </Link>
            )}
            {/* A reminder is on (owner, 10-01: "show a notification bell next to a subscription whenever a reminder is turned on"). */}
            {s.remindBefore || (s.reminder && s.reminder >= new Date().toISOString().slice(0, 10)) ? (
              <span
                title={s.remindBefore ? `Reminder ${s.remindBefore} day${s.remindBefore === 1 ? "" : "s"} before each charge` : `Reminder on ${day(s.reminder!)}`}
                className="inline-flex"
              >
                <Icons.Bell className="h-3.5 w-3.5 shrink-0 text-[var(--m-warn-line)]" aria-label="Reminder on" />
              </span>
            ) : null}
            {/* Tracked by Owly (owner, 10-01: "add a badge showing an item is being tracked by owly"): Owly's own
                mark and name; the amount on the right already says when only the owner's part counts. */}
            {s.shared ? (
              <span
                title={s.sharedOn ? `Shared in Owly as ${s.shared.service}: only your part counts here` : `Shared in Owly as ${s.shared.service}`}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--m-info-soft)] px-2 py-0.5 text-[10.5px] text-[var(--m-info-ink)]"
              >
                <OwlyMark className="h-3 w-3" />
                Owly
              </span>
            ) : null}
            {s.escrow ? (
              <span
                title={s.escrow.mortgageName ? `Paid from your ${s.escrow.mortgageName} mortgage escrow` : "Paid from your mortgage escrow"}
                className="shrink-0 rounded-full bg-[var(--m-tile)] px-2 py-0.5 text-[10.5px] text-[var(--m-ink-2)]"
              >
                In mortgage
              </span>
            ) : null}
            {/* Active is a green circle with a check (owner, 10-01); Stopped a grey pause; the rest keep their words.
                The old small check ("Looks right" ticked) is gone: two checks side by side read the same. */}
            {st.label === "Active" ? (
              // The green is fixed: the dark theme turns emerald utilities white, and this one must stay green.
              <span title="Active" aria-label="Active" className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--m-done)]">
                <Icons.Check className="h-2.5 w-2.5 text-[var(--m-on-done)]" strokeWidth={3.5} />
              </span>
            ) : s.status === "stopped" ? (
              // Stopped: a grey pause, the same badge as Active (owner, 10-01: "stopped just show a grey pause icon").
              <span title="Stopped" aria-label="Stopped" className="bg-muted-foreground/70 inline-flex h-4 w-4 shrink-0 items-center justify-center gap-[2px] rounded-full">
                <span className="bg-background h-[7px] w-[2px] rounded-[1px]" />
                <span className="bg-background h-[7px] w-[2px] rounded-[1px]" />
              </span>
            ) : (
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10.5px]", TONE[st.tone])}>{st.label}</span>
            )}
          </div>
          {phone ? (
            <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs leading-snug">
              {category ? <StreamCategory categoryId={s.categoryId} iconOnly className="shrink-0" /> : null}
              <span className="truncate">
                {EVERY_SHORT[s.every]} · {phoneDue(dueLabel(s))}
              </span>
            </div>
          ) : (
          <div className="text-muted-foreground text-xs leading-snug">
            {/* Its category, the app's own icon and colour (owner, 10-02). */}
            {category ? (
              <>
                <StreamCategory categoryId={s.categoryId} className="max-w-[12rem]" />
                {" · "}
              </>
            ) : null}
            {s.escrow?.company ? `${s.escrow.company} · ` : ""}
            {EVERY_LABELS[s.every]}
            {s.everySetByOwner ? " (your choice)" : ""} · {dueLabel(s)}
            {s.nextSetByOwner ? " (your date)" : ""}
            {s.reactivated ? " · Reactivated by you" : ""}
            {s.remindBefore
              ? ` · Reminder ${s.remindBefore} day${s.remindBefore === 1 ? "" : "s"} before`
              : s.reminder
                ? ` · Reminder ${day(s.reminder)}`
                : ""}
            {s.escrow
              ? ` · paid by ${s.escrow.mortgageName ?? "your lender"} from escrow`
              : s.count
                ? ` · ${s.count} charge${s.count === 1 ? "" : "s"}`
                : " · not charged yet"}
          </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-medium tabular-nums">
            {s.variable && !s.sharedOn ? <span className="text-muted-foreground font-normal">about </span> : null}
            {s.sharedOn && s.shared?.latest ? (
              <PrivacyAmount value={s.shared.latest.mine} currency={currency} />
            ) : (
              <OwnAmount s={s} currency={currency} />
            )}
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
              was {s.native?.previous != null && s.currency ? <PrivacyAmount value={s.native.previous} currency={s.currency} /> : <PrivacyAmount value={s.previousAmount} currency={currency} />}
            </div>
          ) : s.native ? (
            <div className="text-muted-foreground text-[11px] tabular-nums">
              <PrivacyAmount value={s.usual} currency={currency} />
            </div>
          ) : null}
        </div>
        {/* Three dots, not a pencil (owner, 10-01): Edit, and Reactivate on a stopped one. Its clicks stay
            here: the menu is portalled, but React still bubbles them to the row, which opens Edit. */}
        <div className="shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`More for ${s.name}`} disabled={busy === s.key}>
                {busy === s.key ? <Icons.Spinner className="h-4 w-4 animate-spin" /> : <Icons.MoreVertical className="h-4 w-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={openEdit}>
                <Icons.Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              {/* Paid where the app cannot see it (owner, 10-03): a hand-added one only, its own record. */}
              {manual ? (
                <DropdownMenuItem disabled={busy !== null} onSelect={() => setMarking(true)}>
                  <Icons.Check className="mr-2 h-4 w-4" />
                  Mark paid
                </DropdownMenuItem>
              ) : null}
              {s.status === "stopped" ? (
                <DropdownMenuItem disabled={busy !== null} onSelect={() => setActive(true)}>
                  <Icons.PlayCircle className="mr-2 h-4 w-4" />
                  Reactivate
                </DropdownMenuItem>
              ) : s.reactivated ? (
                <DropdownMenuItem disabled={busy !== null} onSelect={() => setActive(false)}>
                  <Icons.PauseCircle className="mr-2 h-4 w-4" />
                  Mark as stopped
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {editing ? (
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <EditStreamDialog s={s} manual={manual} currency={currency} busy={busy !== null} act={act} onClose={() => setEditing(false)} />
        </div>
      ) : null}
      {marking && manual ? (
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <MarkPaidDialog s={s} manualId={manual.id} currency={currency} busy={busy !== null} act={act} onClose={() => setMarking(false)} />
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
  // A date typed here stays put; otherwise it follows How often: one period after the last charge, as
  // the list will show it once saved (owner, 10-03: "changing the frequency doesnt change the next
  // charge date"). A hand-added or reactivated one goes on to the charge still to come, as the list does.
  const [nextTyped, setNextTyped] = useState(false);
  const changeEvery = (v: Every) => {
    setEvery(v);
    if (nextTyped || s.escrow || !s.last) return;
    setNextDate(v === s.every ? s.next : nextChargeAfter(s.last.date, v, !!manual || !!s.reactivated));
  };
  const [remind, setRemind] = useState(s.remindBefore ? String(s.remindBefore) : "off");
  const [confirmed, setConfirmed] = useState(!!s.confirmed);
  const [sendTotal, setSendTotal] = useState(!!s.sendTotal);
  const [excludeFromForecast, setExcludeFromForecast] = useState(!!s.excludeFromForecast);
  const [amount, setAmount] = useState(manual ? String(manual.amount) : "");
  // A hand-added one's amount is in its own currency (none set: the base one, as it always was).
  const [cur, setCur] = useState(manual?.currency || currency);
  const currencies = useBillCurrencies(currency);
  const [words, setWords] = useState(manual ? manual.words.join(", ") : "");
  const [sharing, setSharing] = useState(false);
  const [marking, setMarking] = useState(false);
  const [confirmHide, setConfirmHide] = useState(false);
  const escrow = s.escrow;
  // The company whose logo it shows: for the ones no charge names (escrow's, hand-added).
  const [company, setCompany] = useState<string | null>(manual ? manual.merchantId : escrow ? s.merchantId : null);
  const [pickingCompany, setPickingCompany] = useState(false);
  const qc = useQueryClient();
  // Its charges, newest first, with the ones taken out by hand (unticked). A tick change is saved with
  // the rest (owner, 10-01: "see all linked transactions in the subscription and a check box to
  // manually exclude (will by pass all rules)").
  // A payment from another currency shows what was really paid (the loan's dollars from Chase).
  const charges = [
    ...(s.charges ?? [])
      .filter((c) => !c.outside)
      .map((c) => ({ ...c, notes: c.notes ?? "", accountId: c.accountId ?? null, wasOut: false, own: c.paid ?? (c.native != null && s.currency ? { amount: c.native, currency: s.currency } : null) })),
    ...(s.excluded ?? []).map((c) => ({ ...c, wasOut: true, own: c.native != null && c.currency ? { amount: c.native, currency: c.currency } : null })),
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
        merchantId: company,
        // Sent once it has one or the owner picks one: an older one keeps finding its currency from its charges.
        ...(manual.currency || cur !== currency ? { currency: cur } : {}),
      }
    : null;
  // Changed against what the window opened with (its date may come from the charges, not the entry).
  const [shown] = useState(() => JSON.stringify([name, words, amount, cur, every, nextDate, group, company]));
  const ownChanged = !!manual && JSON.stringify([name, words, amount, cur, every, nextDate, group, company]) !== shown;
  // Marked paid where the app cannot see it, newest first.
  const marks = (s.charges ?? []).filter((c) => c.outside).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const markOf = (id: string) => id.replace(/^paid:/, "");
  if (!manual) {
    if (name.trim() && name.trim() !== s.name) patch.name = name.trim();
    if (group !== s.group) patch.group = group;
    if (every !== s.every) patch.every = every;
    if (nextTyped && nextDate && nextDate !== s.next) patch.nextDate = nextDate;
    // A date set before on the old rhythm: the new rhythm's date from its charges, as shown, takes over.
    else if (!nextTyped && every !== s.every && s.nextSetByOwner && s.last) patch.nextDate = null;
    if (escrow && company !== s.merchantId) patch.merchantId = company;
  }
  if ((remind === "off" ? null : Number(remind)) !== (s.remindBefore ?? null)) patch.remindBefore = remind === "off" ? null : Number(remind);
  if (confirmed !== !!s.confirmed) patch.confirmed = confirmed;
  if (excludeFromForecast !== !!s.excludeFromForecast) patch.excludeFromForecast = excludeFromForecast;
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
                  {escrow ? " · paid from escrow" : s.count ? ` · ${s.count} charge${s.count === 1 ? "" : "s"}` : ""}
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
              {escrow || manual ? (
                <Field label="Company" foot={escrow ? "Your insurer or the one it is paid to: its logo shows here." : "Its logo shows here."}>
                  <CompanyButton merchantId={company} disabled={busy} onClick={() => setPickingCompany(true)} />
                </Field>
              ) : null}
              {manual ? (
                <>
                  <Field label="Amount" htmlFor="edit-amount">
                    <AmountInCurrency id="edit-amount" amount={amount} setAmount={setAmount} currency={cur} setCurrency={setCur} currencies={currencies} />
                  </Field>
                  <Field label="Words to look for" htmlFor="edit-words" foot="Separate several with commas.">
                    <Input id="edit-words" value={words} onChange={(e) => setWords(e.target.value)} placeholder={name} autoComplete="off" />
                  </Field>
                </>
              ) : null}
              <Field label="How often"
                foot={escrow ? "The year's cost is spread over it." : manual ? "As you set it." : s.everySetByOwner ? (
                  <button type="button" className="hover:text-foreground underline-offset-4 hover:underline" disabled={busy}
                    onClick={() => act(s.key, () => subscriptionsApi.update(s.key, { every: null }), "Back to what its charges show.").then(onClose)}>
                    Use what its charges show
                  </button>
                ) : "As its charges show."}>
                <FrequencyPicker value={every} onChange={changeEvery} disabled={busy || (s.status === "stopped" && !manual)} />
              </Field>
              <Field label={escrow ? "Next date" : "Next charge"} htmlFor="edit-next"
                foot={manual ? "For your records: no transaction is made." : s.nextSetByOwner ? (
                  <button type="button" className="hover:text-foreground underline-offset-4 hover:underline" disabled={busy}
                    onClick={() => act(s.key, () => subscriptionsApi.update(s.key, { nextDate: null }), escrow ? "Back to the end of the year." : "Back to the date from its charges.").then(onClose)}>
                    {escrow ? "Use the end of the year" : "Use the date from its charges"}
                  </button>
                ) : escrow ? "Its renewal or due date, for your records and the reminder." : "For your records: no transaction is made."}>
                <Input id="edit-next" type="date" value={nextDate} onChange={(e) => { setNextDate(e.target.value); setNextTyped(true); }} onClick={openDatePicker} disabled={s.status === "stopped" && !manual} />
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
              {escrow ? null : (
                <Field label="Looks right" foot="It really is a subscription or bill.">
                  <div className="flex h-9 items-center">
                    <Switch checked={confirmed} onCheckedChange={setConfirmed} aria-label="Looks right" />
                  </div>
                </Field>
              )}
              {escrow ? null : (
                <Field label="Exclude from forecast" foot="A fixed bill: the Monthly budget takes it off the budget as it is. Spending still counts it.">
                  <div className="flex h-9 items-center">
                    <Switch checked={excludeFromForecast} onCheckedChange={setExcludeFromForecast} aria-label="Exclude from forecast" />
                  </div>
                </Field>
              )}
            </div>

            {escrow ? <EscrowBox s={s} currency={currency} /> : null}

            {escrow ? null : (
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
            )}

            {/* Paid where the app cannot see it (owner, 10-03): cash, a bank that is not linked. */}
            {manual ? (
              <div className="rounded-lg border">
                <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">Paid elsewhere</div>
                    <div className="text-muted-foreground text-xs leading-snug">Cash or a bank the app can&rsquo;t see. No transaction is made.</div>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="shrink-0 self-start" disabled={busy} onClick={() => setMarking(true)}>
                    <Icons.Check className="mr-1 h-3.5 w-3.5" />
                    Mark paid
                  </Button>
                </div>
                {marks.length ? (
                  <div className="max-h-[30dvh] divide-y overflow-y-auto border-t">
                    {marks.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 px-3 py-2">
                        <span className="min-w-0 flex-1 truncate text-sm">{day(c.date)}</span>
                        <span className="shrink-0 text-sm tabular-nums">
                          {c.native != null && s.currency ? <PrivacyAmount value={c.native} currency={s.currency} /> : <PrivacyAmount value={c.amount} currency={currency} />}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          disabled={busy}
                          aria-label={`Undo paid on ${day(c.date)}`}
                          title="Undo"
                          onClick={() => act(s.key, () => subscriptionsApi.unmarkPaid(manual.id, markOf(c.id)), "Taken off.")}
                        >
                          <Icons.Close className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

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
                    const why = [
                      "credit" in c && c.credit ? "credit" : null,
                      c.wasOut ? "left out by you" : linked.has(c.id) ? "linked by you" : ruled.has(c.id) ? "by a rule" : null,
                    ].filter(Boolean).join(", ") || null;
                    return (
                      <label key={c.id} className={cn("flex cursor-pointer items-center gap-3 px-3 py-2", isOut && "opacity-60")}>
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate text-sm", isOut && "line-through")}>{c.notes || "No description"}</span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {[day(c.date), c.accountId ? accountName.get(c.accountId) : null, why].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm tabular-nums">
                          {c.own ? <PrivacyAmount value={Math.abs(c.own.amount)} currency={c.own.currency} /> : <PrivacyAmount value={Math.abs(c.amount)} currency={currency} />}
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
                    <div className={cn("text-xs leading-snug", owly?.error ? "text-[var(--m-warn)]" : "text-muted-foreground")}>
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

          {pickingCompany ? (
            <CompanyPicker
              merchantId={company}
              onPick={(m) => {
                setCompany(m?.id ?? null);
                setPickingCompany(false);
              }}
              onClose={() => setPickingCompany(false)}
            />
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            {confirmHide ? (
              <Button type="button" variant="destructive" disabled={busy}
                onClick={() =>
                  manual
                    ? act(s.key, () => subscriptionsApi.removeManual(manual.id), `${s.name} removed.`).then(onClose)
                    : act(s.key, () => subscriptionsApi.update(s.key, { hidden: true }), escrow ? `${s.name} hidden.` : `${s.name} marked not a subscription.`).then(onClose)
                }>
                {manual ? "Yes, remove it" : escrow ? "Yes, hide it" : "Yes, not a subscription"}
              </Button>
            ) : (
              <Button type="button" variant="ghost" className="text-destructive" disabled={busy} onClick={() => setConfirmHide(true)}>
                {manual ? "Remove" : escrow ? "Hide it" : "Not a subscription"}
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
      {marking && manual ? <MarkPaidDialog s={s} manualId={manual.id} currency={currency} busy={busy} act={act} onClose={() => setMarking(false)} /> : null}
    </>
  );
}

/** Where an escrow bill's figures come from: what each mortgage payment puts aside now, and what
 *  escrow paid each year by the lender's Form 1098, as kept on the Rental page. */
function EscrowBox({ s, currency }: { s: Stream; currency: string }) {
  const e = s.escrow!;
  const lender = e.mortgageName ?? "Your lender";
  return (
    <div className="rounded-lg border">
      <div className="border-b px-3 py-2.5">
        <div className="text-sm font-medium">Paid from the mortgage</div>
        <div className="text-muted-foreground text-xs leading-snug">
          {lender} pays it out of escrow, so no bank charge names it. It is part of each mortgage payment and counted there, not
          again here.
        </div>
      </div>
      <div className="divide-y">
        {e.monthlyNow ? (
          <div className="flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-sm">Each payment now</span>
              <span className="text-muted-foreground block text-xs">{e.estimated ? "Estimate from a statement" : "Escrow"}</span>
            </span>
            <span className="shrink-0 text-sm tabular-nums">
              <PrivacyAmount value={e.monthlyNow} currency={currency} />
            </span>
          </div>
        ) : null}
        {e.years.map((y) => (
          <div key={y.year} className="flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-sm">{y.year}</span>
              <span className="text-muted-foreground block text-xs">Paid in the year, Form 1098</span>
            </span>
            <span className="shrink-0 text-sm tabular-nums">
              <PrivacyAmount value={y.amount} currency={currency} />
            </span>
          </div>
        ))}
      </div>
      <div className="border-t px-3 py-2 text-xs">
        <Link to={rentalSettingsHref(e)} className="text-foreground underline-offset-4 hover:underline">
          Change on the Rental page
        </Link>
        <span className="text-muted-foreground"> · add each new 1098 there in January.</span>
      </div>
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

/** Add one by hand; changing it later is the same window as every other row (EditStreamDialog). */
function ManualDialog({
  currency,
  busy,
  onClose,
  onSave,
}: {
  currency: string;
  busy: boolean;
  onClose: () => void;
  onSave: (input: ManualInput) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [words, setWords] = useState("");
  const [amount, setAmount] = useState("");
  const [cur, setCur] = useState(currency);
  const currencies = useBillCurrencies(currency);
  const [every, setEvery] = useState<Every>("year");
  const [nextDate, setNextDate] = useState("");
  const [group, setGroup] = useState<StreamGroup>("subscriptions");
  const ready = name.trim().length > 0 && Number(amount) > 0;
  const submit = () =>
    onSave({
      name: name.trim(),
      words: (words || name).split(",").map((w) => w.trim()).filter(Boolean),
      amount: Number(amount),
      every,
      nextDate: nextDate || null,
      group,
      // In another currency (a loan in Vietnam, in dong): its amount is in it.
      ...(cur !== currency ? { currency: cur } : {}),
    });

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
            {/* With a currency to pick the box needs the whole row (dong runs to eight digits). */}
            <div className={cn("space-y-1.5", currencies.length > 1 && "col-span-2")}>
              <Label htmlFor="sub-amount">Amount</Label>
              <AmountInCurrency id="sub-amount" amount={amount} setAmount={setAmount} currency={cur} setCurrency={setCur} currencies={currencies} placeholder={cur === currency ? "139.00" : undefined} />
            </div>
            <div className="space-y-1.5">
              <Label>How often</Label>
              <FrequencyPicker value={every} onChange={(v) => {
                setEvery(v);
                setNextDate(nextChargeAfter(localToday(), v, true));
              }} disabled={busy} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sub-next">Next charge</Label>
              <Input id="sub-next" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} onClick={openDatePicker} />
            </div>
            <div className={cn("space-y-1.5", currencies.length > 1 && "col-span-2")}>
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
