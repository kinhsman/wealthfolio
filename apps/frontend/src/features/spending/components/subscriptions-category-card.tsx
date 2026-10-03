// money-hub patch: circle pie chart widget showing subscriptions and bills total amount by category
import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { Icons, PrivacyAmount } from "@wealthfolio/ui";
import { useTaxonomy } from "@/hooks/use-taxonomies";
import type { Stream } from "../lib/subscriptions";
import { CategoryMark } from "./category-chips";

const SPENDING_TAXONOMY = "spending_categories";

const FALLBACK_COLORS = [
  "#22c55e", // emerald
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#ec4899", // pink
  "#8b5cf6", // purple
  "#06b6d4", // cyan
  "#f97316", // orange
  "#14b8a6", // teal
  "#6366f1", // indigo
  "#a855f7", // violet
  "#64748b", // slate
];

export interface CategoryItem {
  id: string;
  name: string;
  icon: string | null;
  color: string;
  amount: number;
  percentage: number;
  count: number;
}

function CategoryTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: any[];
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload as CategoryItem;
  return (
    <div className="rounded-xl border border-[var(--m-line)] bg-[var(--m-surface)] px-3 py-2 shadow-lg text-xs">
      <div className="flex items-center gap-1.5 font-medium text-[var(--m-ink)]">
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
        <span className="truncate">{item.name}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3 text-[11.5px] tabular-nums text-[var(--m-muted)]">
        <span><PrivacyAmount value={item.amount} currency={currency} />/mo</span>
        <span className="font-medium text-[var(--m-ink-2)]">{item.percentage.toFixed(1)}%</span>
      </div>
    </div>
  );
}

export function SubscriptionsCategoryWidget({
  items,
  currency = "USD",
}: {
  items: Stream[];
  currency?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const { data: taxonomy } = useTaxonomy(SPENDING_TAXONOMY);

  const categoryMap = useMemo(() => {
    const map = new Map<string, { name: string; icon: string | null; color: string | null }>();
    if (!taxonomy?.categories) return map;
    for (const c of taxonomy.categories) {
      const parent = c.parentId ? taxonomy.categories.find((x) => x.id === c.parentId) : undefined;
      map.set(c.id, {
        name: c.name,
        icon: c.icon ?? parent?.icon ?? null,
        color: c.color ?? parent?.color ?? null,
      });
    }
    return map;
  }, [taxonomy]);

  const { list, total } = useMemo(() => {
    const map = new Map<string, { id: string; name: string; icon: string | null; color: string; amount: number; count: number }>();
    let sum = 0;

    // Only active repeating streams count (escrow is paid in mortgage)
    const counted = items.filter((s) => s.status !== "stopped" && !s.escrow);

    for (const s of counted) {
      const catId = s.categoryId || "uncategorized";
      const cat = catId !== "uncategorized" ? categoryMap.get(catId) : null;
      const name = cat?.name || (catId === "uncategorized" ? "Uncategorized" : "Other");
      const icon = cat?.icon || null;
      const color = cat?.color || null;

      const current = map.get(catId) ?? { id: catId, name, icon, color: color || "", amount: 0, count: 0 };
      current.amount += s.monthly;
      current.count += 1;
      sum += s.monthly;
      map.set(catId, current);
    }

    const itemsList = Array.from(map.values())
      .map((c, index) => ({
        ...c,
        color: c.color || (c.id === "uncategorized" ? "#94a3b8" : FALLBACK_COLORS[index % FALLBACK_COLORS.length]),
        amount: Math.round(c.amount * 100) / 100,
        percentage: sum > 0 ? (c.amount / sum) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return { list: itemsList, total: Math.round(sum * 100) / 100 };
  }, [items, categoryMap]);

  if (list.length === 0) return null;

  const visibleList = showAll ? list : list.slice(0, 5);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 pb-1">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-medium">By category</h2>
          <span className="hidden text-[12.5px] text-[var(--m-muted)] sm:inline">Monthly spending.</span>
        </div>
        <span className="shrink-0 whitespace-nowrap text-[13px] tabular-nums text-[var(--m-muted)] [&>span:first-child]:font-medium [&>span:first-child]:text-[var(--m-ink)]">
          <PrivacyAmount value={total} currency={currency} /> a month
        </span>
      </div>

      {/* Circle pie chart */}
      <div className="flex items-center justify-center py-2">
        <PieChart width={160} height={160}>
          <Pie
            data={list}
            dataKey="amount"
            nameKey="name"
            cx={80}
            cy={80}
            outerRadius={70}
            innerRadius={0}
            stroke="var(--m-surface)"
            strokeWidth={1.5}
            isAnimationActive={false}
          >
            {list.map((entry) => (
              <Cell key={`pie-cell-${entry.id}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CategoryTooltip currency={currency} />} />
        </PieChart>
      </div>

      {/* Category breakdown with total amount */}
      <div className="divide-y divide-[var(--m-line-soft)] border-t border-[var(--m-line-soft)] pt-1">
        {visibleList.map((cat) => (
          <div key={cat.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
            <div className="flex min-w-0 items-center gap-2">
              <CategoryMark icon={cat.icon} color={cat.color} size="sm" />
              <span className="truncate font-medium">{cat.name}</span>
              <span className="text-[11px] tabular-nums text-[var(--m-muted)]">
                {cat.percentage.toFixed(0)}%
              </span>
            </div>
            <span className="shrink-0 text-right tabular-nums">
              <PrivacyAmount value={cat.amount} currency={currency} />
            </span>
          </div>
        ))}
      </div>

      {list.length > 5 ? (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="mt-1 flex w-full items-center justify-center gap-1 border-t border-[var(--m-line-soft)] pt-2 text-center text-xs text-[var(--m-muted)] hover:text-[var(--m-ink)]"
        >
          <span>{showAll ? "Show less" : `Show ${list.length - 5} more`}</span>
          {showAll ? <Icons.ChevronUp className="h-3 w-3" /> : <Icons.ChevronDown className="h-3 w-3" />}
        </button>
      ) : null}
    </div>
  );
}
