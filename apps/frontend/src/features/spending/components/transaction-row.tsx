import { memo, type Ref } from "react";
import { useTranslation } from "react-i18next";

import type { Account } from "@/lib/types";
import { TruncatedText } from "@/components/truncated-text";

import { bankLineFor, bankWordsFor, useBankLines } from "../lib/bank-lines";
import { HOVER_SLOT } from "@/lib/hover-slot";
import { cn } from "@/lib/utils";
import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icons,
  PrivacyAmount,
  TableCell,
  TableRow,
  useDateFormatting,
} from "@wealthfolio/ui";

import { getEffectiveCashActivityType, isCreditCardAccountType } from "../lib/constants";
import {
  getTransactionDisplay,
  getTransferLinkStatus,
  isTransferCashActivity,
  type TransactionRowVM,
} from "../lib/transactions-helpers";
import { QuickCategorizePopover } from "./quick-categorize-popover";
import { QuickEventPopover } from "./quick-event-popover";
import { useMerchantFor } from "../lib/merchants";
import { canSetCountsAs, countsAsStore } from "../lib/counts-as";
import { MerchantLogo } from "./merchant-logo";
import { AccountMark } from "./account-mark";
import { useNotes } from "../lib/notes";
import { useRuleRename } from "../lib/rule-renames";
import { PendingChangeTag } from "./pending-change-tag";
import { purchaseOf, trackReturnStore, useReturnMarks } from "../lib/returns";
import { canLinkCharge, linkCharge } from "../lib/track-charge";
import { ReturnBadge } from "./return-badge";
import { AssetChip } from "@/features/asset-charges/components/asset-chip";
import { AmazonOrderLine } from "./amazon-order";
import { useAmazonLinks } from "../lib/amazon";
import { CategoryMark } from "./category-chips";
import { useShownAmount } from "@/lib/display-currency";

interface TransactionRowProps {
  row: TransactionRowVM;
  account: Account | undefined;
  event: { id: string; name: string; eventTypeId: string } | null;
  eventTypeColor: string | null;
  appTimezone?: string;
  /** True when the loaded result set spans more than one account: the Account column shows. */
  showAccount: boolean;
  /** money-hub patch: day groups switched off, so the date gets its own column. */
  showDate?: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onAssignCategory: (activityId: string, taxonomyId: string, categoryId: string) => void;
  onClearCategory: (activityId: string, taxonomyId: string) => void;
  onSetEvent: (activityId: string, eventId: string | null) => void;
  onMarkReimbursement: (row: TransactionRowVM) => void;
  onEditSplits: (row: TransactionRowVM) => void;
  onEdit: (row: TransactionRowVM) => void;
  onDuplicate: (row: TransactionRowVM) => void;
  onDelete: (row: TransactionRowVM) => void;
  onLinkTransfer?: (row: TransactionRowVM) => void;
  onUnlinkTransfer?: (row: TransactionRowVM) => void;
  /**
   * Virtualizer wiring: it measures the rendered row through the ref and
   * identifies it by `data-index`. Both are unset when the list renders
   * unvirtualized.
   */
  ref?: Ref<HTMLTableRowElement>;
  "data-index"?: number;
}

/** Shown only on row hover/focus, so an unset slot costs nothing at rest. */
function TransactionRowImpl({
  ref,
  "data-index": dataIndex,
  row,
  account,
  event,
  eventTypeColor,
  appTimezone,
  showAccount,
  showDate = false,
  isSelected,
  onToggleSelect,
  onAssignCategory,
  onClearCategory,
  onSetEvent,
  onMarkReimbursement,
  onEditSplits,
  onEdit,
  onDuplicate,
  onDelete,
  onLinkTransfer,
  onUnlinkTransfer,
}: TransactionRowProps) {
  const shown = useShownAmount();   // money-hub patch: Show in USD (lib/display-currency.ts)
  const { formatDate } = useDateFormatting();

  const { t } = useTranslation();
  const a = row.activity;
  const { data: bankLines } = useBankLines();
  const { data: notesById } = useNotes();
  const merchant = useMerchantFor(a.notes, account, getEffectiveCashActivityType(a), bankWordsFor(bankLines, a.id, notesById));
  const bankLine = bankLineFor(bankLines, a);
  const renamed = useRuleRename({ notes: a.notes, activityType: getEffectiveCashActivityType(a), accountId: a.accountId, amount: a.amount });   // money-hub patch: Rules, Actions, Rename to (lib/rule-renames.ts)
  const note = notesById?.[a.id];
  const returnMark = useReturnMarks().get(a.id);
  const amazon = useAmazonLinks().data?.[a.id];   // money-hub patch: the Amazon order (lib/amazon.ts)
  const { isOutflow, isIncome, isSaving, isNeutral, sign, safeAmount } = getTransactionDisplay(
    a,
    account?.accountType,
  );
  const display = shown(Math.abs(safeAmount), a.currency, a.accountId);
  const accountName = account?.name ?? a.accountId;
  const rowAriaLabel = isSelected
    ? t("spending:transactions.deselect")
    : t("spending:transactions.select");
  const activityType = getEffectiveCashActivityType(a);
  const isTransfer = isTransferCashActivity(a);
  const transferLinkStatus = getTransferLinkStatus(a);
  const canMarkReimbursement =
    isIncome && !isCreditCardAccountType(account?.accountType) && activityType !== "CREDIT";

  return (
    <TableRow
      ref={ref}
      data-index={dataIndex}
      data-state={isSelected ? "selected" : undefined}
      className={cn("group/row", row.needsReview && "bg-[color-mix(in_srgb,var(--m-warn-line)_6%,transparent)]")}
    >
      <TableCell className="relative w-10 px-3 py-2">
        {row.needsReview && (
          <span className="absolute inset-y-0 left-0 w-[3px] bg-[var(--m-warn-line)]" aria-hidden="true" />
        )}
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(a.id)}
          aria-label={rowAriaLabel}
        />
      </TableCell>
      {showDate && (
        <TableCell className="whitespace-nowrap px-3 py-2 text-xs tabular-nums">
          {formatDate(a.activityDate, {
            month: "short",
            day: "numeric",
            // money-hub patch: the year only when it is not this one, like the phone cards and the
            // pending rows (owner, 10-02).
            ...(new Date(a.activityDate).getFullYear() !== new Date().getFullYear()
              ? { year: "numeric" }
              : {}),
            ...(appTimezone ? { timeZone: appTimezone } : {}),
          })}
        </TableCell>
      )}
      {/* money-hub patch: no Time column (owner, 10-02: bank entries all read 12:00 PM). */}
      {/* `max-w-0` hands this column whatever width the fixed-width columns
          leave over, instead of letting a long note stretch the table. It has
          to be `!important`: globals.css sets `max-width: 100vw` on every
          element at or below 1024px from outside any layer, which beats a
          plain utility and would let the note run to the viewport edge. */}
      <TableCell className="max-w-0! px-3 py-2">
        <div className="flex items-center gap-2">
          {/* The stripe beside the checkbox carries this too, but colour alone
              cannot be the only signal — it says nothing to a screen reader and
              nothing to a reader who cannot separate amber from the row behind
              it. An icon costs a line of width and says it in both registers. */}
          {row.needsReview && (
            <span className="shrink-0 text-[var(--m-warn)]">
              <Icons.AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">{t("spending:transactions.review")}</span>
            </span>
          )}
          {/* money-hub patch: the owner's merchant logo (lib/merchants.ts). */}
          {merchant ? <MerchantLogo url={merchant.logoUrl} name={merchant.name} whole={merchant.source === "bank"} /> : null}
          {renamed != null || a.notes != null ? (
            <TruncatedText text={renamed ?? a.notes ?? ""} className={cn("text-sm", (bankLine || amazon) && "max-w-[50%] shrink-0")} />
          ) : (
            <span className="text-muted-foreground text-sm italic">—</span>
          )}
          {/* money-hub patch: the owner's own note, an icon beside the name (lib/notes.ts). */}
          {note ? (
            <span className="text-muted-foreground shrink-0" title={note}>
              <Icons.FileText className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">Note: {note}</span>
            </span>
          ) : null}
          {/* money-hub patch: posted at another amount than it was pending, e.g. a tip (lib/pending-changes.ts). */}
          <PendingChangeTag activityId={a.id} />
          {/* money-hub patch: sent back, or the refund for something sent back (lib/returns.ts). */}
          <ReturnBadge mark={returnMark} />
          {/* money-hub patch: the Holdings asset this charge is for (features/asset-charges). */}
          <AssetChip chargeId={a.id} />
          {/* money-hub patch: the bank's own line after the payee (lib/bank-lines.ts); on an Amazon charge, its
              order instead (the bank's code says nothing; the edit window still shows it). */}
          {amazon ? (
            <AmazonOrderLine link={amazon} className="flex-1" />
          ) : bankLine ? (
            <TruncatedText text={bankLine} className="text-muted-foreground flex-1 text-xs" />
          ) : null}
          <QuickEventPopover
            selectedEventId={event?.id ?? null}
            onSelect={(eventId) => onSetEvent(a.id, eventId)}
            onClear={() => onSetEvent(a.id, null)}
            activityId={a.id}
            defaultDate={a.activityDate ? new Date(a.activityDate) : undefined}
            trigger={
              <button
                type="button"
                aria-label={
                  event
                    ? t("spending:transactions.changeEvent", { name: event.name })
                    : t("spending:transactions.tagEvent")
                }
                className={cn(
                  "hover:bg-muted/60 inline-flex shrink-0 items-center gap-1.5 rounded-full transition-colors",
                  event ? "bg-muted/60 max-w-[10rem] px-2 py-0.5" : cn("px-1", HOVER_SLOT),
                )}
              >
                {event ? (
                  <>
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: eventTypeColor ?? "var(--muted-foreground)" }}
                      aria-hidden="true"
                    />
                    <span className="truncate text-xs">{event.name}</span>
                  </>
                ) : (
                  <Icons.Tag className="text-muted-foreground h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            }
          />
        </div>
      </TableCell>
      {/* money-hub patch: the account in its own column, with its bank's logo (owner, 10-02). */}
      {showAccount && (
        <TableCell className="w-40 px-3 py-2 max-lg:w-12">
          <AccountMark account={account} fallbackName={accountName} />
        </TableCell>
      )}
      <TableCell className="hidden w-44 px-3 py-2 sm:table-cell">
        {isNeutral ? (
          <span className="text-muted-foreground text-xs">
            {t("spending:transactions.neutral")}
          </span>
        ) : row.splitCount > 0 ? (
          <button
            type="button"
            className="hover:bg-muted/60 -mx-1 inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left transition-colors"
            onClick={() => onEditSplits(row)}
          >
            <Icons.SplitHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate text-sm">
              {t("spending:transactions.splitLines", { count: row.splitCount })}
            </span>
          </button>
        ) : (
          <QuickCategorizePopover
            scope={isIncome ? "income" : isSaving ? "saving" : "expense"}
            selectedCategoryId={row.category?.id ?? null}
            onSelect={(taxonomyId, categoryId) => onAssignCategory(a.id, taxonomyId, categoryId)}
            onClear={() => row.category && onClearCategory(a.id, row.category.taxonomyId)}
            trigger={
              <button
                type="button"
                aria-label={
                  row.category
                    ? t("spending:transactions.changeCategory", { name: row.category.name })
                    : t("spending:transactions.assignCategory")
                }
                className="hover:bg-muted/60 -mx-1 inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left transition-colors"
              >
                {row.category ? (
                  <>
                    {/* money-hub patch: the category's icon in its colour, not a dot (owner, 10-02). */}
                    <CategoryMark icon={row.category.icon} color={row.category.color} />
                    <span className="truncate text-sm">{row.category.name}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground inline-flex items-center gap-1 text-xs italic">
                    <Icons.Plus className="h-3 w-3" aria-hidden="true" />
                    {t("spending:transactions.categorize")}
                  </span>
                )}
              </button>
            }
          />
        )}
      </TableCell>
      <TableCell
        className={cn(
          "w-28 whitespace-nowrap px-3 py-2 text-right text-sm font-medium tabular-nums",
          isSaving
            ? "text-[#6B8E54]"
            : isOutflow
              ? "text-destructive"
              : isNeutral
                ? "text-muted-foreground"
                : "text-success",
        )}
      >
        {sign}
        <PrivacyAmount value={display.amount} currency={display.currency} />
      </TableCell>
      <TableCell className="w-10 px-3 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* money-hub patch: a chevron, always there, in a ring while the row is hovered or its
                menu is open (owner, 10-02, from a picture of Origin's list); the same menu as before. */}
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground data-[state=open]:border-border group-hover/row:border-border h-8 w-8 border border-transparent hover:bg-transparent data-[state=open]:text-foreground"
              aria-label={t("spending:transactions.rowActions")}
            >
              <Icons.ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(row)}>
              <Icons.Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("common:edit")}
            </DropdownMenuItem>
            {canMarkReimbursement && (
              <DropdownMenuItem onClick={() => onMarkReimbursement(row)}>
                <Icons.RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("spending:transactions.markReimbursement")}
              </DropdownMenuItem>
            )}
            {!isNeutral && (
              <DropdownMenuItem onClick={() => onEditSplits(row)}>
                <Icons.SplitHorizontal className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("spending:transactions.splitTransaction")}
              </DropdownMenuItem>
            )}
            {canSetCountsAs(a) && (
              <DropdownMenuItem onClick={() => countsAsStore.open({ activity: a })}>
                <Icons.ArrowLeftRight className="mr-2 h-4 w-4" aria-hidden="true" />
                Counts as…
              </DropdownMenuItem>
            )}
            {(activityType === "WITHDRAWAL" || returnMark) && (
              <DropdownMenuItem onClick={() => trackReturnStore.open(returnMark ? { returnId: returnMark.item.id } : { purchase: purchaseOf(a) })}>
                <Icons.Undo className="mr-2 h-4 w-4" aria-hidden="true" />
                {returnMark ? "See the return" : "Track a return…"}
              </DropdownMenuItem>
            )}
            {canLinkCharge(activityType) && (
              <DropdownMenuItem onClick={() => linkCharge(row)}>
                <Icons.RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                Link to a subscription or bill…
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onDuplicate(row)}>
              <Icons.Copy className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("spending:transactions.duplicate")}
            </DropdownMenuItem>
            {isTransfer && (onLinkTransfer || onUnlinkTransfer) ? (
              transferLinkStatus === "linked" ? (
                onUnlinkTransfer ? (
                  <DropdownMenuItem onClick={() => onUnlinkTransfer(row)}>
                    <Icons.Unlink className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t("spending:transactions.unlinkTransfer")}
                  </DropdownMenuItem>
                ) : null
              ) : onLinkTransfer ? (
                <DropdownMenuItem onClick={() => onLinkTransfer(row)}>
                  <Icons.Link className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t("spending:transactions.linkTransfer")}
                </DropdownMenuItem>
              ) : null
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(row)}>
              <Icons.Trash className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("common:delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

export const TransactionRow = memo(TransactionRowImpl);
