// money-hub patch: circle donut chart widget showing subscriptions and bills total amount by category
import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { Icons, PrivacyAmount } from "@wealthfolio/ui";
import { useTaxonomy } from "@/hooks/use-taxonomies";
import { cn } from "@/lib/utils";
import type { Stream } from "../lib/subscriptions";
import { CategoryIcon } from "./category-chips";

const SPENDING_TAXONOMY = "spending_categories";

const PALETTE = [
  "#06b6d4", // cyan / teal (Shopping in reference)
  "#10b981", // emerald green (Restaurants in reference)
  "#f59e0b", // amber / gold (Groceries in reference)
  "#f97316", // coral orange (Travel in reference)
  "#8b5cf6", // violet / purple (Gas & Electric in reference)
  "#38bdf8", // sky blue (Entertainment in reference)
  "#ec4899", // pink (Medical in reference)
  "#6366f1", // indigo (Taxi in reference)
  "#84cc16", // lime (Home Improvement in reference)
  "#14b8a6", // teal
  "#e11d48", // rose
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

function isEmoji(str: string | null | undefined): boolean {
  if (!str) return false;
  return /\p{Extended_Pictographic}/u.test(str);
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
    <div className="pointer-events-none rounded-xl border border-[var(--m-line)] bg-[var(--m-surface)] px-3 py-2 shadow-lg text-xs">
      <div className="flex items-center gap-1.5 font-medium text-[var(--m-ink)]">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
        <span className="truncate">{item.name}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3 text-[11.5px] tabular-nums text-[var(--m-muted)]">
        <span>
          <PrivacyAmount value={item.amount} currency={currency} />/mo
        </span>
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
  const [hoveredId, setHoveredId] = useState<string | null>(null);
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

  const { rawList, total } = useMemo(() => {
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
        color: (c.color && c.color.trim() !== "") ? c.color : (c.id === "uncategorized" ? "#94a3b8" : PALETTE[index % PALETTE.length]),
        amount: Math.round(c.amount * 100) / 100,
        percentage: sum > 0 ? (c.amount / sum) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return { rawList: itemsList, total: Math.round(sum * 100) / 100 };
  }, [items, categoryMap]);

  // If there are more than 6 categories and not showAll, group the remainder into "Everything else" (matches reference screenshot)
  const chartData = useMemo(() => {
    if (showAll || rawList.length <= 6) return rawList;
    const top = rawList.slice(0, 5);
    const rest = rawList.slice(5);
    const restAmount = rest.reduce((acc, c) => acc + c.amount, 0);
    const restRounded = Math.round(restAmount * 100) / 100;
    const restPct = total > 0 ? (restAmount / total) * 100 : 0;

    return [
      ...top,
      {
        id: "everything_else",
        name: "Everything else",
        icon: null,
        color: "#94a3b8",
        amount: restRounded,
        percentage: restPct,
        count: rest.reduce((acc, c) => acc + c.count, 0),
      },
    ];
  }, [rawList, showAll, total]);

  const hoveredItem = useMemo(() => {
    if (!hoveredId) return null;
    return chartData.find((c) => c.id === hoveredId) ?? null;
  }, [hoveredId, chartData]);

  if (rawList.length === 0) return null;

  return (
    <div className="@container">
      <div className="flex items-baseline justify-between gap-2 pb-1">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-medium">By category</h2>
          <span className="hidden text-[12.5px] text-[var(--m-muted)] sm:inline">Monthly spending</span>
        </div>
      </div>

      <div className="flex flex-col @[440px]:flex-row items-center @[440px]:items-center gap-4 pt-2">
        {/* Donut Chart with center total amount */}
        <div className="relative flex shrink-0 items-center justify-center">
          <PieChart width={160} height={160}>
            <Pie
              data={chartData}
              dataKey="amount"
              nameKey="name"
              cx={80}
              cy={80}
              outerRadius={72}
              innerRadius={48}
              paddingAngle={chartData.length > 1 ? 3 : 0}
              cornerRadius={chartData.length > 1 ? 4 : 0}
              stroke="var(--m-surface)"
              strokeWidth={1.5}
              isAnimationActive={false}
              onMouseEnter={(_, index) => setHoveredId(chartData[index]?.id ?? null)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {chartData.map((entry) => (
                <Cell
                  key={`pie-cell-${entry.id}`}
                  fill={entry.color}
                  style={{
                    opacity: hoveredId && hoveredId !== entry.id ? 0.35 : 1,
                    transition: "opacity 150ms ease-in-out",
                    cursor: "pointer",
                  }}
                />
              ))}
            </Pie>
            <Tooltip content={<CategoryTooltip currency={currency} />} />
          </PieChart>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center select-none">
            <span className="text-base font-bold tabular-nums tracking-tight text-[var(--m-ink)]">
              <PrivacyAmount value={hoveredItem ? hoveredItem.amount : total} currency={currency} />
            </span>
            <span className="max-w-[78px] truncate text-[11px] font-medium text-[var(--m-muted)]">
              {hoveredItem ? hoveredItem.name : "Total"}
            </span>
          </div>
        </div>

        {/* Category breakdown grid matching reference screenshots */}
        <div className="w-full min-w-0 flex-1">
          <div className="grid grid-cols-2 @[560px]:grid-cols-3 gap-x-3 gap-y-2.5">
            {chartData.map((cat) => (
              <div
                key={cat.id}
                onMouseEnter={() => setHoveredId(cat.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={cn(
                  "min-w-0 rounded-lg p-1 -m-1 transition-colors cursor-default",
                  hoveredId === cat.id ? "bg-[var(--m-fill-soft)]" : "hover:bg-[var(--m-fill-soft)]"
                )}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color }}
                    aria-hidden="true"
                  />
                  {cat.id === "everything_else" ? (
                    <Icons.MoreHorizontal className="h-3.5 w-3.5 shrink-0 text-[var(--m-muted)]" />
                  ) : isEmoji(cat.icon) ? (
                    <span className="text-xs leading-none shrink-0" aria-hidden="true">
                      {cat.icon}
                    </span>
                  ) : (
                    <CategoryIcon icon={cat.icon} className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="truncate text-xs font-medium text-[var(--m-ink)]" title={cat.name}>
                    {cat.name}
                  </span>
                </div>
                <div className="pl-3.5 text-[11.5px] tabular-nums text-[var(--m-muted)]">
                  <PrivacyAmount value={cat.amount} currency={currency} />
                  <span className="ml-1 text-[11px] opacity-75">({cat.percentage.toFixed(1)}%)</span>
                </div>
              </div>
            ))}
          </div>

          {rawList.length > 6 ? (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="mt-2.5 flex w-full items-center justify-center gap-1 border-t border-[var(--m-line-soft)] pt-2 text-center text-xs text-[var(--m-muted)] hover:text-[var(--m-ink)] cursor-pointer transition-colors"
            >
              <span>{showAll ? "Show top categories" : `Show all (${rawList.length})`}</span>
              {showAll ? <Icons.ChevronUp className="h-3 w-3" /> : <Icons.ChevronDown className="h-3 w-3" />}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
