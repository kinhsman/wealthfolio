// money-hub patch: the HSA page's totals strip (lib/hsa.ts): what is still unreimbursed (the mint hero, dollars and
// count, and how many have no dollar amount yet), what needs a look, what is paid back. Each is a button that
// filters the list by that status; the chosen one wears a ring (forest in Meadow, bronze in Bronze Titanium).
import { cn } from "@/lib/utils";

import {
  countText,
  formatUsd,
  noUsdText,
  totalsOfRows,
  type HsaStatus,
  type HsaSum,
} from "../lib/hsa";

type Strip = Pick<ReturnType<typeof totalsOfRows>, "unreimbursed" | "review" | "reimbursed">;

const ring = "ring-2 ring-[var(--m-forest)]";

function Tile({
  label,
  status,
  sum,
  chosen,
  onPick,
  hero = false,
  phone,
}: {
  label: string;
  status: HsaStatus;
  sum: HsaSum;
  chosen: HsaStatus | null;
  onPick: (s: HsaStatus | null) => void;
  hero?: boolean;
  phone: boolean;
}) {
  const on = chosen === status;
  const note = status === "unreimbursed" ? noUsdText(sum, phone) : null;
  return (
    <button
      type="button"
      aria-pressed={on}
      data-m={hero ? "hero" : "card"}
      onClick={() => onPick(on ? null : status)}
      className={cn(
        "flex min-w-0 flex-col text-left transition-shadow",
        phone ? "gap-0.5 rounded-[14px] px-2.5 py-2" : "gap-1 rounded-[20px] px-5 py-4",
        hero
          ? "bg-[var(--m-mint)] text-[var(--m-mint-ink)]"
          : "border border-[var(--m-line)] bg-[var(--m-surface)] text-[var(--m-ink)]",
        on && ring,
      )}
    >
      <span
        className={cn(
          phone ? "truncate text-[11.5px]" : "text-[13.5px]",
          hero ? "text-[var(--m-mint-muted)]" : "text-[var(--m-muted)]",
        )}
      >
        {label}
      </span>
      <span
        data-m-num={hero && !phone ? "hero" : "tile"}
        className={cn(
          "truncate tabular-nums tracking-[-0.02em]",
          phone
            ? "text-[17px] leading-tight"
            : hero
              ? "text-[34px] leading-[1.1]"
              : "text-[24px] leading-[1.15]",
        )}
      >
        {formatUsd(sum.usd)}
      </span>
      <span
        className={cn(
          phone ? "text-[11px]" : "text-[13px]",
          hero ? "text-[var(--m-mint-muted)]" : "text-[var(--m-muted)]",
        )}
      >
        {countText(sum.n)}
      </span>
      {note ? (
        <span
          className={cn("text-[var(--m-warn)]", phone ? "text-[11px] leading-tight" : "text-xs")}
        >
          {note}
        </span>
      ) : null}
    </button>
  );
}

export function HsaTotalsStrip({
  totals,
  status,
  onPick,
  phone,
}: {
  totals: Strip;
  status: HsaStatus | null;
  onPick: (s: HsaStatus | null) => void;
  phone: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Totals, tap one to filter"
      className={cn(
        "grid",
        phone
          ? "grid-cols-3 gap-1.5"
          : "grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3.5",
      )}
    >
      <Tile
        label="Unreimbursed"
        status="unreimbursed"
        sum={totals.unreimbursed}
        chosen={status}
        onPick={onPick}
        hero
        phone={phone}
      />
      <Tile
        label="Needs review"
        status="review"
        sum={totals.review}
        chosen={status}
        onPick={onPick}
        phone={phone}
      />
      <Tile
        label="Reimbursed"
        status="reimbursed"
        sum={totals.reimbursed}
        chosen={status}
        onPick={onPick}
        phone={phone}
      />
    </div>
  );
}
