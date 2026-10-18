import { cn } from "@/lib/utils";
import { PrivacyAmount, useNumberFormatting } from "@wealthfolio/ui";

export interface DonutSegment {
  id: string;
  name: string;
  color: string;
  amount: number;
}

const GAP = 2.5;

/**
 * money-hub patch (owner, 10-18): "Where it went" as a donut on a desktop. One arc a row, the total in the
 * middle. An arc is a button: tapping it hands its id to `onSelect` (the list opens that group under it).
 */
export function WhereDonut({
  segments,
  total,
  currency,
  activeId,
  onSelect,
  centerLabel = "spent",
  centerValue,
  size = 168,
}: {
  segments: DonutSegment[];
  total: number;
  currency: string;
  activeId?: string | null;
  onSelect?: (id: string) => void;
  centerLabel?: string;
  /** Replaces the total in the middle (the open group's share). */
  centerValue?: string;
  size?: number;
}) {
  const SIZE = size;
  const STROKE = Math.round(size * 0.13);
  const numberFormatting = useNumberFormatting();
  const r = (SIZE - STROKE - 4) / 2; // room for the open arc, which is drawn 4px thicker
  const c = 2 * Math.PI * r;
  const sum = segments.reduce((s, x) => s + x.amount, 0);
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} className="-rotate-90" role="img" aria-label="Where it went">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={r} fill="none" stroke="var(--m-track, var(--muted))" strokeWidth={STROKE} />
        {sum > 0
          ? segments.map((s) => {
              const len = (s.amount / sum) * c;
              const draw = Math.max(0, len - (segments.length > 1 ? GAP : 0));
              const el = (
                <circle
                  key={s.id}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={activeId === s.id ? STROKE + 4 : STROKE}
                  strokeDasharray={`${draw} ${c - draw}`}
                  strokeDashoffset={-offset}
                  className={cn("transition-[stroke-width,opacity]", onSelect && "cursor-pointer hover:opacity-80")}
                  opacity={activeId && activeId !== s.id ? 0.45 : 1}
                  onClick={onSelect ? () => onSelect(s.id) : undefined}
                >
                  <title>{`${s.name}: ${numberFormatting.formatPercent(s.amount / (total || sum), { digits: 1 })}`}</title>
                </circle>
              );
              offset += len;
              return el;
            })
          : null}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className={cn("text-foreground font-medium tabular-nums", size < 130 ? "text-[14px]" : "text-[17px]")}>
          {centerValue ?? <PrivacyAmount value={total} currency={currency} />}
        </span>
        <span className="text-muted-foreground max-w-[80%] truncate text-[11.5px]">{centerLabel}</span>
      </div>
    </div>
  );
}
