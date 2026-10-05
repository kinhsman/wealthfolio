// money-hub patch: the Category line of the Transfer edit window (owner, 2026-10-05: "when i click on
// edit modal i dont see an option to change category"). A payment to a card that is not one of his
// accounts (Apple Card) is a transfer that counts in Spending, so its row has a Category column, but
// its Edit window is the Transfer form and had no way to set one. The Transactions tab hands this
// line to that form (pages/activity/components/activity-form.tsx, mobile-forms/mobile-activity-form.tsx)
// and saves the pick when the transfer itself is saved.
import { useTranslation } from "react-i18next";

import { Icons } from "@wealthfolio/ui";

import { CategoryMark } from "./category-chips";
import { QuickCategorizePopover, type QuickCategorizeScope } from "./quick-categorize-popover";

export interface TransferPick {
  taxonomyId: string;
  categoryId: string;
}

interface CategoryLook {
  name: string;
  color: string | null;
  icon?: string | null;
  parentId?: string | null;
}

export function TransferCategoryField({
  value,
  scope,
  categories,
  onChange,
}: {
  value: TransferPick | null;
  scope: QuickCategorizeScope;
  categories: Map<string, CategoryLook>;
  /** null clears the category. */
  onChange: (pick: TransferPick | null) => void;
}) {
  const { t } = useTranslation();
  const current = value ? categories.get(value.categoryId) : undefined;
  const parent = current?.parentId ? categories.get(current.parentId) : undefined;
  const label =
    scope === "saving"
      ? t("spending:cashForm.savingsCategory")
      : scope === "income"
        ? t("spending:cashForm.incomeSource")
        : t("spending:cashForm.spendingCategory");
  return (
    <div className="space-y-2" data-testid="transfer-category-field">
      <div className="text-sm font-medium leading-none">{label}</div>
      <QuickCategorizePopover
        scope={scope}
        selectedCategoryId={value?.categoryId ?? null}
        onSelect={(taxonomyId, categoryId) => onChange({ taxonomyId, categoryId })}
        onClear={() => onChange(null)}
        trigger={
          <button
            type="button"
            className="border-input bg-input-bg dark:bg-input/30 hover:bg-accent/30 ring-offset-background focus:ring-ring h-input-height flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2"
            aria-label={
              current
                ? t("spending:transactions.changeCategory", { name: current.name })
                : t("spending:cashForm.pickCategory")
            }
          >
            {current ? (
              <span className="flex min-w-0 items-center gap-2">
                <CategoryMark
                  icon={current.icon ?? parent?.icon}
                  color={current.color ?? parent?.color}
                />
                <span className="truncate">
                  {parent ? `${parent.name} / ` : ""}
                  {current.name}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">{t("spending:cashForm.pickCategoryOptional")}</span>
            )}
            <Icons.ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
          </button>
        }
      />
    </div>
  );
}
