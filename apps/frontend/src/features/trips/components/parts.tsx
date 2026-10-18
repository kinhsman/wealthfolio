// money-hub patch: Trips, the small pieces its cards share. The card, the box and the window sizes are
// Maintenance's (one look across the Meadow pages); this adds the kind icons and their colours.
import { Compass, Utensils } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Icons } from "@wealthfolio/ui";

import type { Kind } from "../lib/trips";

export {
  Card,
  Field,
  dialogSheet,
  dialogShell,
  dialogTitle,
  fieldClass,
} from "@/features/upkeep/components/parts";

/** A kind's colour (the Meadow category colours, which Bronze re-tunes for night). */
export const KIND_COLOR: Record<Kind, string> = {
  flight: "var(--m-cat-3, #3b7d8a)",
  stay: "var(--m-cat-1, #3f6b4f)",
  food: "var(--m-cat-5, #b47630)",
  tour: "var(--m-cat-9, #8b7aa8)",
  car: "var(--m-cat-8, #5d7891)",
  other: "var(--m-cat-other, #c9bfae)",
};

export function KindIcon({
  kind,
  className,
  logo: logoUrl,
}: {
  kind: Kind;
  className?: string;
  /** A flight's airline logo address: it takes the plane's place (the plane stays if the logo does not load). */
  logo?: string | null;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const logo = kind === "flight" && logoUrl && !logoFailed ? logoUrl : null;
  if (logo)
    return (
      <span
        className={cn(
          "flex size-[30px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--m-line,var(--border))] bg-white max-md:size-7",
          className,
        )}
      >
        <img
          src={logo}
          alt=""
          width={30}
          height={30}
          loading="lazy"
          className="size-full object-contain"
          onError={() => setLogoFailed(true)}
        />
      </span>
    );
  const cls = "size-4";
  const glyph: ReactNode =
    kind === "flight" ? (
      <Icons.Plane className={cls} aria-hidden />
    ) : kind === "stay" ? (
      <Icons.BedDouble className={cls} aria-hidden />
    ) : kind === "food" ? (
      <Utensils className={cls} aria-hidden />
    ) : kind === "tour" ? (
      <Icons.Ticket className={cls} aria-hidden />
    ) : kind === "car" ? (
      <Icons.Car className={cls} aria-hidden />
    ) : (
      <Compass className={cls} aria-hidden />
    );
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-[30px] shrink-0 items-center justify-center rounded-full max-md:size-7",
        className,
      )}
      style={{
        color: KIND_COLOR[kind],
        background: `color-mix(in srgb, ${KIND_COLOR[kind]} var(--m-tint, 17%), transparent)`,
      }}
    >
      {glyph}
    </span>
  );
}

/** A small pill: good (green), warn (amber) or plain (outlined). */
export function Pill({
  tone = "plain",
  children,
  className,
}: {
  tone?: "good" | "warn" | "plain";
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px]",
        tone === "good" &&
          "bg-[var(--m-good-soft,color-mix(in_srgb,var(--success)_15%,transparent))] text-[var(--m-good-ink,var(--success))]",
        tone === "warn" &&
          "bg-[var(--m-warn-soft,color-mix(in_srgb,var(--warning)_15%,transparent))] text-[var(--m-warn,var(--warning))]",
        tone === "plain" &&
          "border border-[var(--m-line,var(--border))] text-[var(--m-ink-2,var(--foreground))]",
        className,
      )}
    >
      {children}
    </span>
  );
}
