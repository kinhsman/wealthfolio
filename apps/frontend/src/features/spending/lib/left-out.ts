import type { CashActivity } from "../types/cash-activity";

export interface LeftOutCategory {
  id: string;
  name: string;
  /** Money that went out under this category (and its subcategories) in the period, as a positive figure. */
  amount: number;
  count: number;
}

interface CategoryNode {
  id: string;
  name: string;
  parentId?: string | null;
}

/** The excluded category and everything under it, so a transaction filed in a subcategory is found. */
export function excludedWithDescendants(
  excludedIds: string[],
  categories: CategoryNode[],
): string[] {
  const out = new Set(excludedIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of categories) {
      if (c.parentId && out.has(c.parentId) && !out.has(c.id)) {
        out.add(c.id);
        grew = true;
      }
    }
  }
  return [...out];
}

/**
 * money-hub patch (owner, 10-18): what "5 categories excluded" left out. The report has no figure for
 * the excluded categories, so it is rebuilt from the transactions filed under them: money out (netAmountBase
 * below zero) counts, money in does not. A split transaction counts its own split amounts. Biggest first;
 * a category with nothing in the period is left off the list.
 */
export function leftOutByCategory(
  items: CashActivity[],
  excludedIds: string[],
  categories: CategoryNode[],
): LeftOutCategory[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const rootOf = (id: string): string | null => {
    let cur: string | null | undefined = id;
    let hit: string | null = null;
    for (let guard = 0; cur && guard < 12; guard++) {
      if (excludedIds.includes(cur)) hit = cur;
      cur = byId.get(cur)?.parentId;
    }
    return hit;
  };

  const totals = new Map<string, { amount: number; count: number }>();
  const add = (rootId: string, amount: number) => {
    const t = totals.get(rootId) ?? { amount: 0, count: 0 };
    t.amount += amount;
    t.count += 1;
    totals.set(rootId, t);
  };

  for (const a of items) {
    const out = -(a.netAmountBase ?? 0);
    if (!(out > 0)) continue;
    const splits = a.splits ?? [];
    if (splits.length > 0) {
      const gross = splits.reduce((s, x) => s + Math.abs(Number(x.amount) || 0), 0);
      for (const sp of splits) {
        const root = rootOf(sp.categoryId);
        if (root && gross > 0) add(root, (out * Math.abs(Number(sp.amount) || 0)) / gross);
      }
      continue;
    }
    const cat = a.assignments?.[0]?.categoryId;
    const root = cat ? rootOf(cat) : null;
    if (root) add(root, out);
  }

  return [...totals.entries()]
    .map(([id, t]) => ({ id, name: byId.get(id)?.name ?? id, amount: t.amount, count: t.count }))
    .filter((r) => r.amount > 0.005)
    .sort((x, y) => y.amount - x.amount);
}
