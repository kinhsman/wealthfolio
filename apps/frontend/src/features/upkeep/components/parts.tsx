// money-hub patch: the small pieces the Maintenance cards share, in the Spending dashboard's Meadow look
// (the page sits inside `.meadow`, so the --m-* colours and the Bronze skin both apply).
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { AltAssetIcon } from "@/components/alt-asset-icon";
import { cn } from "@/lib/utils";

import { UPKEEP_KEY, type JobStatus, type Plan, type UpkeepView } from "../lib/upkeep";

/** One write at a time: puts the fresh view where the page reads it, says what went wrong in a toast. */
export function useUpkeepAct() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (what: string, fn: () => Promise<UpkeepView>, done?: string) => {
    setBusy(what);
    try {
      qc.setQueryData(UPKEEP_KEY, await fn());
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

/** A glass card (the Meadow cards' look); `bleed` runs its rows to the edges. */
export function Card({
  children,
  className,
  bleed = false,
}: {
  children: ReactNode;
  className?: string;
  bleed?: boolean;
}) {
  return (
    <section
      data-m="card"
      className={cn(
        "min-w-0 rounded-[20px] border border-[var(--m-line)] bg-[var(--m-surface)]",
        !bleed && "px-[18px] py-3.5 max-md:px-3 max-md:py-2.5",
        className,
      )}
    >
      {children}
    </section>
  );
}

const CHIP_BASE =
  "inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-[12px] font-medium tabular-nums";
const CHIP: Record<JobStatus["kind"], string> = {
  bad: "bg-[color-mix(in_srgb,var(--m-bad)_14%,transparent)] text-[var(--m-bad)]",
  warn: "bg-[var(--m-warn-soft)] text-[var(--m-warn)]",
  later: "px-0 font-normal text-[var(--m-muted)]",
  new: "bg-[var(--m-tile)] font-normal text-[var(--m-muted)]",
};

/** Where a job stands, in words: red when late, amber when soon, plain when later. */
export function StatusChip({
  status,
  onClick,
  className,
}: {
  status: JobStatus;
  onClick?: () => void;
  className?: string;
}) {
  const cls = cn(CHIP_BASE, CHIP[status.kind], className);
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cn(cls, "hover:opacity-80")}>
        {status.chip}
      </button>
    );
  return <span className={cls}>{status.chip}</span>;
}

/** A small count under a card's title: "2 overdue" red, "1 soon" amber. */
export function CountChip({ plan }: { plan: Plan }) {
  const bad = plan.jobs.filter((j) => j.status.kind === "bad").length;
  const warn = plan.jobs.filter((j) => j.status.kind === "warn").length;
  if (bad) return <span className={cn(CHIP_BASE, CHIP.bad)}>{bad} overdue</span>;
  if (warn) return <span className={cn(CHIP_BASE, CHIP.warn)}>{warn} soon</span>;
  return null;
}

/** The asset's own picture (or the kind's drawing), as a small rounded tile. */
export function AssetTile({
  plan,
  size = "size-7",
}: {
  plan: Pick<Plan, "assetId" | "kind" | "name">;
  size?: string;
}) {
  return (
    <AltAssetIcon
      assetId={plan.assetId}
      kind={plan.kind}
      name={plan.name}
      className={cn(size, "rounded-[8px]")}
      iconSize={16}
    />
  );
}

/** A box's name above it. */
export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block min-w-0 space-y-1", className)}>
      <span className="text-muted-foreground block text-[11px]">{label}</span>
      {children}
    </label>
  );
}

/** A text box or pick: 16px on a phone (iOS does not zoom into it), compact on a computer. */
export const fieldClass =
  "h-9 w-full rounded-md border bg-background px-2.5 text-[16px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none disabled:opacity-50 sm:text-sm";

export const dialogShell = "max-h-[90dvh] gap-3 overflow-y-auto sm:max-w-[30rem]";
export const dialogSheet = "h-auto max-h-[90dvh] overflow-y-auto";
export const dialogTitle = "text-base font-medium";
