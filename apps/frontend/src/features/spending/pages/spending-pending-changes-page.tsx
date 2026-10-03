// money-hub patch: Pending vs posted (lib/pending-changes.ts). Each bank charge as it was while
// pending beside what it posted as (owner, 2026-10-01: "track what changed between pending and after
// its posted ... tips for restaurants or other suspicious charge from a merchant that im not aware
// off"). Read only; the alert for it is on Settings, Alerts.
// In the Spending dashboard's look, Meadow or Bronze Titanium per mode (owner, 10-02: "redesign the
// pending vs posted page to match the new design systems"): what was added is the hero, the alerts
// beside it, and the list as Pending | Posted | Change columns (two-line rows on a phone).
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { Icons, Page, PageContent, PageHeader, PrivacyAmount } from "@wealthfolio/ui";

import { useAccounts } from "@/hooks/use-accounts";
import { useIsMobileViewport } from "@/hooks/use-platform";
import type { Account } from "@/lib/types";
import { cn } from "@/lib/utils";

import { AccountLogo } from "../components/account-mark";
import { MerchantLogo } from "../components/merchant-logo";
import { useDashboardSkins } from "../lib/dashboard-skin";
import { useMerchantFor } from "../lib/merchants";
import { changePct, isChanged, usePendingChanges, type PendingAlerts, type PendingChange } from "../lib/pending-changes";

type Filter = "changed" | "posted" | "dropped" | "pending";

const FILTERS: { key: Filter; label: string; empty: string }[] = [
  { key: "changed", label: "Changed", empty: "No charge has posted at another amount yet." },
  { key: "posted", label: "Posted", empty: "Nothing that was pending has posted yet." },
  { key: "dropped", label: "Never posted", empty: "Every pending charge seen so far has posted." },
  { key: "pending", label: "Pending", empty: "Nothing is pending right now." },
];

const keep = (f: Filter) => (c: PendingChange) =>
  f === "changed" ? isChanged(c) : f === "posted" ? c.status === "posted" : c.status === f;

const sum = (list: PendingChange[], value: (c: PendingChange) => number) => list.reduce((s, c) => s + value(c), 0);

// The year only when it is not this year ("Oct 1", "Dec 30, 2025"), like the Transactions list.
const thisYear = new Date().getFullYear();
const day = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === thisYear ? undefined : "numeric" });
};

/** Desktop columns: Charge | Account | Pending | Posted | Change. The account is its logo alone under 1280px. */
const COLUMNS =
  "md:grid md:grid-cols-[minmax(0,1fr)_1.5rem_5.5rem_5.5rem_8.5rem] md:gap-x-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_6rem_6rem_9rem]";

export default function SpendingPendingChangesPage() {
  const navigate = useNavigate();
  const skins = useDashboardSkins();
  const phone = useIsMobileViewport();
  const [params] = useSearchParams();
  const focus = params.get("id");
  const { data, isLoading } = usePendingChanges();
  const items = useMemo(() => data?.items ?? [], [data]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, items.filter(keep(f.key)).length])) as Record<Filter, number>, [items]);
  const focused = focus ? items.find((c) => c.id === focus) : undefined;
  const [filter, setFilter] = useState<Filter>("changed");
  // Opened from a tag in the list or an alert: show the tab that entry is on.
  useEffect(() => {
    if (!focused) return;
    setFilter(isChanged(focused) ? "changed" : focused.status === "posted" ? "posted" : focused.status);
  }, [focused]);
  useEffect(() => {
    if (focus) document.getElementById(`pc-${focus}`)?.scrollIntoView({ block: "center" });
  }, [focus, filter, items.length]);

  const { accounts } = useAccounts({ filterActive: false });
  const accountById = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts]);
  const shown = items.filter(keep(filter));
  const currency = items[0]?.currency || "USD";

  return (
    <div className="meadow min-h-screen" data-mdash data-light-skin={skins.light} data-dark-skin={skins.dark}>
      <Page>
        <PageHeader
          heading="Pending vs posted"
          // A phone keeps the title alone (it cut the line to "What a charge was while pending, and …").
          text={phone ? undefined : "What a charge was while pending, and what it posted as. Tips and other changes show up here."}
          onBack={() => {
            if (window.history.length > 1) navigate(-1);
            else navigate("/activities?tab=spending");
          }}
        />
        <PageContent>
          {isLoading ? (
            <p className="text-sm text-[var(--m-muted)]">Reading the bank entries.</p>
          ) : !data ? (
            <p className="text-sm text-[var(--m-down)]">The money app helper did not answer. Try again in a minute.</p>
          ) : (
            // What was added on top, the alerts beside it, the list under both (a phone: hero, list, alerts).
            // overflow visible: at 1024 and below the app clips every grid (globals.css).
            <div className="grid items-stretch gap-3.5 max-md:gap-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" style={{ overflowX: "visible" }}>
              <Hero items={items} since={data.since} currency={currency} phone={phone} />
              <section
                data-m="card"
                aria-label="Charges"
                className="min-w-0 rounded-[20px] border border-[var(--m-line)] bg-[var(--m-surface)] px-[18px] pb-2 pt-3.5 max-md:px-3 max-md:pb-1 max-md:pt-2.5 lg:col-span-2 lg:row-start-2"
              >
                <Tabs filter={filter} counts={counts} onChange={setFilter} />
                {shown.length ? (
                  <div role="table" aria-label={FILTERS.find((f) => f.key === filter)?.label} className="mt-2 max-md:mt-1.5">
                    {phone ? null : (
                      <div role="row" className={cn(COLUMNS, "-mx-2 border-b border-[var(--m-line-soft)] px-2 pb-1.5 text-xs text-[var(--m-muted)]")}>
                        <span role="columnheader">Charge</span>
                        {/* Under 1280px the column is the logo alone: the word stays for screen readers, the cell for the grid. */}
                        <span role="columnheader">
                          <span className="max-xl:sr-only">Account</span>
                        </span>
                        <span role="columnheader" className="text-right">
                          Pending
                        </span>
                        <span role="columnheader" className="text-right">
                          Posted
                        </span>
                        <span role="columnheader" className="text-right">
                          Change
                        </span>
                      </div>
                    )}
                    {shown.map((c) => (
                      <ChangeRow key={c.id} c={c} account={accountById.get(c.accountId)} focused={c.id === focus} phone={phone} />
                    ))}
                  </div>
                ) : (
                  <div className="px-2 py-8 text-center max-md:py-4">
                    <p className="text-sm">{FILTERS.find((f) => f.key === filter)?.empty}</p>
                    {filter === "changed" && counts.pending ? (
                      <p className="mt-1 text-xs text-[var(--m-muted)]">
                        {counts.pending} pending now. Each one is compared with what it posts as.
                      </p>
                    ) : null}
                  </div>
                )}
              </section>
              <AlertsCard alerts={data.alerts} phone={phone} />
            </div>
          )}
        </PageContent>
      </Page>
    </div>
  );
}

/**
 * The page's hero: what posted on top of the pending amounts, the posted charges as one bar (higher,
 * lower, the same), then what posted lower, what is pending now and what never posted. Counts live in the
 * bar's legend and the tabs, money here.
 */
function Hero({ items, since, currency, phone }: { items: PendingChange[]; since: string | null; currency: string; phone: boolean }) {
  const posted = items.filter((c) => c.status === "posted");
  const higher = posted.filter((c) => isChanged(c) && (c.diff ?? 0) > 0);
  const lower = posted.filter((c) => isChanged(c) && (c.diff ?? 0) < 0);
  const same = posted.length - higher.length - lower.length;
  const pending = items.filter((c) => c.status === "pending");
  const dropped = items.filter((c) => c.status === "dropped");
  const added = sum(higher, (c) => c.diff ?? 0);

  const parts = [
    { key: "higher", n: higher.length, label: "higher", className: "bg-[var(--m-higher)]" },
    { key: "lower", n: lower.length, label: "lower", className: "bg-[var(--m-up)]" },
    { key: "same", n: same, label: "same", className: "border border-[var(--m-mint-line)] bg-[var(--m-mint-tile)]" },
  ];
  const tiles: { label: string; value: number; sub: string }[] = [
    { label: "Posted lower", value: Math.abs(sum(lower, (c) => c.diff ?? 0)), sub: "less than pending" },
    { label: "Pending now", value: sum(pending, (c) => Math.abs(c.lastPending)), sub: "on hold" },
    { label: "Never posted", value: sum(dropped, (c) => Math.abs(c.lastPending)), sub: "dropped" },
  ];

  return (
    <section
      data-m="hero"
      aria-label="Added after pending"
      className="flex min-w-0 flex-col gap-3 rounded-[20px] bg-[var(--m-mint)] px-5 py-4 text-[var(--m-mint-ink)] max-md:gap-1.5 max-md:px-3 max-md:py-2.5 lg:col-start-1 lg:row-start-1"
    >
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-medium">{since ? `Since ${day(since)}` : "So far"}</h2>
        <span className="text-[12.5px] text-[var(--m-mint-muted)] max-md:text-xs">
          {posted.length} posted{pending.length ? `, ${pending.length} pending` : ""}
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span data-m-num={phone ? "big" : "hero"} className="text-[38px] font-medium leading-[1.1] tracking-[-0.03em] tabular-nums max-md:text-[30px]">
          <PrivacyAmount value={added} currency={currency} />
        </span>
        <span className="text-[13.5px] text-[var(--m-mint-muted)] max-md:text-[12.5px]">
          {phone ? "added" : higher.length ? `added after pending, over ${higher.length} charge${higher.length === 1 ? "" : "s"}` : "added after pending"}
        </span>
      </div>
      {posted.length ? (
        <div className="flex flex-col gap-1.5 max-md:gap-1">
          <div role="img" aria-label={parts.map((p) => `${p.n} ${p.label}`).join(", ")} className="flex h-3.5 gap-[3px] max-md:h-3">
            {parts
              .filter((p) => p.n > 0)
              .map((p) => (
                <span key={p.key} className={cn("h-full min-w-1 rounded-[6px]", p.className)} style={{ flexGrow: p.n, flexBasis: 0 }} />
              ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs tabular-nums text-[var(--m-mint-muted)]">
            {parts
              .filter((p) => p.n > 0)
              .map((p) => (
              <span key={p.key} className="inline-flex items-center gap-1.5">
                <span aria-hidden className={cn("h-2.5 w-2.5 rounded-[3px]", p.className)} />
                {p.n} {p.key === "higher" ? "posted higher" : p.label}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-[var(--m-mint-muted)]">Nothing has posted yet.</p>
      )}
      <div className="grid grid-cols-3 gap-1.5">
        {tiles.map((tile) => (
          <div key={tile.label} className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-[var(--m-mint-tile)] px-3 py-2.5 max-md:px-2 max-md:py-1.5">
            <span className="truncate text-[12.5px] text-[var(--m-mint-muted)] max-md:text-[11.5px]">{tile.label}</span>
            <span data-m-num="tile" className="truncate text-[17px] font-medium tabular-nums max-md:text-[15px]">
              <PrivacyAmount value={tile.value} currency={currency} />
            </span>
            {phone ? null : <span className="text-xs text-[var(--m-mint-muted)]">{tile.sub}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Which alerts go out for these, read only: the switches are on Settings, Alerts with every other alert (owner, 10-01). */
function AlertsCard({ alerts, phone }: { alerts: PendingAlerts; phone: boolean }) {
  const step = alerts.minDollars <= 0.01 ? "Any amount" : `$${alerts.minDollars} or more`;
  const kinds = [
    { label: phone ? `${step} higher` : `Posted ${step.toLowerCase()} above pending`, on: true },
    { label: "Posted lower", on: alerts.lower },
    { label: "Never posted", on: alerts.dropped },
  ];
  return (
    <aside
      data-m="card"
      aria-label="Alerts"
      className="flex min-w-0 flex-col gap-2.5 rounded-[20px] border border-[var(--m-line)] bg-[var(--m-surface)] px-[18px] py-3.5 max-md:gap-1.5 max-md:px-3 max-md:py-2.5 lg:col-start-2 lg:row-start-1"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">Alerts</h2>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs",
            alerts.on ? "bg-[var(--m-good-soft)] text-[var(--m-up)]" : "bg-[var(--m-tile)] text-[var(--m-muted)]",
          )}
        >
          {alerts.on ? "On" : "Off"}
        </span>
      </div>
      <ul className={cn("flex flex-col gap-1.5 max-md:gap-1", !alerts.on && "opacity-60")}>
        {kinds.map((k) => (
          <li key={k.label} className="flex items-start gap-2 text-[13px] leading-snug max-md:text-xs">
            {k.on && alerts.on ? (
              <span aria-label="On" className="mt-px inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--m-done)]">
                <Icons.Check className="h-2.5 w-2.5 text-[var(--m-on-done)]" strokeWidth={3.5} />
              </span>
            ) : (
              <span aria-label="Off" className="mt-px h-4 w-4 shrink-0 rounded-full border border-dashed border-[var(--m-cat-other)]" />
            )}
            <span className={cn("min-w-0", !(k.on && alerts.on) && "text-[var(--m-muted)]")}>{k.label}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/settings/alerts"
        className="inline-flex min-h-8 w-fit items-center gap-1 whitespace-nowrap rounded-full bg-[var(--m-tile)] px-3 text-[12.5px] text-[var(--m-ink-2)] hover:bg-[var(--m-track)] max-md:min-h-7"
      >
        {/* The side card is narrowest from 1024 to 1279px: the words that fit there. */}
        <span className="lg:max-xl:hidden">Change in&nbsp;</span>Settings, Alerts
        <Icons.ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
      <p className="mt-auto border-t border-[var(--m-line-soft)] pt-2.5 text-xs leading-snug text-[var(--m-muted)] max-md:pt-1.5">
        {phone
          ? "Banks are read every 4 hours."
          : "The banks are read every 4 hours, so a charge that pends and posts between two reads is not seen pending."}
      </p>
    </aside>
  );
}

/** Changed, Posted, Never posted, Pending: Meadow pills, the chosen one filled (bronze in Bronze Titanium). */
function Tabs({ filter, counts, onChange }: { filter: Filter; counts: Record<Filter, number>; onChange: (f: Filter) => void }) {
  return (
    <div role="tablist" aria-label="Show" className="flex gap-1.5 max-md:gap-[3px]">
      {FILTERS.map((f) => {
        const on = filter === f.key;
        return (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={on}
            data-m={on ? "fill" : undefined}
            onClick={() => onChange(f.key)}
            className={cn(
              "inline-flex h-8 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] transition-colors max-md:h-7 max-md:flex-auto max-md:gap-1 max-md:px-1.5 max-md:text-[11.5px]",
              on ? "bg-[var(--m-forest)] text-[var(--m-on-forest)]" : "border border-[var(--m-line)] text-[var(--m-ink-2)] hover:bg-[var(--m-tile)]",
            )}
          >
            <span className="truncate">{f.label}</span>
            <span className={cn("tabular-nums", on ? "opacity-75" : "text-[var(--m-muted)]")}>{counts[f.key]}</span>
          </button>
        );
      })}
    </div>
  );
}

function Logo({ c, account, className }: { c: PendingChange; account: Account | undefined; className: string }) {
  const merchant = useMerchantFor(c.name || c.bankText, account, "WITHDRAWAL", c.bankText);
  if (merchant) return <MerchantLogo url={merchant.logoUrl} name={merchant.name} whole={merchant.source === "bank"} className={className} />;
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-[var(--m-tile)] text-sm text-[var(--m-muted)] ring-1 ring-[var(--m-line)]", className)}
    >
      {(c.name || c.bankText || "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

function Money({ value, currency, className }: { value: number; currency: string; className?: string }) {
  return <PrivacyAmount value={Math.abs(value)} currency={currency} className={cn("tabular-nums", className)} />;
}

/** Posted higher: worth a look (amber in Meadow, red in Bronze Titanium). Posted lower: green. Same: in words. */
function ChangeChip({ c }: { c: PendingChange }) {
  const pct = changePct(c);
  const up = (c.diff ?? 0) > 0;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs tabular-nums max-md:px-1.5 max-md:text-[11px]",
        up ? "bg-[var(--m-higher-soft)] text-[var(--m-higher-ink)]" : "bg-[var(--m-good-soft)] text-[var(--m-up)]",
      )}
    >
      {up ? <Icons.ArrowUp className="h-3 w-3" aria-label="Posted higher" /> : <Icons.ArrowDown className="h-3 w-3" aria-label="Posted lower" />}
      <Money value={c.diff ?? 0} currency={c.currency} />
      {pct != null ? <span className="opacity-80">· {pct}%</span> : null}
    </span>
  );
}

const PendingChip = () => (
  <span className="inline-flex shrink-0 items-center rounded-full border border-dashed border-[var(--m-cat-other)] px-2 py-px text-[11px] text-[var(--m-muted)]">
    Pending
  </span>
);

function ChangeRow({ c, account, focused, phone }: { c: PendingChange; account: Account | undefined; focused: boolean; phone: boolean }) {
  const changed = isChanged(c);
  const posted = c.status === "posted" && c.posted != null;
  const later = c.pendingHistory.slice(1);
  const search = c.postedBankText || c.bankText || c.name;
  const name = c.name || c.bankText;
  const accountName = account?.name ?? c.account ?? "";
  const when =
    c.status === "posted" && c.postedDate ? `${day(c.date)} → ${day(c.postedDate)}` : c.status === "dropped" ? day(c.date) : `since ${day(c.date)}`;
  // A posted one opens its entry in the Transactions list.
  const to = c.status === "posted" && search ? `/activities?tab=spending&q=${encodeURIComponent(search)}` : null;
  const rowClass = cn(
    "-mx-2 block rounded-xl border-t border-[var(--m-line-soft)] px-2 py-2.5 first:border-t-0 max-md:py-2",
    to && "transition-colors hover:bg-[var(--m-tile)]",
    focused && "bg-[var(--m-tile)] ring-1 ring-[var(--m-line)]",
  );

  const notes = (
    <>
      {later.length ? (
        <div className="text-[11px] text-[var(--m-muted)]">
          While pending: <Money value={c.firstPending} currency={c.currency} />
          {later.map((a, i) => (
            <span key={i}>
              , then <Money value={a} currency={c.currency} />
            </span>
          ))}
        </div>
      ) : null}
      {c.how === "match" ? (
        <div className="text-[11px] text-[var(--m-muted)]">
          {phone ? "Matched by card, store and day" : "The bank did not link the two: matched by card, merchant and day."}
        </div>
      ) : null}
    </>
  );

  const body = phone ? (
    // Two lines, keywords only: the name and what it posted as; the account's logo, the day and what it was.
    <div className="flex items-center gap-2.5">
      <Logo c={c} account={account} className="h-8 w-8" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-medium">{name}</span>
          <Money
            value={posted ? c.posted! : c.lastPending}
            currency={c.currency}
            className={cn("shrink-0 text-sm font-medium", c.status === "dropped" && "text-[var(--m-muted)] line-through")}
          />
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-[var(--m-muted)]">
          <span className="flex min-w-0 items-center gap-1.5">
            <AccountLogo account={account} className="h-3.5 w-3.5 text-[8px]" />
            <span className="truncate">
              {posted && c.postedDate ? day(c.postedDate) : when}
              {changed ? (
                <>
                  {" · was "}
                  <Money value={c.firstPending} currency={c.currency} />
                </>
              ) : null}
            </span>
          </span>
          {changed ? (
            <ChangeChip c={c} />
          ) : posted ? (
            <span className="shrink-0">Same</span>
          ) : c.status === "pending" ? (
            <PendingChip />
          ) : (
            <span className="shrink-0">Never posted</span>
          )}
        </div>
        {notes}
      </div>
    </div>
  ) : (
    <div className={cn(COLUMNS, "items-center")}>
      <div className="flex min-w-0 items-center gap-3">
        <Logo c={c} account={account} className="h-9 w-9" />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{name}</div>
          <div className="truncate text-xs text-[var(--m-muted)]">{when}</div>
          {notes}
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2" title={account?.group && account.group !== accountName ? `${account.group} ${accountName}` : accountName}>
        <AccountLogo account={account} />
        <span className="min-w-0 truncate text-[13px] text-[var(--m-ink-2)] max-xl:hidden">{accountName}</span>
      </div>
      <div className="text-right text-sm">
        {/* What it was first: what the change is counted from. Still pending: what it is now. */}
        <Money
          value={posted ? c.firstPending : c.lastPending}
          currency={c.currency}
          className={cn(posted ? "text-[var(--m-muted)]" : "font-medium", c.status === "dropped" && "text-[var(--m-muted)] line-through")}
        />
      </div>
      <div className="text-right text-sm">
        {posted ? (
          <Money value={c.posted!} currency={c.currency} className="font-medium" />
        ) : c.status === "pending" ? (
          <PendingChip />
        ) : (
          <span className="text-xs text-[var(--m-muted)]">Never</span>
        )}
      </div>
      <div className="flex justify-end">
        {changed ? <ChangeChip c={c} /> : posted ? <span className="text-xs text-[var(--m-muted)]">Same</span> : null}
      </div>
    </div>
  );

  return to ? (
    <Link id={`pc-${c.id}`} to={to} role="row" className={rowClass}>
      {body}
    </Link>
  ) : (
    <div id={`pc-${c.id}`} role="row" className={rowClass}>
      {body}
    </div>
  );
}

