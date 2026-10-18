import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { useIsMobileViewport } from "@/hooks/use-platform";
import { cn } from "@/lib/utils";
import { Icons, PrivacyAmount, Sheet, SheetContent, SheetTitle, Skeleton } from "@wealthfolio/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@wealthfolio/ui/components/ui/popover";

import { useCashActivitySearch } from "../hooks/use-cash-activity-search";
import { excludedWithDescendants, leftOutByCategory } from "../lib/left-out";
import type { WhereItWentRow } from "../lib/category-rollup";
import { topMovers } from "../lib/why-moved";
import { CategoryMark } from "./category-chips";

/**
 * money-hub patch (owner, 10-18): a small popup behind a chip. A popover by the chip on a desktop, a sheet from the
 * bottom on a phone. `children` get `open` so a popup can fetch only once it is opened.
 */
function ChipPopup({
  trigger,
  title,
  children,
}: {
  trigger: (props: { open: boolean }) => ReactNode;
  title: string;
  children: (open: boolean) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobileViewport();
  if (isMobile) {
    return (
      <>
        <span onClick={() => setOpen(true)}>{trigger({ open })}</span>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto rounded-t-[20px] px-4 pb-6 pt-4">
            <SheetTitle className="text-foreground mb-2 text-sm font-medium">{title}</SheetTitle>
            {children(open)}
          </SheetContent>
        </Sheet>
      </>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger({ open })}</PopoverTrigger>
      <PopoverContent align="start" collisionPadding={12} className="w-[min(380px,calc(100vw-1.5rem))] p-3">
        <div className="text-foreground mb-2 text-sm font-medium">{title}</div>
        {children(open)}
      </PopoverContent>
    </Popover>
  );
}

const CHIP_BASE =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-accent,currentColor)]";

/** "5 left out": the categories this period's Spent leaves out, with what went through each. */
export function LeftOutChip({
  excludedIds,
  categories,
  startDate,
  endDate,
  currency,
  label,
  periodWord,
  hrefFor,
}: {
  excludedIds: string[];
  categories: { id: string; name: string; parentId?: string | null }[];
  startDate: string;
  endDate: string;
  currency: string;
  label: string;
  periodWord?: string;
  hrefFor: (id: string) => string;
}) {
  return (
    <ChipPopup
      title="Left out of Spent"
      trigger={() => (
        <button type="button" className={cn(CHIP_BASE, "bg-[var(--m-sand)] text-muted-foreground")}>
          {label}
          <Icons.ChevronDown className="h-3 w-3" />
        </button>
      )}
    >
      {(open) => (
        <LeftOutBody
          open={open}
          excludedIds={excludedIds}
          categories={categories}
          startDate={startDate}
          endDate={endDate}
          currency={currency}
          periodWord={periodWord}
          hrefFor={hrefFor}
        />
      )}
    </ChipPopup>
  );
}

function LeftOutBody({
  open,
  excludedIds,
  categories,
  startDate,
  endDate,
  currency,
  periodWord,
  hrefFor,
}: {
  open: boolean;
  excludedIds: string[];
  categories: { id: string; name: string; parentId?: string | null }[];
  startDate: string;
  endDate: string;
  currency: string;
  periodWord?: string;
  hrefFor: (id: string) => string;
}) {
  const allIds = useMemo(() => excludedWithDescendants(excludedIds, categories), [excludedIds, categories]);
  const search = useCashActivitySearch(
    { categoryIds: allIds, startDate, endDate, sortBy: "date", sortDir: "desc" },
    { pageSize: 500, enabled: open && allIds.length > 0 },
  );
  // Read every page, so the figures are the whole period's.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = search;
  useEffect(() => {
    if (open && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [open, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const rows = useMemo(
    () => leftOutByCategory(search.items, excludedIds, categories),
    [search.items, excludedIds, categories],
  );
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const loading = search.isLoading || hasNextPage;
  const nothing = !loading && rows.length === 0;
  // Categories set to be left out that had nothing in the period are named, so none seems lost.
  const quiet = excludedIds
    .filter((id) => !rows.some((r) => r.id === id))
    .map((id) => categories.find((c) => c.id === id)?.name)
    .filter((n): n is string => Boolean(n));

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">
        Money that moved{periodWord ? ` ${periodWord}` : ""} but is not counted as spending.
      </p>
      {loading ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : search.isError ? (
        <p className="text-muted-foreground text-xs">Could not load these. Try again in a moment.</p>
      ) : nothing ? (
        <p className="text-muted-foreground text-xs">Nothing went through these categories in this period.</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((r) => (
            <li key={r.id} className="border-border/50 flex items-center justify-between gap-3 border-b py-1.5 last:border-b-0">
              <Link
                to={hrefFor(r.id)}
                className="min-w-0 truncate text-[13px] hover:underline"
              >
                {r.name}
                <span className="text-muted-foreground"> · {r.count}</span>
              </Link>
              <span className="text-[13px] tabular-nums">
                <PrivacyAmount value={r.amount} currency={currency} />
              </span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 pt-2 text-[13px] font-medium">
            <span>Left out in total</span>
            <span className="tabular-nums">
              <PrivacyAmount value={total} currency={currency} />
            </span>
          </li>
        </ul>
      )}
      {!loading && quiet.length > 0 && rows.length > 0 ? (
        <p className="text-muted-foreground text-[11.5px]">Nothing this period: {quiet.join(", ")}.</p>
      ) : null}
      <Link
        to="/settings/spending/categories"
        className="text-muted-foreground hover:text-foreground self-start text-xs underline underline-offset-4"
      >
        Change which are left out
      </Link>
    </div>
  );
}

/** The change from the prior period as a chip; tap it for the categories that moved it. */
export function WhyMovedChip({
  chip,
  rows,
  delta,
  currency,
  priorLabel,
  hrefFor,
}: {
  /** The chip's face (the existing change line). */
  chip: ReactNode;
  rows: WhereItWentRow[];
  delta: number;
  currency: string;
  priorLabel?: string;
  hrefFor: (id: string) => string;
}) {
  const up = delta > 0;
  const { movers, restDelta, restCount, againstDelta } = useMemo(() => topMovers(rows, delta), [rows, delta]);
  return (
    <ChipPopup
      title={up ? "Why it rose" : "Why it fell"}
      trigger={() => (
        <button type="button" className="rounded-full text-left transition-opacity hover:opacity-80" aria-label={up ? "Why spending rose" : "Why spending fell"}>
          {chip}
        </button>
      )}
    >
      {() => (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs">
            Compared with {priorLabel ?? "the prior period"}. The biggest changes first.
          </p>
          {movers.length === 0 ? (
            <p className="text-muted-foreground text-xs">No single category moved it.</p>
          ) : (
            <ul className="flex flex-col">
              {movers.map((m) => (
                <li key={m.id} className="border-border/50 border-b last:border-b-0">
                  <Link to={hrefFor(m.id)} className="flex items-center gap-2.5 py-1.5 hover:opacity-80">
                    <CategoryMark icon={m.icon} color={m.color} />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{m.name}</span>
                    <span className={cn("text-[13px] tabular-nums", m.delta > 0 ? "text-[var(--m-warn)]" : "text-[var(--m-up)]")}>
                      {m.delta > 0 ? "+" : "−"}
                      <PrivacyAmount value={Math.abs(m.delta)} currency={currency} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {restCount > 0 ? (
            <p className="text-muted-foreground text-xs">
              {restCount} smaller {restCount === 1 ? "change" : "changes"}, {restDelta > 0 ? "+" : "−"}
              <PrivacyAmount value={Math.abs(restDelta)} currency={currency} />
            </p>
          ) : null}
          {Math.abs(againstDelta) >= 1 ? (
            <p className="text-muted-foreground text-xs">
              Other categories went {againstDelta < 0 ? "down" : "up"}{" "}
              <PrivacyAmount value={Math.abs(againstDelta)} currency={currency} />.
            </p>
          ) : null}
        </div>
      )}
    </ChipPopup>
  );
}
