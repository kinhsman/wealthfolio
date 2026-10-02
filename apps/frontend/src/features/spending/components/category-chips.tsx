import { cn } from "@/lib/utils";
import { Icons } from "@wealthfolio/ui";

import { resolveCategoryIcon } from "../lib/category-icons";

export type CategoryMeta = {
  name: string;
  color: string | null;
  icon: string | null;
  parentId: string | null;
};

export type CategoryMetaMap = Map<string, CategoryMeta>;

export function CategoryIcon({
  icon,
  fallback: _fallback,
  className,
}: {
  icon: string | null;
  /** Reserved for future title/aria — currently unused. */
  fallback?: string;
  className?: string;
}) {
  const IconCmp = resolveCategoryIcon(icon);
  return <IconCmp weight="duotone" className={cn("h-4 w-4", className)} />;
}

const MARK_SIZES = {
  sm: { box: "h-4 w-4 rounded", glyph: "h-2.5 w-2.5" },
  md: { box: "h-5 w-5 rounded-md", glyph: "h-3 w-3" },
  lg: { box: "h-6 w-6 rounded-md", glyph: "h-3.5 w-3.5" },
} as const;

/**
 * money-hub patch: a category beside its name, the way Settings, Categories draws it (category-item):
 * its icon in its colour on a tile of that colour, in place of the coloured dot (owner, 10-02: "where is
 * the icons"). The tint is mixed, so a colour given as a CSS variable works too. No colour: muted.
 */
export function CategoryMark({
  icon,
  color,
  size = "md",
}: {
  icon: string | null | undefined;
  color: string | null | undefined;
  size?: keyof typeof MARK_SIZES;
}) {
  const s = MARK_SIZES[size];
  return (
    <span
      aria-hidden="true"
      className={cn("flex shrink-0 items-center justify-center", s.box)}
      style={{
        backgroundColor: color ? `color-mix(in srgb, ${color} 14%, transparent)` : "var(--muted)",
        color: color ?? "var(--muted-foreground)",
      }}
    >
      <CategoryIcon icon={icon ?? null} className={s.glyph} />
    </span>
  );
}

export function CategoryBadge({
  name,
  color,
  icon,
}: {
  name: string;
  color: string | null;
  icon: string | null;
}) {
  const accent = color ?? "var(--muted-foreground)";
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        backgroundColor: color ? `${color}1F` : "var(--muted)",
        color: accent,
      }}
      title={name}
    >
      <CategoryIcon icon={icon} fallback={name} className="h-3 w-3" />
      <span className="max-w-[110px] truncate">{name}</span>
    </span>
  );
}

export function ReviewPill({ label }: { label: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        backgroundColor: "hsl(28 65% 55% / 0.10)",
        borderColor: "hsl(28 65% 55% / 0.35)",
        color: "#C28B47",
      }}
    >
      <Icons.AlertCircle className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}
