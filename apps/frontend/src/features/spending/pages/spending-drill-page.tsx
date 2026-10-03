// money-hub patch: a store's page (/spending/merchant/:id) and a category's page (/spending/category/:id)
// (owner, 2026-10-03, from the Monarch comparison: "store page + category page: spend chart over time +
// every charge + totals"). What it adds up to by month, quarter or year as bars (a click picks a period),
// the totals, and every transaction, each opening the usual edit window. A store's transactions are the
// ones the list shows with that merchant (lib/merchants.ts, the same matching); a category's include its
// subcategories. Read only from the money app; lib/drill.ts does the sums.
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DashboardCard } from "@/components/dashboard-card";
import { useAccounts } from "@/hooks/use-accounts";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { useTaxonomy } from "@/hooks/use-taxonomies";
import { cn } from "@/lib/utils";
import { Icons, Page, PageContent, PageHeader, PrivacyAmount, useAmountFormatting, useBalancePrivacy } from "@wealthfolio/ui";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { searchCashActivities } from "../adapters/cash-activities";
import { CashActivityForm } from "../components/cash-activity-form";
import { CategoryMark } from "../components/category-chips";
import { MerchantLogo } from "../components/merchant-logo";
import { useSpendingSettings } from "../hooks/use-spending-settings";
import { bankWordsFor, useBankLines } from "../lib/bank-lines";
import { descendantCategoryIds } from "../lib/category-rollup";
import { useDashboardSkins } from "../lib/dashboard-skin";
import { bucketsOf, periodLabel, periodOf, spendOf, summaryOf, type Grain } from "../lib/drill";
import { merchantFor, useMerchants, wordsOf } from "../lib/merchants";
import { useNotes } from "../lib/notes";
import type { CashActivity } from "../types/cash-activity";

const LINE = "var(--m-chart, var(--m-forest, hsl(73 84% 27%)))";
const TAXONOMY_OF = { income: "income_sources", saving: "savings_categories", spending: "spending_categories" } as const;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const shortDay = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Every page of a search (500 at a time). */
async function allOf(request: Parameters<typeof searchCashActivities>[0]): Promise<CashActivity[]> {
  const out: CashActivity[] = [];
  for (let i = 0; i < 40; i += 1) {
    const r = await searchCashActivities({ ...request, offset: out.length, limit: 500, sortBy: "date", sortDir: "desc" });
    out.push(...r.items);
    if (!r.items.length || out.length >= r.totalCount) break;
  }
  return out;
}

function Toggle<T extends string | number>({ items, value, onChange, label }: { items: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="bg-card/40 border-border/60 inline-flex items-center gap-0.5 rounded-full border p-0.5">
      {items.map((it) => (
        <button
          key={String(it.value)}
          type="button"
          onClick={() => onChange(it.value)}
          aria-pressed={value === it.value}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
            value === it.value ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export default function SpendingDrillPage({ kind }: { kind: "merchant" | "category" }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobileViewport();
  const skins = useDashboardSkins();
  const { settings } = useSpendingSettings();
  const { data: merchants } = useMerchants();
  const { data: spendingTax } = useTaxonomy("spending_categories");
  const { data: incomeTax } = useTaxonomy("income_sources");
  const { data: lines } = useBankLines();
  const { data: notesById } = useNotes();
  const { accounts } = useAccounts({ filterActive: false });
  const [months, setMonths] = usePersistentState<number>("drill-months", 12);
  const [grain, setGrain] = usePersistentState<Grain>("drill-grain", "month");
  const [picked, setPicked] = useState<string | null>(null);
  const [editing, setEditing] = useState<CashActivity | null>(null);

  const merchant = kind === "merchant" ? (merchants ?? []).find((m) => m.id === id) ?? null : null;
  const allCats = useMemo(() => [...(spendingTax?.categories ?? []), ...(incomeTax?.categories ?? [])], [spendingTax, incomeTax]);
  const category = kind === "category" ? allCats.find((c) => c.id === id) ?? null : null;
  const accountIds = settings?.accountIds ?? [];
  const to = isoDay(new Date());
  const fromDate = new Date();
  fromDate.setMonth(fromDate.getMonth() - (months - 1), 1);
  const from = isoDay(fromDate);
  const accountOf = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts]);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["money-hub", "drill", kind, id, from, accountIds.join(",")],
    enabled: accountIds.length > 0 && (kind === "merchant" ? !!merchant : !!category),
    staleTime: 60_000,
    queryFn: async (): Promise<CashActivity[]> => {
      const base = { accountIds, startDate: `${from}T00:00:00.000Z` };
      if (kind === "category" && category) {
        return allOf({ ...base, categoryIds: descendantCategoryIds(category.id, allCats) });
      }
      // A store: every entry its words find (payee and bank text), then only those the list shows as it.
      const seen = new Map<string, CashActivity>();
      for (const w of wordsOf(merchant!)) for (const a of await allOf({ ...base, search: w })) seen.set(a.id, a);
      return [...seen.values()];
    },
  });

  // A store's rows: the ones the transaction list gives this merchant (the longest words win there too).
  const mine = useMemo(() => {
    const list = rows ?? [];
    if (kind !== "merchant") return list;
    return list.filter((a) => merchantFor(a.notes, merchants, accountOf.get(a.accountId), a.activityType, bankWordsFor(lines, a.id, notesById))?.id === id);
  }, [rows, kind, merchants, accountOf, lines, notesById, id]);

  const buckets = useMemo(() => bucketsOf(mine, { from, to, grain }), [mine, from, to, grain]);
  const shown = useMemo(
    () => [...(picked ? mine.filter((a) => periodOf(String(a.activityDate).slice(0, 10), grain) === picked) : mine)]
      .sort((a, b) => String(b.activityDate).localeCompare(String(a.activityDate))),
    [mine, picked, grain],
  );
  const sum = useMemo(() => summaryOf(picked ? shown : mine), [picked, shown, mine]);
  const name = merchant?.name ?? category?.name ?? (kind === "merchant" ? "Store" : "Category");
  const listHref = kind === "category"
    ? `/activities?tab=spending&category=${encodeURIComponent(id)}`
    : `/activities?tab=spending&q=${encodeURIComponent(merchant ? wordsOf(merchant)[0] ?? merchant.name : "")}`;
  const missing = kind === "merchant" ? merchants && !merchant : spendingTax && incomeTax && !category;

  const formActivity = useMemo(() => {
    if (!editing) return undefined;
    const tax = TAXONOMY_OF[editing.cashFlowBucket as keyof typeof TAXONOMY_OF];
    const asg = tax ? (editing.assignments ?? []).find((x) => x.taxonomyId === tax) : undefined;
    return asg ? { ...editing, categoryAssignmentId: asg.id, categoryTaxonomyId: asg.taxonomyId, categoryId: asg.categoryId } : editing;
  }, [editing]);

  return (
    <div className="meadow min-h-screen" data-light-skin={skins.light} data-dark-skin={skins.dark}>
      <Page>
        <PageHeader
          heading={name}
          text={isMobile ? undefined : kind === "merchant" ? "Everything at this store" : "Everything in this category"}
          onBack={() => (window.history.length > 1 ? navigate(-1) : navigate("/dashboard?tab=spending"))}
          actions={
            <Link to={listHref} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs underline-offset-4 hover:underline">
              <Icons.ListFilter className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">In Transactions</span>
            </Link>
          }
        />
        <PageContent className="space-y-4">
          {missing ? (
            <p className="text-muted-foreground text-sm">{kind === "merchant" ? "That store is not one of your merchants any more." : "That category is not there any more."}</p>
          ) : (
            <>
              <DashboardCard
                title={picked ? periodLabel(picked, grain, true) : `Last ${months} months`}
                subtitle={
                  merchant ? <MerchantLogo url={merchant.logoUrl} name={merchant.name} whole={merchant.source === "bank"} className="h-5 w-5" />
                    : category ? <CategoryMark icon={category.icon} color={category.color} size="sm" /> : undefined
                }
                action={
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Toggle label="How far back" items={[{ value: 12, label: "12 mo" }, { value: 24, label: "24 mo" }]} value={months} onChange={(v) => { setMonths(v); setPicked(null); }} />
                    {!isMobile ? (
                      <Toggle<Grain> label="By" items={[{ value: "month", label: "Month" }, { value: "quarter", label: "Quarter" }, { value: "year", label: "Year" }]} value={grain} onChange={(v) => { setGrain(v); setPicked(null); }} />
                    ) : null}
                  </div>
                }
              >
                {isLoading || !rows ? (
                  <Skeleton className="h-[200px] w-full rounded-lg" />
                ) : (
                  <div className="space-y-4">
                    <Totals sum={sum} />
                    <Bars buckets={buckets} grain={grain} picked={picked} onPick={(k) => setPicked(picked === k ? null : k)} isMobile={isMobile} />
                  </div>
                )}
              </DashboardCard>
              <DashboardCard
                title="Transactions"
                subtitle={rows ? `${shown.length}${picked ? ` in ${periodLabel(picked, grain, true)}` : ""}` : undefined}
                action={picked ? <button type="button" className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline" onClick={() => setPicked(null)}>Show all</button> : undefined}
              >
                {isLoading || !rows ? <Skeleton className="h-[160px] w-full rounded-lg" /> : (
                  <List rows={shown} accounts={accountOf} cats={allCats} kind={kind} onOpen={setEditing}
                    logoOf={(a) => kind === "category" ? merchantFor(a.notes, merchants, accountOf.get(a.accountId), a.activityType, bankWordsFor(lines, a.id, notesById)) : null} />
                )}
              </DashboardCard>
            </>
          )}
        </PageContent>
      </Page>
      <CashActivityForm open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }} activity={formActivity} />
    </div>
  );
}

function Totals({ sum }: { sum: ReturnType<typeof summaryOf> }) {
  const tile = (label: string, value: ReactNode, sub?: string) => (
    <div className="min-w-0">
      <div className="text-muted-foreground text-[11px]">{label}</div>
      <div className="text-foreground truncate text-base font-medium tabular-nums">{value}</div>
      {sub ? <div className="text-muted-foreground text-[11px]">{sub}</div> : null}
    </div>
  );
  return (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
      <div className="min-w-0">
        <div className="text-muted-foreground text-xs">{sum.spent >= 0 ? "Spent" : "Received"}</div>
        <div className="text-foreground text-[26px] font-medium leading-tight tabular-nums tracking-tight">
          <PrivacyAmount value={Math.abs(sum.spent)} currency="USD" />
        </div>
        {sum.back > 0 ? (
          <div className="text-muted-foreground text-[11px]">
            after <PrivacyAmount value={sum.back} currency="USD" /> back
          </div>
        ) : null}
      </div>
      <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {tile("Transactions", sum.count)}
        {tile("Average", <PrivacyAmount value={sum.average} currency="USD" />)}
        {tile("Largest", <PrivacyAmount value={sum.largest} currency="USD" />)}
        {tile("First and last", sum.first ? `${shortDay(sum.first).replace(/, \d{4}$/, "")} to ${shortDay(sum.last!).replace(/, \d{4}$/, "")}` : "None")}
      </div>
    </div>
  );
}

function Bars({ buckets, grain, picked, onPick, isMobile }: { buckets: ReturnType<typeof bucketsOf>; grain: Grain; picked: string | null; onPick: (k: string) => void; isMobile: boolean }) {
  const { isBalanceHidden } = useBalancePrivacy();
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...buckets.map((b) => b.spent));
  const { formatRoundedAmount } = useAmountFormatting();
  const money = (v: number) => (isBalanceHidden ? "••••" : formatRoundedAmount(v, "USD"));
  const h = buckets.find((b) => b.key === hover);
  const every = buckets.length > 14 ? Math.ceil(buckets.length / (isMobile ? 4 : 8)) : isMobile && buckets.length > 6 ? 2 : 1;
  return (
    <div>
      <div className="relative">
        <div className={cn("flex items-end gap-[2px]", isMobile ? "h-[110px]" : "h-[150px]")} onPointerLeave={() => setHover(null)}>
          {buckets.map((b) => {
            const pct = b.spent > 0 ? Math.max(2, (b.spent / max) * 100) : 0;
            const dim = picked && picked !== b.key;
            return (
              <button
                key={b.key}
                type="button"
                onPointerEnter={() => setHover(b.key)}
                onClick={() => onPick(b.key)}
                aria-label={`${periodLabel(b.key, grain, true)}: ${money(b.spent)}`}
                aria-pressed={picked === b.key}
                className="group flex h-full min-w-0 flex-1 items-end"
              >
                <span
                  className="block w-full rounded-t-[4px] transition-opacity"
                  style={{ height: `${pct}%`, background: LINE, opacity: dim ? 0.3 : hover && hover !== b.key ? 0.75 : 1 }}
                />
              </button>
            );
          })}
        </div>
        {h ? (
          <div className="bg-popover text-popover-foreground pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full rounded-lg border px-2.5 py-1.5 text-[11.5px] shadow-md">
            <span className="text-muted-foreground">{periodLabel(h.key, grain, true)}</span>{" "}
            <span className="text-foreground font-medium tabular-nums">{money(h.spent)}</span>
            <span className="text-muted-foreground"> · {h.count} {h.count === 1 ? "transaction" : "transactions"}</span>
          </div>
        ) : null}
      </div>
      <div className="text-muted-foreground mt-1 flex gap-[2px] text-[10.5px] tabular-nums">
        {buckets.map((b, i) => (
          <span key={b.key} className="min-w-0 flex-1 truncate text-center">{i % every === 0 ? periodLabel(b.key, grain) : ""}</span>
        ))}
      </div>
      <div className="text-muted-foreground mt-1 text-[10.5px]">Highest {money(max)} · click a bar for that {grain}'s transactions</div>
    </div>
  );
}

function List({ rows, accounts, cats, kind, onOpen, logoOf }: {
  rows: CashActivity[];
  accounts: Map<string, { name: string }>;
  cats: { id: string; name: string; icon?: string | null; color?: string | null }[];
  kind: "merchant" | "category";
  onOpen: (a: CashActivity) => void;
  /** A category's rows show each store's logo, like the transaction list. */
  logoOf: (a: CashActivity) => { name: string; logoUrl?: string | null; source?: string } | null;
}) {
  const [limit, setLimit] = useState(50);
  const catOf = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  if (!rows.length) return <p className="text-muted-foreground text-sm">Nothing in this time.</p>;
  return (
    <div>
      {rows.slice(0, limit).map((a) => {
        const spend = spendOf(a);
        const cat = kind === "merchant" ? catOf.get((a.assignments ?? []).find((x) => x.taxonomyId === "spending_categories" || x.taxonomyId === "income_sources")?.categoryId ?? "") : null;
        return (
          <button key={a.id} type="button" onClick={() => onOpen(a)} className="hover:bg-muted/40 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left">
            <span className="text-muted-foreground w-[86px] shrink-0 text-[11.5px] tabular-nums">{shortDay(String(a.activityDate))}</span>
            {kind === "category" ? (() => {
              const m = logoOf(a);
              return m ? <MerchantLogo url={m.logoUrl ?? null} name={m.name} whole={m.source === "bank"} className="h-7 w-7" /> : <span className="h-7 w-7 shrink-0" aria-hidden />;
            })() : null}
            <span className="min-w-0 flex-1">
              <span className="text-foreground block truncate text-[13px]">{a.notes || "—"}</span>
              <span className="text-muted-foreground block truncate text-[11px]">
                {[accounts.get(a.accountId)?.name, cat?.name].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className={cn("shrink-0 text-[13px] font-medium tabular-nums", spend < 0 && "text-[var(--m-up,#15803d)]")}>
              {spend < 0 ? "+" : ""}
              <PrivacyAmount value={Math.abs(spend)} currency={a.currency || "USD"} />
            </span>
          </button>
        );
      })}
      {rows.length > limit ? (
        <button type="button" onClick={() => setLimit(limit + 100)} className="text-muted-foreground hover:text-foreground px-2 pt-2 text-xs underline-offset-4 hover:underline">
          Show {Math.min(100, rows.length - limit)} more
        </button>
      ) : null}
    </div>
  );
}
