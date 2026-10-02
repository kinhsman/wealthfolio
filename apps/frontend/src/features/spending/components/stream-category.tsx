// money-hub patch: a subscription's or bill's spending category as the app draws it everywhere else
// (owner, 10-02: "wire the app's category icon to these pages"): the icon and colour set on Settings,
// Spending, Categories, from the same taxonomy the transactions list reads.
import { useMemo } from "react";

import { useTaxonomy } from "@/hooks/use-taxonomies";
import { cn } from "@/lib/utils";

import { CategoryIcon, type CategoryMeta } from "./category-chips";

const SPENDING_TAXONOMY = "spending_categories";

/** Its category's name, icon and colour (a child without a colour takes its parent's). */
export function useStreamCategory(categoryId: string | null | undefined): CategoryMeta | null {
  const { data } = useTaxonomy(SPENDING_TAXONOMY);
  return useMemo(() => {
    if (!categoryId || !data) return null;
    const c = data.categories.find((x) => x.id === categoryId);
    if (!c) return null;
    const parent = c.parentId ? data.categories.find((x) => x.id === c.parentId) : undefined;
    return { name: c.name, icon: c.icon ?? parent?.icon ?? null, color: c.color ?? parent?.color ?? null, parentId: c.parentId ?? null };
  }, [categoryId, data]);
}

/** The icon in the category's colour, and its name unless `iconOnly` (then the name is the tooltip). */
export function StreamCategory({
  categoryId,
  iconOnly,
  className,
}: {
  categoryId: string | null | undefined;
  iconOnly?: boolean;
  className?: string;
}) {
  const c = useStreamCategory(categoryId);
  if (!c) return null;
  return (
    <span title={c.name} className={cn("inline-flex min-w-0 items-center gap-1 align-[-2px]", className)}>
      <span style={{ color: c.color ?? undefined }} className={cn("inline-flex shrink-0", !c.color && "text-muted-foreground")}>
        <CategoryIcon icon={c.icon} fallback={c.name} className="h-3.5 w-3.5" />
      </span>
      {iconOnly ? <span className="sr-only">{c.name}</span> : <span className="truncate">{c.name}</span>}
    </span>
  );
}
