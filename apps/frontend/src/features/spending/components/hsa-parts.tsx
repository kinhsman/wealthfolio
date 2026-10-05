// money-hub patch: the small pieces of the HSA receipts page (lib/hsa.ts), in the Spending dashboard's Meadow
// look: the tags (where the dollar figure comes from, where a receipt stands), the banner that says what an
// add did, and the box styles. Never bold: hierarchy comes from size and colour.
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Icons } from "@wealthfolio/ui";

import {
  SOURCE_LABEL,
  SOURCE_SHORT,
  STATUS_LABEL,
  sourceTone,
  statusTone,
  type HsaAmountSource,
  type HsaBanner,
  type HsaStatus,
  type Tone,
} from "../lib/hsa";

/** The theme's own good / look colours (as on Receipts and Returns); red for what cannot be trusted. */
export const TONE_CLASS: Record<Tone, string> = {
  good: "bg-[var(--m-good-soft)] text-[var(--m-up)]",
  plain: "bg-[var(--m-tile)] text-[var(--m-ink-2)]",
  look: "bg-[var(--m-warn-soft)] text-[var(--m-warn)]",
  bad: "bg-[color-mix(in_srgb,var(--m-bad)_15%,transparent)] text-[var(--m-down)]",
  info: "bg-[var(--m-info-soft)] text-[var(--m-info-ink)]",
  muted: "bg-[var(--m-tile)] text-[var(--m-muted)]",
};

export function Tag({
  tone,
  children,
  className,
  title,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full px-2 text-[11px]",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Where the dollar figure comes from: Card charge green, Receipt total plain, Converted estimate amber, Unverified red. */
export function SourceTag({ source, short = false }: { source: HsaAmountSource; short?: boolean }) {
  return (
    <Tag tone={sourceTone(source)} title={SOURCE_LABEL[source]}>
      {short ? SOURCE_SHORT[source] : SOURCE_LABEL[source]}
    </Tag>
  );
}

export function StatusTag({ status }: { status: HsaStatus }) {
  return <Tag tone={statusTone(status)}>{STATUS_LABEL[status]}</Tag>;
}

/** What a box on the page is called, above it. */
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
  "h-9 w-full rounded-md border bg-background px-2.5 text-[16px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none disabled:opacity-50 sm:h-8 sm:text-[13px] [&:is(select)]:pr-7";

/** A chip that filters the list; the chosen one is filled (bronze in Bronze Titanium), like the Pending page's. */
export function Chip({
  on,
  onClick,
  children,
  className,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      data-m={on ? "fill" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12.5px] transition-colors",
        on
          ? "bg-[var(--m-forest)] text-[var(--m-on-forest)]"
          : "border border-[var(--m-line)] text-[var(--m-ink-2)] hover:bg-[var(--m-tile)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** A phone's filter: the same chip, but a pick from a list (every option stays one tap away, in one row). */
export function ChipSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  const on = value !== "";
  return (
    <span className={cn("relative inline-flex min-w-0", className)}>
      <select
        aria-label={label}
        value={value}
        data-m={on ? "fill" : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-7 w-full min-w-0 appearance-none truncate rounded-full pl-3 pr-7 text-[12.5px]",
          on
            ? "bg-[var(--m-forest)] text-[var(--m-on-forest)]"
            : "border border-[var(--m-line)] bg-transparent text-[var(--m-ink-2)]",
        )}
      >
        {options.map((o) => (
          <option
            key={o.value}
            value={o.value}
            className="bg-[var(--m-surface)] text-[var(--m-ink)]"
          >
            {o.label}
          </option>
        ))}
      </select>
      <Icons.ChevronDown
        className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2"
        aria-hidden
      />
    </span>
  );
}

const BANNER_TONE = {
  good: {
    box: "border-[var(--m-mint-line)] bg-[var(--m-good-soft)] text-[var(--m-good-ink)]",
    icon: "text-[var(--m-up)]",
  },
  plain: {
    box: "border-[var(--m-line)] bg-[var(--m-tile)] text-[var(--m-ink)]",
    icon: "text-[var(--m-muted)]",
  },
  look: {
    box: "border-[var(--m-warn-panel-line)] bg-[var(--m-warn-panel)] text-[var(--m-ink)]",
    icon: "text-[var(--m-warn)]",
  },
} as const;

export type ShownBanner = HsaBanner & { busy?: boolean };

/**
 * What an add did, in a full-width banner under the header (never in the page subtitle). Reading shows a spinner;
 * a saved, filed or attached receipt can be opened from it.
 */
export function Banner({
  banner,
  onClose,
  onOpen,
}: {
  banner: ShownBanner;
  onClose?: () => void;
  onOpen: (id: string) => void;
}) {
  const tone = BANNER_TONE[banner.tone];
  const Icon = banner.busy
    ? Icons.Spinner
    : banner.tone === "good"
      ? Icons.CheckCircle
      : banner.tone === "look"
        ? Icons.AlertCircle
        : Icons.Info;
  return (
    <div
      role={banner.tone === "look" ? "alert" : "status"}
      data-m={banner.tone === "look" ? "notice" : undefined}
      className={cn(
        "flex items-start gap-2.5 rounded-[14px] border px-3.5 py-2.5 text-[13.5px] max-md:gap-2 max-md:px-3 max-md:py-2 max-md:text-[13px]",
        tone.box,
      )}
    >
      <Icon
        className={cn("mt-0.5 size-4 shrink-0", tone.icon, banner.busy && "animate-spin")}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="leading-snug">
          <span>{banner.title}</span>
          {banner.text ? (
            <span
              className={cn(
                banner.tone === "good" ? "text-[var(--m-mint-muted)]" : "text-[var(--m-ink-2)]",
              )}
            >
              {" "}
              {banner.text}
            </span>
          ) : null}
        </p>
        {banner.lines?.length ? (
          <ul className="mt-1 space-y-0.5 text-xs text-[var(--m-ink-2)]">
            {banner.lines.map((line) => (
              <li key={line} className="truncate tabular-nums">
                {line}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {banner.receiptId ? (
        <button
          type="button"
          onClick={() => onOpen(banner.receiptId!)}
          className="shrink-0 text-xs underline underline-offset-4 hover:no-underline"
        >
          Open
        </button>
      ) : null}
      {banner.busy || !onClose ? null : (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="-mr-1 -mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full opacity-70 hover:opacity-100"
        >
          <Icons.X className="size-4" />
        </button>
      )}
    </div>
  );
}
