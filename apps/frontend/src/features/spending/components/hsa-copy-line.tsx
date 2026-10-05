// money-hub patch: the HSA page's one status line for the Drive copy (lib/hsa.ts mirrorLine): off, to be linked,
// paused, or copied (with the Google Sheet and the picture folder one tap away, and Copy now). Small and quiet,
// never a blocking banner (owner rule: messages are banners, but this is a status, not a message).
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import { Icons } from "@wealthfolio/ui";

import { mirrorLine, type HsaMirror } from "../lib/hsa";

const linkClass =
  "inline-flex shrink-0 items-center gap-1 whitespace-nowrap underline underline-offset-4 hover:no-underline";

export function HsaCopyLine({
  mirror,
  phone,
  running,
  onRun,
}: {
  mirror: HsaMirror;
  phone: boolean;
  running: boolean;
  onRun: () => void;
}) {
  const line = mirrorLine(mirror, { short: phone });
  const Icon = !mirror.on ? Icons.CloudOff : line.tone === "look" ? Icons.AlertCircle : Icons.Cloud;
  const ok = line.tone === "good";
  return (
    <div
      aria-label="Drive copy"
      className={cn(
        "flex min-w-0 items-center gap-x-3 text-xs max-md:gap-x-2",
        line.tone === "look" ? "text-[var(--m-warn)]" : "text-[var(--m-muted)]",
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", ok && "text-[var(--m-up)]")} aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        {line.to ? (
          <Link to={line.to} className="underline underline-offset-4 hover:no-underline">
            {line.text}
          </Link>
        ) : (
          line.text
        )}
      </span>
      {ok && mirror.sheetUrl ? (
        <a href={mirror.sheetUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {phone ? "Sheet" : "Open sheet"}
          {phone ? null : <Icons.ExternalLink className="size-3" aria-hidden />}
        </a>
      ) : null}
      {ok && mirror.folderUrl ? (
        <a href={mirror.folderUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {phone ? "Folder" : "Open folder"}
          {phone ? null : <Icons.ExternalLink className="size-3" aria-hidden />}
        </a>
      ) : null}
      {line.canRun ? (
        <button
          type="button"
          disabled={running}
          onClick={onRun}
          className="inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[var(--m-line)] px-2.5 text-[var(--m-ink-2)] hover:bg-[var(--m-tile)] disabled:opacity-60"
        >
          {running ? <Icons.Spinner className="size-3 animate-spin" aria-hidden /> : null}
          Copy now
        </button>
      ) : null}
    </div>
  );
}
