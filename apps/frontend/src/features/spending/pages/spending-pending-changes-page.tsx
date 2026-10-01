// money-hub patch: Pending vs posted (lib/pending-changes.ts). Each bank charge as it was while
// pending beside what it posted as (owner, 2026-10-01: "track what changed between pending and after
// its posted ... tips for restaurants or other suspicious charge from a merchant that im not aware
// off"). Read only; the alert for it is on Settings, Alerts.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { Icons, Page, PageContent, PageHeader, PrivacyAmount } from "@wealthfolio/ui";

import { useAccounts } from "@/hooks/use-accounts";
import { cn } from "@/lib/utils";

import { MerchantLogo } from "../components/merchant-logo";
import { useMerchantFor } from "../lib/merchants";
import { changePct, isChanged, usePendingChanges, type PendingChange } from "../lib/pending-changes";

type Filter = "changed" | "posted" | "dropped" | "pending";

const FILTERS: { key: Filter; label: string; empty: string }[] = [
  { key: "changed", label: "Changed", empty: "No charge has posted at another amount yet." },
  { key: "posted", label: "Posted", empty: "Nothing that was pending has posted yet." },
  { key: "dropped", label: "Never posted", empty: "Every pending charge seen so far has posted." },
  { key: "pending", label: "Pending", empty: "Nothing is pending right now." },
];

const keep = (f: Filter) => (c: PendingChange) =>
  f === "changed" ? isChanged(c) : f === "posted" ? c.status === "posted" : c.status === f;

// Inline colour: the dark theme turns the amber utilities white (subscriptions page, 10-01).
const UP = "#d97706";

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const longDay = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export default function SpendingPendingChangesPage() {
  const navigate = useNavigate();
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

  const shown = items.filter(keep(filter));
  const currency = items[0]?.currency || "USD";
  const added = items.filter((c) => isChanged(c) && (c.diff ?? 0) > 0).reduce((s, c) => s + (c.diff ?? 0), 0);

  return (
    <Page>
      <PageHeader
        heading="Pending vs posted"
        text="What a charge was while pending, and what it posted as. Tips and other changes show up here."
        onBack={() => {
          if (window.history.length > 1) navigate(-1);
          else navigate("/activities?tab=spending");
        }}
      />
      <PageContent className="space-y-6">
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Reading the bank entries.</p>
        ) : !data ? (
          <p className="text-destructive text-sm">The money app helper did not answer. Try again in a minute.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              <Tile label="Changed" value={<span>{counts.changed}</span>} sub={`of ${counts.posted} posted`} />
              <Tile label="Added" value={<PrivacyAmount value={added} currency={currency} />} sub="after pending" />
              <Tile label="Pending now" value={<span>{counts.pending}</span>} />
            </div>

            <div className="space-y-2">
              <div role="tablist" aria-label="Show" className="bg-muted/60 inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg p-0.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    role="tab"
                    aria-selected={filter === f.key}
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors",
                      filter === f.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {f.label}
                    <span className="text-muted-foreground tabular-nums">{counts[f.key]}</span>
                  </button>
                ))}
              </div>

              {shown.length ? (
                <div className="border-border/40 bg-card/70 divide-y rounded-xl border backdrop-blur-xl">
                  {shown.map((c) => (
                    <ChangeRow key={c.id} c={c} focused={c.id === focus} />
                  ))}
                </div>
              ) : (
                <div className="border-border/40 bg-card/70 rounded-xl border p-6 text-center backdrop-blur-xl">
                  <p className="text-sm">{FILTERS.find((f) => f.key === filter)?.empty}</p>
                  {filter === "changed" && counts.pending ? (
                    <p className="text-muted-foreground mt-1 text-xs">
                      {counts.pending} pending now. Each one is compared with what it posts as.
                    </p>
                  ) : null}
                </div>
              )}
            </div>

            <div className="text-muted-foreground space-y-1 text-xs">
              <p>
                {data.since ? `Watching since ${longDay(data.since)}. ` : ""}
                The banks are read every 4 hours, so a charge that pends and posts between two reads is not seen pending.
              </p>
              <p>
                {data.alerts.on ? `An alert goes out when a charge posts ${data.alerts.minDollars <= 0.01 ? "any amount" : `$${data.alerts.minDollars} or more`} above pending. ` : "Alerts are off. "}
                <Link to="/settings/alerts" className="text-foreground underline-offset-4 hover:underline">
                  Settings, Alerts
                </Link>
              </p>
            </div>
          </>
        )}
      </PageContent>
    </Page>
  );
}

function Tile({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="border-border/40 bg-card/70 rounded-xl border p-3 backdrop-blur-xl md:p-4">
      <div className="text-muted-foreground/70 truncate text-[10px] font-semibold uppercase tracking-wide">{label}</div>
      <div className="mt-1 whitespace-nowrap text-base font-semibold tabular-nums sm:text-xl md:text-2xl">{value}</div>
      {sub ? <div className="text-muted-foreground text-xs">{sub}</div> : null}
    </div>
  );
}

function Logo({ c }: { c: PendingChange }) {
  const { accounts } = useAccounts({ filterActive: false });
  const account = accounts?.find((a) => a.id === c.accountId);
  const merchant = useMerchantFor(c.name || c.bankText, account, "WITHDRAWAL", c.bankText);
  if (merchant) return <MerchantLogo url={merchant.logoUrl} name={merchant.name} whole={merchant.source === "bank"} className="h-9 w-9" />;
  return (
    <span aria-hidden className="bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold">
      {(c.name || c.bankText || "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

function Money({ value, currency, className }: { value: number; currency: string; className?: string }) {
  return <PrivacyAmount value={Math.abs(value)} currency={currency} className={cn("tabular-nums", className)} />;
}

function ChangeRow({ c, focused }: { c: PendingChange; focused: boolean }) {
  const pct = changePct(c);
  const up = (c.diff ?? 0) > 0;
  const changed = isChanged(c);
  const moved = c.pendingHistory.length > 1;
  const search = c.postedBankText || c.bankText || c.name;
  return (
    <div id={`pc-${c.id}`} className={cn("px-4 py-3", focused && "bg-muted/50")}>
      <div className="flex items-center gap-3">
        <Logo c={c} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            {c.status === "posted" && search ? (
              <Link
                to={`/activities?tab=spending&q=${encodeURIComponent(search)}`}
                className="min-w-0 truncate text-sm font-medium underline-offset-4 hover:underline"
              >
                {c.name || c.bankText}
              </Link>
            ) : (
              <span className="min-w-0 truncate text-sm font-medium">{c.name || c.bankText}</span>
            )}
            <span className="flex shrink-0 items-baseline gap-1.5 text-sm">
              {c.status === "posted" && c.posted != null ? (
                changed ? (
                  <>
                    <Money value={c.firstPending} currency={c.currency} className="text-muted-foreground text-xs line-through" />
                    <Money value={c.posted} currency={c.currency} className="font-medium" />
                  </>
                ) : (
                  <Money value={c.posted} currency={c.currency} className="font-medium" />
                )
              ) : (
                <Money value={c.lastPending} currency={c.currency} className={cn("font-medium", c.status === "dropped" && "text-muted-foreground line-through")} />
              )}
            </span>
          </div>
          <div className="text-muted-foreground mt-0.5 flex items-center justify-between gap-3 text-xs">
            <span className="min-w-0 truncate">
              {/* Dates first: on a phone the account is what gets cut. */}
              {[c.status === "posted" && c.postedDate ? `${day(c.date)} → ${day(c.postedDate)}` : c.status === "dropped" ? `${day(c.date)}, never posted` : `since ${day(c.date)}`, c.account]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {changed && c.diff != null ? (
              <span
                className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums", !up && "bg-muted text-muted-foreground")}
                style={up ? { color: UP, backgroundColor: "rgba(217, 119, 6, 0.12)" } : undefined}
              >
                {up ? <Icons.ArrowUp className="h-3 w-3" aria-hidden="true" /> : <Icons.ArrowDown className="h-3 w-3" aria-hidden="true" />}
                <Money value={c.diff} currency={c.currency} />
                {pct != null ? <span className="font-medium">· {pct}%</span> : null}
              </span>
            ) : c.status === "posted" ? (
              <span className="shrink-0">Same amount</span>
            ) : c.status === "pending" ? (
              <span className="text-muted-foreground shrink-0 rounded-full border border-dashed px-1.5 py-px text-[10px] font-medium uppercase tracking-wide">Pending</span>
            ) : null}
          </div>
          {moved ? (
            <div className="text-muted-foreground mt-0.5 text-[11px]">
              While pending:{" "}
              {c.pendingHistory.map((a, i) => (
                <span key={i}>
                  {i ? ", then " : ""}
                  <Money value={a} currency={c.currency} />
                </span>
              ))}
            </div>
          ) : null}
          {c.how === "match" ? (
            <div className="text-muted-foreground mt-0.5 text-[11px]">The bank did not link the two: matched by card, merchant and day.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
