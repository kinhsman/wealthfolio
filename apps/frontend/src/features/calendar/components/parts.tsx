// money-hub patch: the small pieces the Calendar page shares, in the Meadow / Bronze look (the page sits inside
// `.meadow`, so the --m-* colours and both skins apply). Each kind of item has its colour (lib/calendar.ts
// LAYERS, the theme's category colours) and its icon; a subscription, card or store shows its own logo.
import {
  ArrowDownLeft,
  BedDouble,
  CalendarDays,
  Cake,
  Car,
  Compass,
  CreditCard,
  Flower2,
  Gift,
  Heart,
  Landmark,
  PartyPopper,
  Plane,
  Undo2,
  Utensils,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { MerchantLogo } from "@/features/spending/components/merchant-logo";
import { StreamLogo } from "@/features/spending/components/stream-logo";
import { cn } from "@/lib/utils";

import { LAYER, type CalItem, type Layer } from "../lib/calendar";
import type { DateKind } from "../lib/dates";

export const DATE_ICONS: Record<DateKind | "holiday", LucideIcon> = {
  birthday: Cake,
  anniversary: Heart,
  memorial: Flower2,
  other: CalendarDays,
  holiday: PartyPopper,
};

const LAYER_ICONS: Record<Layer, LucideIcon> = {
  people: Cake,
  holidays: PartyPopper,
  bills: CalendarDays,
  income: ArrowDownLeft,
  cards: CreditCard,
  trips: Plane,
  upkeep: Wrench,
  returns: Undo2,
  taxes: Landmark,
};

const BOOKING_ICONS: Record<string, LucideIcon> = {
  flight: Plane,
  stay: BedDouble,
  food: Utensils,
  tour: Compass,
  car: Car,
  other: CalendarDays,
};

/** The layer's colour as a soft tile behind an icon (stronger in the dark looks, where 18% disappears). */
export const tint = (color: string, pct = 18) =>
  `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/** An item's picture: its own logo when it has one, else its kind's icon on its colour. */
export function ItemIcon({ item, className }: { item: CalItem; className?: string }) {
  const size = cn("size-7 shrink-0", className);
  if (item.stream) return <StreamLogo s={item.stream} className={cn(size, "text-[10px]")} />;
  if (item.logo?.url)
    return (
      <MerchantLogo
        url={item.logo.url}
        name={item.logo.name}
        whole={item.logo.whole}
        className={size}
      />
    );
  const Icon = item.occ
    ? DATE_ICONS[item.occ.kind]
    : item.booking
      ? (BOOKING_ICONS[item.booking] ?? Plane)
      : LAYER_ICONS[item.layer];
  const color = LAYER[item.layer].color;
  return (
    <span
      className={cn(size, "flex items-center justify-center rounded-full")}
      style={{ background: tint(color, 20), color }}
      aria-hidden
    >
      <Icon className="size-[15px]" strokeWidth={2} />
    </span>
  );
}

/** A small round mark in a layer's colour (the month grid on a phone, the key under it). */
export function Dot({ layer, className }: { layer: Layer; className?: string }) {
  return (
    <span
      className={cn("inline-block size-[6px] shrink-0 rounded-full", className)}
      style={{ background: LAYER[layer].color }}
      aria-hidden
    />
  );
}

/** A gift to plan: the small gift mark beside a name. */
export function GiftMark({ className }: { className?: string }) {
  return (
    <Gift className={cn("size-3.5 shrink-0 text-[var(--m-cat-6)]", className)} aria-label="Gift" />
  );
}

/** Two to four choices as one pill, the way the app's switches look (Maintenance's job window). */
export function Pills<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      className="inline-flex w-fit gap-1 rounded-full bg-[var(--m-track)] p-[3px]"
      role="group"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[12.5px]",
            value === o.value
              ? "bg-[var(--m-surface)] text-[var(--m-ink)]"
              : "text-[var(--m-muted)] hover:text-[var(--m-ink-2)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
