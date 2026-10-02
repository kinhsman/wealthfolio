// money-hub patch: the small pieces the Taxes cards share, in the Spending dashboard's Meadow look
// (the page sits inside `.meadow`, so the --m-* colours and the Bronze skin both apply).
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icons,
  PrivacyAmount,
} from "@wealthfolio/ui";

import { useSetTaxes, type TaxesView } from "../lib/taxes";

export type ChipTone = "taxed" | "free" | "plain" | "ask";

const CHIP: Record<ChipTone, string> = {
  taxed: "bg-[var(--m-mint)] text-[var(--m-mint-ink)]",
  free: "bg-[var(--m-info-soft)] text-[var(--m-info-ink)]",
  plain: "bg-[var(--m-tile)] text-[var(--m-muted)]",
  ask: "bg-[var(--m-warn-soft)] text-[var(--m-warn)]",
};
const CHIP_BASE =
  "inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[11.5px]";

export function Chip({
  tone,
  children,
  className,
}: {
  tone: ChipTone;
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn(CHIP_BASE, CHIP[tone], className)}>{children}</span>;
}

/** A chip that opens a short list to pick from (how an account is taxed, a payment's tax year). */
export function PickChip<T extends string | number>({
  tone,
  label,
  value,
  options,
  disabled,
  onPick,
  ariaLabel,
}: {
  tone: ChipTone;
  label: ReactNode;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  disabled?: boolean;
  onPick: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(CHIP_BASE, CHIP[tone], "hover:opacity-80 disabled:opacity-50 max-md:h-7")}
        >
          {label}
          <Icons.ChevronDown className="h-3 w-3 opacity-70" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        {options.map((o) => (
          <DropdownMenuItem
            key={String(o.value)}
            onSelect={() => onPick(o.value)}
            className="flex flex-col items-start gap-0"
          >
            <span className="flex items-center gap-1.5 text-sm">
              {o.label}
              {o.value === value ? <Icons.Check className="h-3.5 w-3.5" aria-hidden /> : null}
            </span>
            {o.hint ? <span className="text-muted-foreground text-xs">{o.hint}</span> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One line of a card's list. */
export function Row({
  children,
  className,
  muted,
}: {
  children: ReactNode;
  className?: string;
  muted?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex min-h-[42px] min-w-0 items-center gap-2.5 border-t border-[var(--m-line-soft)] py-1.5 text-[13.5px] first:border-t-0 max-md:min-h-[38px] max-md:gap-2 max-md:py-1 max-md:text-[13px]",
        muted && "text-[var(--m-muted)]",
        className,
      )}
    >
      {children}
    </li>
  );
}

/** An amount at the end of a line: tabular, a loss in the warning red. */
export function Amount({
  value,
  currency,
  className,
  signed = false,
}: {
  value: number;
  currency: string;
  className?: string;
  signed?: boolean;
}) {
  return (
    <span
      className={cn(
        "ml-auto shrink-0 whitespace-nowrap tabular-nums",
        signed && value < 0 && "text-[var(--m-bad)]",
        className,
      )}
    >
      {signed && value < 0 ? "−" : ""}
      <PrivacyAmount value={Math.abs(value)} currency={currency} />
    </span>
  );
}

/** A small text button in a card (Show all, Add a paper). */
export function TextButton({
  children,
  onClick,
  disabled,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "text-[12.5px] text-[var(--m-ink-2)] underline underline-offset-4 hover:no-underline disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** A small filled or quiet pill button (Save, Gift, Mine). */
export function PillButton({
  children,
  onClick,
  disabled,
  filled = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  filled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-m={filled ? "fill" : undefined}
      className={cn(
        "inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-[12px] disabled:opacity-50",
        filled
          ? "bg-[var(--m-forest)] text-[var(--m-on-forest)] hover:opacity-90"
          : "border border-[var(--m-line)] bg-[var(--m-surface)] text-[var(--m-ink-2)] hover:bg-[var(--m-tile)]",
      )}
    >
      {children}
    </button>
  );
}

export const FIELD =
  "h-8 min-w-0 flex-1 rounded-lg border border-[var(--m-line)] bg-[var(--m-surface)] px-2.5 text-[13px] text-[var(--m-ink)] placeholder:text-[var(--m-muted)] focus:border-[var(--m-forest)] focus:outline-none";

/**
 * Sends one change and puts the fresh page where it is read. `busy` holds the name of the change
 * under way, so its own control can say so and the rest wait.
 */
export function useTaxAct() {
  const setView = useSetTaxes();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (what: string, fn: () => Promise<TaxesView>, done?: string) => {
    setBusy(what);
    try {
      setView(await fn());
      if (done) toast.success(done);
      return true;
    } catch (e) {
      toast.error((e as Error)?.message ?? String(e));
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}
