// money-hub patch: Returns (lib/returns.ts): everything sent back, what is still to come and when,
// the money in that could be a refund (yes or no), what came back, and which alerts go out. A row
// opens its window (components/track-return-dialog.tsx).
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button, Icons, Page, PageContent, PageHeader, PrivacyAmount } from "@wealthfolio/ui";

import { useAccounts } from "@/hooks/use-accounts";
import { cn } from "@/lib/utils";

import { StreamLogo } from "../components/stream-logo";
import { MoneyInRow } from "../components/track-return-dialog";
import {
  closedReturns,
  offerHint,
  openReturns,
  returnLine,
  returnStatus,
  returnsApi,
  trackReturnStore,
  useReturns,
  useSetReturns,
  type ReturnItem,
  type ReturnsView,
} from "../lib/returns";

const TONE = {
  fine: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  look: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  plain: "bg-muted text-muted-foreground",
  over: "bg-muted text-muted-foreground",
} as const;

/** How many closed ones show before "Show all". */
const CLOSED_SHOWN = 8;
const errorText = (e: unknown) => (e as Error)?.message ?? String(e);

type Act = (label: string, fn: () => Promise<ReturnsView>, done?: string) => Promise<void>;

export default function SpendingReturnsPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useReturns();
  const currency = data?.currency || "USD";
  const set = useSetReturns();
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  /** One change at a time; the view the helper returns replaces what is shown. */
  const act: Act = async (label, fn, done) => {
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

  const open = openReturns(data?.items ?? []);
  const closed = closedReturns(data?.items ?? []);
  const rowProps = { currency, busy, act };

  return (
    <Page>
      <PageHeader
        heading="Returns"
        text="What you sent back, and the money on its way to you."
        onBack={() => {
          if (window.history.length > 1) navigate(-1);
          else navigate("/dashboard?tab=spending");
        }}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={busy !== null} onClick={() => act("rescan", returnsApi.rescan, "Checked again.")}>
              {busy === "rescan" ? <Icons.Spinner className="h-3.5 w-3.5 animate-spin sm:mr-1.5" /> : <Icons.RotateCcw className="h-3.5 w-3.5 sm:mr-1.5" />}
              <span className="hidden sm:inline">Check again</span>
              <span className="sr-only sm:hidden">Check again</span>
            </Button>
            <Button size="sm" onClick={() => trackReturnStore.open({})}>
              <Icons.Plus className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Track a return</span>
              <span className="sr-only sm:hidden">Track a return</span>
            </Button>
          </div>
        }
      />
      <PageContent className="space-y-6">
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Reading your returns.</p>
        ) : isError ? (
          <p className="text-destructive text-sm">{errorText(error)}</p>
        ) : !data ? null : (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              <Tile label="On its way back" value={<PrivacyAmount value={data.totals.waiting} currency={currency} />} />
              <Tile
                label="Waiting"
                value={<span>{data.totals.count}</span>}
                sub={[data.totals.late ? `${data.totals.late} late` : null, data.totals.toConfirm ? `${data.totals.toConfirm} to confirm` : null].filter(Boolean).join(", ") || undefined}
              />
              <Tile label="Came back" value={<PrivacyAmount value={data.totals.back} currency={currency} />} sub="last 90 days" />
            </div>

            {data.items.length === 0 ? (
              <div className="border-border/40 bg-card/70 rounded-xl border p-6 text-center backdrop-blur-xl">
                <p className="text-sm">Nothing sent back yet.</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  When you return something, press Track a return here, or open the purchase&apos;s menu in Transactions. The money app then watches for the refund and
                  tells you when it lands, or when it is late.
                </p>
              </div>
            ) : null}

            {open.length ? (
              <Section title="Waiting" blurb="Sent back, the money not all here yet." aside={<><PrivacyAmount value={data.totals.waiting} currency={currency} /> to come</>}>
                {open.map((x) => (
                  <ReturnRow key={x.id} x={x} {...rowProps} />
                ))}
              </Section>
            ) : null}

            {closed.length ? (
              <div className="space-y-2">
                <Section title="Done" blurb="The money came back, or you settled it another way.">
                  {(showAll ? closed : closed.slice(0, CLOSED_SHOWN)).map((x) => (
                    <ReturnRow key={x.id} x={x} {...rowProps} />
                  ))}
                </Section>
                {closed.length > CLOSED_SHOWN ? (
                  <button type="button" className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline" onClick={() => setShowAll((v) => !v)}>
                    {showAll ? "Show fewer" : `Show all ${closed.length}`}
                  </button>
                ) : null}
              </div>
            ) : null}

            {/* Which alerts go out, and their tests, live on Settings, Alerts with every other alert (owner, 10-01). */}
            <div className="text-muted-foreground space-y-1 text-xs">
              {data.last ? <p>Last checked {new Date(data.last.at).toLocaleString()}. It checks every hour, and nothing in your transactions is changed.</p> : null}
              <p>
                {data.alerts.on === false ? "Alerts for these are off. " : "Which alerts go out, and where: "}
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

function ReturnRow({ x, currency, busy, act }: { x: ReturnItem; currency: string; busy: string | null; act: Act }) {
  const st = returnStatus(x);
  const { accounts } = useAccounts({ filterActive: false });
  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]));
  const openIt = () => trackReturnStore.open({ returnId: x.id });
  const part = x.expected < x.purchase.amount;

  return (
    // A click anywhere on the row opens it; the pencil is the keyboard's way in (no button inside a button).
    <div onClick={openIt} className={cn("hover:bg-muted/40 cursor-pointer px-4 py-3 transition-colors", x.status === "settled" && "opacity-70")}>
      <div className="flex items-center gap-3">
        <StreamLogo s={x} className="h-9 w-9 text-sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium">{x.name}</span>
            {st.label === "Refunded" ? (
              // The green is fixed: the dark theme turns emerald utilities white, and this one must stay green.
              <span title="Refunded" aria-label="Refunded" className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "#16a34a" }}>
                <Icons.Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
              </span>
            ) : (
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", TONE[st.tone])}>{st.label}</span>
            )}
          </div>
          <div className="text-muted-foreground text-xs leading-snug">
            {returnLine(x)}
            {/* The card and the note from the tablet up: on a phone the line would wrap to five. */}
            <span className="hidden sm:inline">
              {x.accountId && accountName.get(x.accountId) ? ` · ${accountName.get(x.accountId)}` : ""}
              {x.note ? ` · ${x.note}` : ""}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm tabular-nums">
            {/* Waiting: what is still to come. Done: what came back; settled with nothing back, what it was for. */}
            <PrivacyAmount value={!x.closedAt ? x.remaining : x.received > 0 ? x.received : x.expected} currency={currency} />
          </div>
          {!x.closedAt && x.received > 0 ? (
            <div className="text-muted-foreground text-[11px] tabular-nums">
              <PrivacyAmount value={x.received} currency={currency} /> back so far
            </div>
          ) : x.status === "settled" && x.received > 0 ? (
            <div className="text-muted-foreground text-[11px] tabular-nums">
              of <PrivacyAmount value={x.expected} currency={currency} />
            </div>
          ) : x.status === "settled" ? (
            <div className="text-muted-foreground text-[11px]">not refunded</div>
          ) : part ? (
            <div className="text-muted-foreground text-[11px] tabular-nums">
              of <PrivacyAmount value={x.purchase.amount} currency={currency} /> paid
            </div>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label={`Open the return to ${x.name}`}
          onClick={(e) => {
            e.stopPropagation();
            openIt();
          }}
        >
          <Icons.Pencil className="h-4 w-4" />
        </Button>
      </div>
      {x.suggestions.length ? (
        <div className="mt-2 space-y-1.5 sm:pl-12" onClick={(e) => e.stopPropagation()}>
          {x.suggestions.map((c) => (
            <MoneyInRow key={c.id} row={c} currency={currency} account={c.accountId ? accountName.get(c.accountId) : undefined} hint={offerHint(c)} look>
              <Button size="sm" className="h-7 text-xs" disabled={busy !== null} onClick={() => act(c.id, () => returnsApi.linkRefund(x.id, c), "That refund is on this return now.")}>
                This is it
              </Button>
              <Button variant="ghost" size="sm" className="text-muted-foreground h-7 text-xs" disabled={busy !== null} onClick={() => act(c.id, () => returnsApi.notIt(x.id, c.id))}>
                Not it
              </Button>
            </MoneyInRow>
          ))}
        </div>
      ) : null}
    </div>
  );
}
