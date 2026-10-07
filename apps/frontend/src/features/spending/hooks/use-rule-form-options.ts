// The categories and accounts a rule can point at: shared by the one rule window (components/rule-dialog.tsx)
// and the Rules page, so both list the same choices.
import { useMemo } from "react";

import { useAccounts } from "@/hooks/use-accounts";
import { useNameComparator } from "@/hooks/use-name-comparator";
import { useTaxonomy } from "@/hooks/use-taxonomies";
import type { TaxonomyCategory } from "@/lib/types";

import type { RuleFormAccountOption, RuleFormCategoryOption } from "../components/rule-form";
import { isSpendingAccountType } from "../lib/constants";
import { useSpendingSettings } from "./use-spending-settings";

export const SPENDING_TAXONOMY = "spending_categories";
export const INCOME_TAXONOMY = "income_sources";
export const SAVINGS_TAXONOMY = "savings_categories";

export function useRuleFormOptions() {
  const compareNames = useNameComparator();
  const { accountIds } = useSpendingSettings();
  const { accounts } = useAccounts({ filterActive: false });
  const spending = useTaxonomy(SPENDING_TAXONOMY);
  const income = useTaxonomy(INCOME_TAXONOMY);
  const savings = useTaxonomy(SAVINGS_TAXONOMY);

  const categoryOptions = useMemo(() => {
    const buildOptions = (taxonomyId: string, cats: TaxonomyCategory[]) => {
      const byId = new Map(cats.map((c) => [c.id, c]));
      return cats
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => {
          const parent = c.parentId ? byId.get(c.parentId) : null;
          return {
            value: `${taxonomyId}:${c.id}`,
            label: c.name,
            taxonomyId,
            categoryId: c.id,
            color: c.color,
            parentName: parent?.name ?? null,
          } satisfies RuleFormCategoryOption;
        });
    };
    return [
      ...buildOptions(SPENDING_TAXONOMY, spending.data?.categories ?? []),
      ...buildOptions(INCOME_TAXONOMY, income.data?.categories ?? []),
      ...buildOptions(SAVINGS_TAXONOMY, savings.data?.categories ?? []),
    ];
  }, [spending.data?.categories, income.data?.categories, savings.data?.categories]);

  // Only tracked spending accounts are offered: a rerun walks just those accounts, so a rule scoped
  // anywhere else could never fire.
  const accountOptions = useMemo(() => {
    const tracked = new Set(accountIds);
    return accounts
      .filter((a) => isSpendingAccountType(a.accountType) && tracked.has(a.id))
      .map((a) => ({ id: a.id, name: a.name }) satisfies RuleFormAccountOption)
      .sort((a, b) => compareNames(a.name, b.name));
  }, [accounts, accountIds, compareNames]);

  return {
    categoryOptions,
    accountOptions,
    isLoading: spending.isLoading || income.isLoading || savings.isLoading,
    isError: spending.isError || income.isError || savings.isError,
    error: spending.error ?? income.error ?? savings.error ?? null,
  };
}
