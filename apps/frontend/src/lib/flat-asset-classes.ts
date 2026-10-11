import type { PortfolioAllocations, TaxonomyAllocation } from "@/lib/types";

/**
 * money-hub patch (owner, 2026-10-10): asset classes are shown flat, one row per class
 * ("Stocks & ETFs", "Cash", "Stock Options"), never a class with a sub-type under it.
 *
 * This is applied ONCE, where the allocations are loaded (`usePortfolioAllocations` with
 * `flatAssetClasses`), so the Insights list, its detail sheet, the cards and the Net worth page
 * all read the same flat data and cannot disagree. A class already carries its whole value, so
 * its sub-rows are dropped, not re-added. The class id still names the holdings behind a row.
 *
 * Labels: the base classes have fixed ids (EQUITY). "Options" is made by the WheelTradr sync
 * service (money-hub lib/wheeltradr.js, key MH_OPTIONS) with a generated id, so it is matched by
 * its name, the only handle the allocation carries.
 */
const LABEL_BY_ID: Record<string, string> = { EQUITY: "Stocks & ETFs" };
const LABEL_BY_NAME: Record<string, string> = { options: "Stock Options" };

export function flattenAssetClasses(allocation: TaxonomyAllocation): TaxonomyAllocation {
  return {
    ...allocation,
    categories: allocation.categories.map((category) => ({
      ...category,
      categoryName:
        LABEL_BY_ID[category.categoryId] ??
        LABEL_BY_NAME[category.categoryName.trim().toLowerCase()] ??
        category.categoryName,
      children: undefined,
    })),
  };
}

export function withFlatAssetClasses(allocations: PortfolioAllocations): PortfolioAllocations {
  return { ...allocations, assetClasses: flattenAssetClasses(allocations.assetClasses) };
}
