// money-hub patch: the Calendar page's month (owner, 2026-10-20: "just calendar, i open it and see everything related
// to that day"). On a computer each day lists its first items by name in their colours, with the lunar day in the
// corner (a Vietnamese calendar's habit) and a trip drawn as a band across its days; on a phone a day shows one dot
// per kind of item. A tap picks the day; the day's whole list is beside or under the month (day-panel.tsx).
import { Icons, useDateFnsLocale } from "@wealthfolio/ui";

import { cn } from "@/lib/utils";

import { LAYER, LAYERS, type CalItem, type CalSpan, type Layer, monthOf } from "../lib/calendar";
import { toLunar } from "../lib/lunar";
import { Dot } from "./parts";

const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");

export function MonthHeader({
  label,
  offset,
  onOffset,
  phone,
}: {
  label: string;
  offset: number;
  onOffset: (n: number) => void;
  phone: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <ArrowButton label="Month before" onClick={() => onOffset(offset - 1)}>
        <Icons.ChevronLeft className="size-4" />
      </ArrowButton>
      <h2
        className={cn(
          "min-w-[7.5rem] text-center font-medium",
          phone ? "text-[15px]" : "text-[16px]",
        )}
      >
        {label}
      </h2>
      <ArrowButton label="Month after" onClick={() => onOffset(offset + 1)}>
        <Icons.ChevronRight className="size-4" />
      </ArrowButton>
      {offset !== 0 ? (
        <button
          type="button"
          onClick={() => onOffset(0)}
          className="ml-1 h-7 rounded-full border border-[var(--m-line)] px-3 text-[12px] text-[var(--m-ink-2)] hover:bg-[var(--m-tile)]"
        >
          Today
        </button>
      ) : null}
    </div>
  );
}

function ArrowButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-full text-[var(--m-muted)] transition-colors hover:bg-[var(--m-tile)] hover:text-[var(--m-ink)]"
    >
      {children}
    </button>
  );
}

export function MonthGrid({
  today,
  offset,
  days,
  spans,
  picked,
  onPick,
  phone,
}: {
  today: string;
  offset: number;
  days: Map<string, CalItem[]>;
  spans: CalSpan[];
  picked: string;
  onPick: (iso: string) => void;
  phone: boolean;
}) {
  const m = monthOf(today, offset);
  const cells = Array.from({ length: m.days }, (_, i) => `${m.start.slice(0, 8)}${pad(i + 1)}`);
  // The week starts where the owner set it (Settings, General, Week starts on), else as the region does.
  const weekStart = useDateFnsLocale().options?.weekStartsOn ?? 0;
  const week = [...WEEK.slice(weekStart), ...WEEK.slice(0, weekStart)];
  const lead = (m.firstWeekday - weekStart + 7) % 7;
  return (
    <div>
      <div className="grid grid-cols-7 pb-1 text-center text-[11px] text-[var(--m-muted)]">
        {week.map((d) => (
          <span key={d}>{phone ? d.charAt(0) : d}</span>
        ))}
      </div>
      <div className={cn("grid grid-cols-7", phone ? "gap-1" : "gap-1.5")}>
        {Array.from({ length: lead }, (_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {cells.map((iso, i) => (
          <DayCell
            key={iso}
            iso={iso}
            day={i + 1}
            column={(lead + i) % 7}
            today={today}
            items={days.get(iso) ?? []}
            spans={spans.filter((s) => s.start <= iso && s.end >= iso)}
            picked={picked === iso}
            onPick={onPick}
            phone={phone}
          />
        ))}
      </div>
    </div>
  );
}

/** The lunar day as a Vietnamese calendar prints it: "1/9" on a month's first day, else the day alone. */
function lunarLabel(iso: string): { text: string; strong: boolean } {
  const [y, mo, d] = iso.split("-").map(Number);
  const l = toLunar(d, mo, y);
  return l.day === 1
    ? { text: `${l.day}/${l.month}${l.leap ? "+" : ""}`, strong: true }
    : { text: String(l.day), strong: l.day === 15 };
}

function DayCell({
  iso,
  day,
  column,
  today,
  items,
  spans,
  picked,
  onPick,
  phone,
}: {
  iso: string;
  day: number;
  column: number;
  today: string;
  items: CalItem[];
  spans: CalSpan[];
  picked: boolean;
  onPick: (iso: string) => void;
  phone: boolean;
}) {
  const isToday = iso === today;
  const past = iso < today;
  const special = items.some((it) => it.layer === "people" || it.layer === "holidays");
  const label = `${new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}${
    items.length ? `: ${items.map((it) => it.title).join(", ")}` : ""
  }`;
  const ring = picked
    ? "shadow-[inset_0_0_0_1.5px_var(--m-ink)]"
    : "hover:shadow-[inset_0_0_0_1px_var(--m-line)]";
  const background = special
    ? "color-mix(in srgb, var(--m-cat-6) 9%, var(--m-tile))"
    : items.length
      ? "var(--m-tile)"
      : "color-mix(in srgb, var(--m-tile) 45%, transparent)";

  if (phone) {
    const layers = [...new Set(items.map((it) => it.layer))].slice(0, 4) as Layer[];
    return (
      <button
        type="button"
        aria-label={label}
        aria-pressed={picked}
        onClick={() => onPick(iso)}
        className={cn(
          "relative flex h-12 flex-col items-center gap-1 rounded-[10px] pt-1.5 transition-shadow",
          ring,
        )}
        style={{ background }}
      >
        <DayNumber day={day} today={isToday} past={past} />
        <span className="flex h-[6px] items-center gap-[3px]">
          {layers.map((l) => (
            <Dot key={l} layer={l} />
          ))}
        </span>
        {spans.length ? <SpanBar iso={iso} span={spans[0]} column={column} phone /> : null}
      </button>
    );
  }

  const lunar = lunarLabel(iso);
  // Every box the same height: three lines under the number (two and "+N more" when there are more; one fewer
  // under a trip's band).
  const room = spans.length ? 2 : 3;
  const shown = items.slice(0, items.length > room ? room - 1 : room);
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={picked}
      onClick={() => onPick(iso)}
      className={cn(
        "relative flex h-[116px] min-w-0 flex-col overflow-hidden gap-1 rounded-[12px] px-1.5 pb-1.5 pt-1.5 text-left transition-shadow",
        ring,
      )}
      style={{ background }}
    >
      <span className="flex items-baseline justify-between px-0.5">
        <DayNumber day={day} today={isToday} past={past} />
        <span
          className={cn(
            "text-[10px] tabular-nums",
            lunar.strong ? "text-[var(--m-ink-2)]" : "text-[var(--m-muted)] opacity-70",
          )}
          title="Lunar day"
        >
          {lunar.text}
        </span>
      </span>
      {spans.length ? <SpanBar iso={iso} span={spans[0]} column={column} /> : null}
      <span className="flex min-w-0 flex-col gap-[3px]">
        {shown.map((it) => (
          <Chip key={it.id} item={it} />
        ))}
        {items.length > shown.length ? (
          <span className="px-1 text-[11px] text-[var(--m-muted)]">
            +{items.length - shown.length} more
          </span>
        ) : null}
      </span>
    </button>
  );
}

function DayNumber({ day, today, past }: { day: number; today: boolean; past: boolean }) {
  return (
    <span
      className={cn(
        "flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[12px] tabular-nums leading-none",
        today
          ? "bg-[var(--m-forest)] font-medium text-[var(--m-on-forest)]"
          : past
            ? "text-[var(--m-muted)]"
            : "text-[var(--m-ink)]",
      )}
    >
      {day}
    </span>
  );
}

/** One item in a day box: its colour as a soft fill, its name; a person's day or holiday reads stronger. */
function Chip({ item }: { item: CalItem }) {
  const color = LAYER[item.layer].color;
  const strong = item.layer === "people" || item.layer === "holidays";
  return (
    <span
      className={cn(
        "flex h-[19px] min-w-0 items-center gap-1 rounded-[6px] px-1.5 text-[11.5px] leading-none",
        item.done && "opacity-55",
      )}
      style={{ background: `color-mix(in srgb, ${color} ${strong ? 22 : 13}%, transparent)` }}
    >
      <span
        className="size-[5px] shrink-0 rounded-full"
        style={{ background: color }}
        aria-hidden
      />
      <span
        className={cn(
          "truncate",
          strong ? "text-[var(--m-ink)]" : "text-[var(--m-ink-2)]",
          item.late && "text-[var(--m-bad)]",
        )}
      >
        {item.title}
      </span>
    </span>
  );
}

/** A trip across its days: rounded where it starts and ends, and at the week's edges. */
function SpanBar({
  iso,
  span,
  column,
  phone = false,
}: {
  iso: string;
  span: CalSpan;
  column: number;
  phone?: boolean;
}) {
  const first = iso === span.start || column === 0;
  const last = iso === span.end || column === 6;
  const color = LAYER.trips.color;
  return (
    <span
      className={cn(
        "pointer-events-none",
        phone
          ? "absolute inset-x-0 bottom-1 h-[3px]"
          : "-mx-1.5 flex h-[15px] items-center overflow-hidden px-1.5 text-[10.5px] leading-none",
        first && (phone ? "ml-1.5 rounded-l-full" : "ml-0 rounded-l-full"),
        last && (phone ? "mr-1.5 rounded-r-full" : "mr-0 rounded-r-full"),
      )}
      style={{ background: phone ? color : `color-mix(in srgb, ${color} 26%, transparent)` }}
      title={span.title}
    >
      {!phone && first ? (
        <span className="truncate text-[var(--m-ink)]">✈ {span.title}</span>
      ) : null}
    </span>
  );
}

/** The key under the month, which also turns each kind on and off (kept per device). */
export function LayerKey({
  shown,
  counts,
  onToggle,
  phone = false,
}: {
  shown: Set<Layer>;
  counts: Map<Layer, number>;
  onToggle: (l: Layer) => void;
  phone?: boolean;
}) {
  return (
    <div
      className={cn("flex flex-wrap items-center", phone ? "gap-1" : "gap-1.5")}
      role="group"
      aria-label="What the calendar shows"
    >
      {LAYERS.map((l) => {
        const on = shown.has(l.key);
        return (
          <button
            key={l.key}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(l.key)}
            className={cn(
              "inline-flex items-center rounded-full border transition-colors",
              phone ? "h-6 gap-1 px-2 text-[11.5px]" : "h-7 gap-1.5 px-2.5 text-[12px]",
              on
                ? "border-[var(--m-line)] bg-[var(--m-surface)] text-[var(--m-ink)]"
                : "border-dashed border-[var(--m-line)] text-[var(--m-muted)] opacity-70",
            )}
            title={on ? `Hide ${l.label.toLowerCase()}` : `Show ${l.label.toLowerCase()}`}
          >
            <span
              className="size-2 rounded-full"
              style={{
                background: on ? l.color : "transparent",
                boxShadow: on ? undefined : `inset 0 0 0 1.5px ${l.color}`,
              }}
              aria-hidden
            />
            {l.short}
            {!phone && counts.get(l.key) ? (
              <span className="tabular-nums text-[var(--m-muted)]">{counts.get(l.key)}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
