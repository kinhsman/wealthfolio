// money-hub patch: the HSA list's rows (lib/hsa.ts). A wide screen (1280 and up) gets a table row: date,
// provider with what it was for, patient, the amount on the receipt (and the dollars when it is not in dollars),
// where the dollar figure comes from, the status, and a picture mark (View opens the picture) with an In Drive
// mark. Anything narrower gets a two-line row (a phone's keywords only: the source tag only when it is not the
// plain receipt total, the status only when it is not Unreimbursed). The page picks one in JS; a row is one
// button covering the row, with View a link above it.
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Icons } from "@wealthfolio/ui";

import { amountText, dayText, needsPhoto, photoUrl, usdNote, type HsaReceipt } from "../lib/hsa";
import { SourceTag, StatusTag, Tag } from "./hsa-parts";

/** date, provider, patient, amount, source, status, picture */
export const TABLE_COLS = "grid-cols-[100px_minmax(0,1fr)_112px_116px_132px_108px_84px]";

const rowShell =
  "relative border-t border-[var(--m-line-soft)] first:border-t-0 hover:bg-[var(--m-tile)]";

/** Where View goes: the picture kept here, else the old Drive picture of a row moved from Notion. */
const viewHref = (r: HsaReceipt) => (r.photos > 0 ? photoUrl(r.id, 0) : r.oldLink);

function Open({ r, onOpen }: { r: HsaReceipt; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${r.provider}, ${dayText(r.date)}`}
      className="absolute inset-0 z-0 w-full cursor-pointer"
    />
  );
}

function View({ r, label }: { r: HsaReceipt; label: boolean }) {
  const href = viewHref(r);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={r.photos > 0 ? "View the picture" : "View the old picture"}
      aria-label="View the picture"
      className="pointer-events-auto inline-flex h-6 items-center gap-1 rounded-full text-xs text-[var(--m-ink-2)] hover:text-[var(--m-ink)] max-md:min-w-6 max-md:justify-center"
    >
      <Icons.Eye className="size-3.5 shrink-0" aria-hidden />
      {label ? "View" : null}
    </a>
  );
}

function DriveMark({ r }: { r: HsaReceipt }) {
  if (!r.inDrive) return null;
  return (
    <span
      title="In Drive"
      className="inline-flex shrink-0 items-center gap-1 text-xs text-[var(--m-up)]"
    >
      <Icons.Cloud className="size-3.5" aria-hidden />
      <span className="sr-only">In Drive</span>
    </span>
  );
}

const noPhoto = (r: HsaReceipt) =>
  needsPhoto(r) ? (
    <Tag tone="look" className="pointer-events-none">
      No photo
    </Tag>
  ) : null;

/** The column names above the table rows (wide screens only). */
export function HsaTableHead() {
  const cell = "text-xs text-[var(--m-muted)]";
  return (
    <div
      role="row"
      className={cn(
        "grid items-center gap-x-3 border-b border-[var(--m-line-soft)] px-5 pb-1.5 pt-1",
        TABLE_COLS,
      )}
    >
      <span role="columnheader" className={cell}>
        Date
      </span>
      <span role="columnheader" className={cell}>
        Provider
      </span>
      <span role="columnheader" className={cell}>
        Patient
      </span>
      <span role="columnheader" className={cn(cell, "text-right")}>
        Amount
      </span>
      <span role="columnheader" className={cell}>
        Dollars from
      </span>
      <span role="columnheader" className={cell}>
        Status
      </span>
      <span role="columnheader" className={cell}>
        Picture
      </span>
    </div>
  );
}

export function HsaTableRow({ r, onOpen }: { r: HsaReceipt; onOpen: () => void }) {
  const usd = usdNote(r);
  const junk = r.status === "junk";
  return (
    <li className={cn(rowShell, junk && "opacity-70")}>
      <Open r={r} onOpen={onOpen} />
      <div
        className={cn(
          "pointer-events-none relative z-10 grid items-center gap-x-3 px-5 py-2.5",
          TABLE_COLS,
        )}
      >
        <span className="whitespace-nowrap text-[13px] tabular-nums text-[var(--m-ink-2)]">
          {dayText(r.date)}
        </span>
        <div className="min-w-0">
          <div className={cn("truncate text-[13.5px] text-[var(--m-ink)]", junk && "line-through")}>
            {r.provider}
          </div>
          <div className="truncate text-xs text-[var(--m-muted)]">
            {[r.description, r.type].filter(Boolean).join(" · ")}
          </div>
        </div>
        <span
          className={cn(
            "truncate text-[13px]",
            r.patient ? "text-[var(--m-ink-2)]" : "text-[var(--m-muted)]",
          )}
        >
          {r.patient ?? "No patient"}
        </span>
        <div className="min-w-0 text-right">
          <div className="truncate text-[13.5px] tabular-nums text-[var(--m-ink)]">
            {amountText(r)}
          </div>
          {r.currency !== "USD" ? (
            <div
              className={cn(
                "truncate text-xs tabular-nums",
                usd ? "text-[var(--m-muted)]" : "text-[var(--m-warn)]",
              )}
            >
              {usd ?? "No $ amount"}
            </div>
          ) : null}
        </div>
        <span>
          <SourceTag source={r.amountSource} />
        </span>
        <span>
          <StatusTag status={r.status} />
        </span>
        <span className="flex items-center gap-2">
          {noPhoto(r) ?? <View r={r} label />}
          <DriveMark r={r} />
        </span>
      </div>
    </li>
  );
}

/** A narrower screen: provider and amount on the first line, date, patient and the tags under it. */
export function HsaCardRow({
  r,
  phone,
  onOpen,
}: {
  r: HsaReceipt;
  phone: boolean;
  onOpen: () => void;
}) {
  const usd = usdNote(r);
  const junk = r.status === "junk";
  const tags: ReactNode[] = [];
  if (!phone || r.amountSource !== "receipt")
    tags.push(<SourceTag key="s" source={r.amountSource} short={phone} />);
  if (!phone || r.status !== "unreimbursed") tags.push(<StatusTag key="t" status={r.status} />);
  return (
    <li className={cn(rowShell, junk && "opacity-70")}>
      <Open r={r} onOpen={onOpen} />
      <div className="pointer-events-none relative z-10 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-5 py-2 max-md:px-3 max-md:py-1.5">
        <span className={cn("truncate text-[14px] text-[var(--m-ink)]", junk && "line-through")}>
          {r.provider}
        </span>
        <span className="text-right text-[14px] tabular-nums text-[var(--m-ink)]">
          {amountText(r)}
        </span>
        <span className="truncate text-xs text-[var(--m-muted)]">
          {(phone
            ? [dayText(r.date), r.patient]
            : [dayText(r.date), r.patient ?? "No patient", r.type]
          )
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="flex items-center justify-end gap-1.5">
          {usd ? <span className="text-xs tabular-nums text-[var(--m-muted)]">{usd}</span> : null}
          {r.currency !== "USD" && !usd ? (
            <span className="text-xs text-[var(--m-warn)]">No $ amount</span>
          ) : null}
          {tags}
          {noPhoto(r) ?? <View r={r} label={false} />}
          <DriveMark r={r} />
        </span>
      </div>
    </li>
  );
}
