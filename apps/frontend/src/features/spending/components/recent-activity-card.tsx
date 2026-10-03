import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { DashboardCard } from "@/components/dashboard-card";
import { QueryKeys } from "@/lib/query-keys";
import type { Account, Activity } from "@/lib/types";
import { cn, formatDateISO } from "@/lib/utils";
import { PrivacyAmount, useDateFormatting } from "@wealthfolio/ui";

import { getActivityAssignments } from "../adapters/cash-activities";
import {
  getActivitySpendingAmount,
  getEffectiveCashActivityType,
  isCashActivityIncome,
} from "../lib/constants";
import { CategoryBadge, ReviewPill, type CategoryMetaMap } from "./category-chips";
import { bankWordsFor, useBankLines } from "../lib/bank-lines";
import { useNotes } from "../lib/notes";
import { merchantFor, useMerchants } from "../lib/merchants";
import { MerchantLogo } from "./merchant-logo";
import { usePendingTransactions, type PendingTransaction } from "./pending-transactions";
import { PhoneFold } from "./phone-fold";
import { useShownAmount } from "@/lib/display-currency";

const SPENDING_TAXONOMY = "spending_categories";

export function RecentActivityCard({
  activities,
  accountTypeById,
  accountById,
  categoriesMeta,
  uncategorizedCount = 0,
  pendingRange,
}: {
  activities: Activity[];
  accountTypeById?: Map<string, string>;
  /** money-hub patch: each row's account, for the bank logo on ATM cash (lib/merchants.ts). */
  accountById?: Map<string, Account>;
  categoriesMeta: CategoryMetaMap;
  uncategorizedCount?: number;
  /** money-hub patch: the period shown (YYYY-MM-DD); bank entries not posted yet inside it are
   *  listed first in their day, read-only (components/pending-transactions.tsx). */
  pendingRange?: { from?: string; to?: string };
}) {
  const shown = useShownAmount();   // money-hub patch: Show in USD (lib/display-currency.ts)
  const formatting = useDateFormatting();
  const { t } = useTranslation();
  const { data: merchants } = useMerchants();
  const { data: bankLines } = useBankLines();
  const { data: notesById } = useNotes();
  const { data: pendingAll = [] } = usePendingTransactions();
  const pending = useMemo(
    () =>
      pendingAll.filter(
        (p) =>
          (!accountById || accountById.has(p.accountId)) &&
          (!pendingRange?.from || p.date >= pendingRange.from) &&
          (!pendingRange?.to || p.date <= pendingRange.to),
      ),
    [pendingAll, accountById, pendingRange?.from, pendingRange?.to],
  );
  const recent = useMemo(() => {
    return activities
      .slice()
      .filter((activity) => {
        const accountType = accountTypeById?.get(activity.accountId);
        const activityType = getEffectiveCashActivityType(activity);
        return (
          getActivitySpendingAmount(activity, accountType) !== 0 ||
          isCashActivityIncome(activityType, accountType, activity.subtype)
        );
      })
      .sort((a, b) => b.activityDate.localeCompare(a.activityDate))
      .slice(0, 10);
  }, [activities, accountTypeById]);

  const assignmentQueries = useQueries({
    queries: recent.map((a) => ({
      queryKey: [QueryKeys.SPENDING_TRANSACTIONS, "assignments", a.id],
      queryFn: () => getActivityAssignments(a.id),
      staleTime: 30_000,
    })),
  });

  const badgeByActivityId = useMemo(() => {
    const out = new Map<
      string,
      { name: string; color: string | null; icon: string | null } | null
    >();
    recent.forEach((a, i) => {
      const assignments = assignmentQueries[i]?.data ?? [];
      const spending = assignments.find((x) => x.taxonomyId === SPENDING_TAXONOMY);
      if (!spending) {
        out.set(a.id, null);
        return;
      }
      const meta = categoriesMeta.get(spending.categoryId);
      const topId = meta?.parentId ?? spending.categoryId;
      const top = categoriesMeta.get(topId) ?? meta;
      if (!top) {
        out.set(a.id, null);
        return;
      }
      out.set(a.id, {
        name: top.name,
        color: top.color,
        icon: meta?.icon ?? top.icon,
      });
    });
    return out;
  }, [recent, assignmentQueries, categoriesMeta]);

  // Pending entries first in their day; ten rows in all, as before.
  type Row = { kind: "posted"; a: Activity } | { kind: "pending"; p: PendingTransaction };
  const grouped = useMemo(() => {
    const rows: { key: string; row: Row }[] = [
      ...pending.map((p) => ({ key: `${p.date}~`, row: { kind: "pending" as const, p } })),
      ...recent.map((a) => ({ key: a.activityDate, row: { kind: "posted" as const, a } })),
    ]
      .sort((x, y) => (y.key < x.key ? -1 : y.key > x.key ? 1 : 0))   // code order: "~" after "T"
      .slice(0, 10);
    const m = new Map<string, Row[]>();
    for (const { key, row } of rows) {
      const dateKey = key.slice(0, 10);
      const arr = m.get(dateKey) ?? [];
      arr.push(row);
      m.set(dateKey, arr);
    }
    return Array.from(m.entries());
  }, [recent, pending]);

  const dayLabel = (key: string): string => {
    const today = new Date();
    const todayKey = formatDateISO(today);
    const yest = new Date(today);
    yest.setDate(today.getDate() - 1);
    const yestKey = formatDateISO(yest);
    if (key === todayKey) return t("spending:dashboard.today");
    if (key === yestKey) return t("spending:dashboard.yesterday");
    return formatting.formatCalendarDate(key, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <DashboardCard
      title={t("spending:dashboard.recentActivity")}
      padded={false}
      className="overflow-hidden"
      action={
        <Link
          to={
            uncategorizedCount > 0
              ? "/activities?tab=spending&status=uncategorized"
              : "/activities?tab=spending"
          }
          className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
        >
          {t("spending:dashboard.viewAll").replace(/\s*→\s*$/, "")}
        </Link>
      }
    >
      {grouped.length === 0 ? (
        <div className="text-muted-foreground px-4 py-6 text-center text-xs md:px-5">
          {t("spending:dashboard.noRecentActivity")}
        </div>
      ) : (
        <div className="grid gap-x-7 px-4 pb-2 max-md:px-3 max-md:pb-0 md:px-5 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
        {(() => {
        // money-hub patch: on a phone the latest day shows and the others fold behind a Show more row;
        // each row is two lines there, the name over its category (approved phone design, 10-02).
        const renderDay = ([dateKey, items]: (typeof grouped)[number]) => (
          <div key={dateKey} className="min-w-0 py-2 max-md:py-1">
            <div className="text-muted-foreground border-border/60 border-b pb-1 text-xs">
              {dayLabel(dateKey)}
            </div>
            {items.map((row) => {
              if (row.kind === "pending") {
                const p = row.p;
                const name = p.notes || p.bankText;
                const merchant = merchantFor(name, merchants, accountById?.get(p.accountId), p.amount < 0 ? "WITHDRAWAL" : "DEPOSIT");
                return (
                  <div key={p.id} className="flex items-center gap-2.5 py-1.5 opacity-70" title="Not posted by the bank yet. Editable once it posts.">
                    {merchant ? <MerchantLogo url={merchant.logoUrl} name={merchant.name} whole={merchant.source === "bank"} className="h-6 w-6 max-md:h-7 max-md:w-7" /> : null}
                    <div className="min-w-0 flex-1 md:flex md:items-center md:gap-2.5">
                      <div className="text-foreground/90 min-w-0 truncate text-xs font-medium md:flex-1 max-md:text-[13px]">{name}</div>
                      <span className="text-muted-foreground inline-block shrink-0 rounded-full border border-dashed px-1.5 py-px text-[10px] font-medium uppercase tracking-wide max-md:mt-0.5">
                        Pending
                      </span>
                    </div>
                    <div className={cn("shrink-0 text-xs font-semibold tabular-nums", p.amount < 0 ? "text-foreground" : "text-success")}>
                      {p.amount < 0 ? "−" : "+"}
                      <PrivacyAmount value={Math.abs(p.amount)} currency={p.currency} />
                    </div>
                  </div>
                );
              }
              const a = row.a;
              const payee = (a.notes ?? "").trim();
              const merchant = merchantFor(payee, merchants, accountById?.get(a.accountId), getEffectiveCashActivityType(a), bankWordsFor(bankLines, a.id, notesById));
              const spendingAmount = getActivitySpendingAmount(
                a,
                accountTypeById?.get(a.accountId),
              );
              const isOutflow = spendingAmount > 0;
              const amount =
                spendingAmount === 0 ? parseFloat(a.amount ?? "0") || 0 : Math.abs(spendingAmount);
              const display = shown(amount, a.currency, a.accountId);
              const badge = badgeByActivityId.get(a.id);
              const needsReview = a.needsReview || (isOutflow && !badge);

              return (
                // Single transaction row → activities page filtered to this
                // payee (or status=uncategorized when there's no payee +
                // it's flagged for review). Matches the clickable behavior
                // of every neighboring spending widget (ranked bar rows,
                // treemap cells, budget rings) so this row no longer feels
                // like a dead row sandwiched between live ones.
                <Link
                  key={a.id}
                  to={
                    needsReview && !payee
                      ? "/activities?tab=spending&status=uncategorized"
                      : payee
                        ? `/activities?tab=spending&q=${encodeURIComponent(payee)}`
                        : "/activities?tab=spending"
                  }
                  className="hover:bg-muted/40 flex items-center gap-2.5 rounded-md py-1.5 transition-colors"
                >
                  {/* money-hub patch: the owner's merchant logo (lib/merchants.ts). */}
                  {merchant ? <MerchantLogo url={merchant.logoUrl} name={merchant.name} whole={merchant.source === "bank"} className="h-6 w-6 max-md:h-7 max-md:w-7" /> : null}
                  <div className="min-w-0 flex-1 md:flex md:items-center md:gap-2.5">
                    <div className="text-foreground/90 min-w-0 truncate text-xs font-medium md:flex-1 max-md:text-[13px]">
                      {payee || (
                        <span className="text-muted-foreground italic">
                          {t("spending:dashboard.noPayee")}
                        </span>
                      )}
                    </div>
                    {badge ? (
                      <div className="shrink-0 max-md:mt-0.5 max-md:flex">
                        <CategoryBadge name={badge.name} color={badge.color} icon={badge.icon} />
                      </div>
                    ) : needsReview ? (
                      <div className="shrink-0 max-md:mt-0.5 max-md:flex">
                        <ReviewPill label={t("spending:dashboard.uncategorized")} />
                      </div>
                    ) : null}
                  </div>
                  <div
                    className={cn(
                      "shrink-0 text-xs font-semibold tabular-nums",
                      isOutflow ? "text-foreground" : "text-success",
                    )}
                  >
                    {isOutflow ? "−" : "+"}
                    <PrivacyAmount value={display.amount} currency={display.currency} />
                  </div>
                </Link>
              );
            })}
          </div>
        );
        const [first, ...rest] = grouped;
        return (
          <>
            {renderDay(first)}
            {rest.length > 0 ? (
              <PhoneFold
                id="activity"
                closedLabel={`Show ${rest.length} more ${rest.length === 1 ? "day" : "days"}`}
                openLabel="Show less"
              >
                {rest.map(renderDay)}
              </PhoneFold>
            ) : null}
          </>
        );
        })()}
        </div>
      )}
    </DashboardCard>
  );
}
