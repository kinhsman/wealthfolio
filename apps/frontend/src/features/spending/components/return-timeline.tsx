// money-hub patch: a return's timeline (owner, 2026-10-03: "build a visual timeline showing that something like
// Return initiated > Vendor accepted > vendor received item > payment returned"). Started, Accepted, Received,
// Refunded (the store's word), On card (the refund found in the bank: "no status showing that the refunded
// amount is recored in the card"): the day typed on the return, the store's emails (Settings, Google, Return
// emails; Amazon's own), and the bank (lib/returns.ts, steps from the money-hub service). ReturnTimeline is the row on the
// Returns page; ReturnSteps is the window's, with each email and "Not it".
import type { CSSProperties, ReactNode } from "react";

import { Button, Icons } from "@wealthfolio/ui";

import { useAccounts } from "@/hooks/use-accounts";
import { cn } from "@/lib/utils";

import {
  shortDay,
  stepCaption,
  stepLabel,
  stepSource,
  type ReturnEmail,
  type ReturnItem,
  type ReturnStep,
} from "../lib/returns";

/** The theme's own colours (Meadow, Bronze Titanium), so the dots follow the app look. */
const GOOD = "var(--m-up)";
const WARN = "var(--m-warn)";
const LINE = "var(--m-line)";

/** A step that is behind the owner: the line up to it is drawn in the good colour. */
const reached = (s: ReturnStep) =>
  s.state === "done" ||
  s.state === "passed" ||
  s.state === "declined" ||
  s.state === "settled" ||
  s.state === "part";
const looksBad = (s: ReturnStep) => s.state === "declined" || s.state === "late";

/** One dot: filled with a tick when done, a soft tick when passed by, a ring with a centre while waited on. */
function Dot({ step, size = 16 }: { step: ReturnStep; size?: number }) {
  const box: CSSProperties = { width: size, height: size };
  const icon = Math.round(size * 0.62);
  if (step.state === "done" || step.state === "part") {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full"
        style={{ ...box, backgroundColor: GOOD }}
      >
        <Icons.Check
          style={{ width: icon, height: icon, color: "var(--m-on-done)" }}
          strokeWidth={3.5}
        />
      </span>
    );
  }
  if (step.state === "passed") {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full border"
        style={{ ...box, borderColor: GOOD, backgroundColor: "var(--m-good-soft)" }}
      >
        <Icons.Check style={{ width: icon, height: icon, color: GOOD }} strokeWidth={3} />
      </span>
    );
  }
  if (step.state === "declined") {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full border-2"
        style={{ ...box, borderColor: WARN, backgroundColor: "var(--m-warn-soft)" }}
      >
        <Icons.X style={{ width: icon - 2, height: icon - 2, color: WARN }} strokeWidth={3.5} />
      </span>
    );
  }
  if (step.state === "settled") {
    return (
      <span
        className="bg-muted inline-flex shrink-0 items-center justify-center rounded-full"
        style={box}
      >
        <Icons.Minus
          className="text-muted-foreground"
          style={{ width: icon, height: icon }}
          strokeWidth={3}
        />
      </span>
    );
  }
  if (step.state === "now" || step.state === "late") {
    const c = step.state === "late" ? WARN : GOOD;
    return (
      <span
        className="relative inline-flex shrink-0 items-center justify-center rounded-full border-2"
        style={{ ...box, borderColor: c }}
      >
        <span
          className="rounded-full"
          style={{ width: size * 0.4, height: size * 0.4, backgroundColor: c }}
        />
      </span>
    );
  }
  return (
    <span
      className="inline-flex shrink-0 rounded-full border-2"
      style={{ ...box, borderColor: LINE }}
    />
  );
}

/**
 * The row's timeline: five dots on a line, each with its name and day under it. Only the look: a click on
 * the row opens the window, where each email is.
 */
export function ReturnTimeline({ steps, className }: { steps: ReturnStep[]; className?: string }) {
  return (
    <ol className={cn("grid grid-cols-5", className)} aria-label="Where the return stands">
      {steps.map((s, i) => {
        const next = steps[i + 1];
        const caption = stepCaption(s);
        return (
          <li key={s.key} className="relative flex min-w-0 flex-col items-center text-center">
            {/* The line to the next dot, a little apart from both: good up to the last step reached. */}
            {next ? (
              <span
                aria-hidden
                className="absolute top-[7px] h-[2px] rounded-full"
                style={{
                  left: "calc(50% + 12px)",
                  width: "calc(100% - 24px)",
                  backgroundColor: reached(next) ? GOOD : LINE,
                }}
              />
            ) : null}
            <Dot step={s} />
            <span
              className={cn(
                "mt-1 text-[11px] font-medium leading-tight",
                s.state === "todo" && "text-muted-foreground/70",
              )}
            >
              {stepLabel(s)}
            </span>
            <span
              className={cn(
                "text-muted-foreground min-h-[14px] text-[10px] tabular-nums leading-tight",
                (s.via === "email" || s.via === "amazon" || s.via === "tiktok") && "text-foreground/80",
              )}
              style={looksBad(s) ? { color: WARN } : undefined}
            >
              {caption}
              <span className="sr-only">{stepSource(s) ? `, ${stepSource(s)}` : ""}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The emails that belong to a step (the window lists them under it). */
function eventsOf(key: ReturnStep["key"], emails: ReturnEmail[]): ReturnEmail[] {
  const kinds: Record<ReturnStep["key"], ReturnEmail["kind"][]> = {
    started: [],
    accepted: ["accepted", "declined"],
    received: ["dropped", "received"],
    refunded: ["refunded"],
    oncard: [],
  };
  return emails.filter((e) => kinds[key].includes(e.kind));
}

const EMAIL_WORD: Record<ReturnEmail["kind"], string> = {
  accepted: "Accepted",
  declined: "Declined",
  dropped: "On its way back",
  received: "Received",
  refunded: "Refund sent",
};

/**
 * The window's timeline: each step on its own line with its day and who said so, and under it the store's
 * emails (a click opens the email, or the order on Amazon). An email that is not about this return can be
 * taken off ("Not it", as for a refund offered): it never comes back on it.
 */
export function ReturnSteps({
  item,
  busy,
  onNotIt,
  footer,
}: {
  item: ReturnItem;
  busy: boolean;
  onNotIt: (key: string) => void;
  footer?: ReactNode;
}) {
  const steps = item.steps ?? [];
  const emails = item.emails ?? [];
  // The card the money comes back to: the refund's, else the one that paid.
  const { accounts } = useAccounts({ filterActive: false });
  const refundCard = [...item.refunds].sort((a, b) => a.date.localeCompare(b.date)).pop()?.accountId ?? item.accountId;
  const card = (accounts ?? []).find((a) => a.id === refundCard)?.name;
  return (
    <div className="space-y-0">
      <ol>
        {steps.map((s, i) => {
          const mine = eventsOf(s.key, emails);
          const caption = stepCaption(s);
          const source = stepSource(s, s.key === "oncard" ? card : undefined);
          return (
            <li key={s.key} className="relative flex gap-3 pb-3 last:pb-0">
              {i < steps.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute bottom-[3px] left-[8px] top-[23px] w-[2px] rounded-full"
                  style={{ backgroundColor: reached(steps[i + 1]) ? GOOD : LINE }}
                />
              ) : null}
              <span className="pt-px">
                <Dot step={s} size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      s.state === "todo" && "text-muted-foreground",
                    )}
                  >
                    {stepLabel(s)}
                  </span>
                  {caption ? (
                    <span
                      className="text-muted-foreground text-xs tabular-nums"
                      style={looksBad(s) ? { color: WARN } : undefined}
                    >
                      {caption}
                    </span>
                  ) : null}
                  {source && s.state !== "todo" ? (
                    <span className="text-muted-foreground/70 text-[11px]">{source}</span>
                  ) : null}
                </div>
                {mine.map((e) => (
                  <div key={e.key} className="mt-1 flex items-center gap-2 text-xs">
                    <Icons.Mail className="text-muted-foreground h-3 w-3 shrink-0" />
                    {e.url ? (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-foreground/90 min-w-0 flex-1 truncate underline-offset-4 hover:underline"
                        title={`${e.from}: ${e.subject}`}
                      >
                        <span className="text-muted-foreground tabular-nums">
                          {shortDay(e.date)} ·{" "}
                        </span>
                        {e.subject || EMAIL_WORD[e.kind]}
                      </a>
                    ) : (
                      // TikTok Shop's orders have no web page: the words only.
                      <span className="text-foreground/90 min-w-0 flex-1 truncate" title={`${e.from}: ${e.subject}`}>
                        <span className="text-muted-foreground tabular-nums">
                          {shortDay(e.date)} ·{" "}
                        </span>
                        {e.subject || EMAIL_WORD[e.kind]}
                      </span>
                    )}
                    {e.source === "email" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground h-6 shrink-0 px-2 text-[11px]"
                        disabled={busy}
                        onClick={() => onNotIt(e.key)}
                      >
                        Not it
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
      {footer}
    </div>
  );
}
