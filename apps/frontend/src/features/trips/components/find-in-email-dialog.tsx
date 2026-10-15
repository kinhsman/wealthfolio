// money-hub patch: Trips, Find in email. Two ways in: "For this trip" (the booking emails around the trip's dates) and
// "For one charge" (the emails that show that charge's amount, around its date). The list shows who sent what and
// whether the email shows the amount; the owner ticks the ones that are right (nothing is ticked for them), looks at
// what the app read from one, and adds the ticked ones as bookings. Bank alerts and promos are hidden until asked for.
// A centered two-column window on a computer, a sheet from the bottom on a phone (the app's Dialog does both).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useMoney } from "@/features/meadow-dash/parts";
import type { SpendingEvent } from "@/features/spending/types/event";
import { cn } from "@/lib/utils";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icons,
} from "@wealthfolio/ui";

import {
  BOOKINGS_KEY,
  TYPE_CHIPS,
  chargeSearchWindow,
  inputFromRead,
  rangeText,
  rowNote,
  shortDay,
  timeOf,
  tripSearchWindow,
  tripsApi,
  addDays,
  dayOf,
  visibleRows,
  type EmailRead,
  type SearchAnswer,
  type SearchRow,
  type TripCharge,
  type TripsStatus,
  type TypeChip,
} from "../lib/trips";
import { KindIcon, Pill, dialogSheet, dialogTitle, fieldClass } from "./parts";

export interface FindStart {
  mode: "trip" | "charge";
  /** The charge a "For one charge" search starts on. */
  chargeId?: string | null;
}

const LOOKBACKS = [
  { days: 120, label: "4 months before" },
  { days: 365, label: "A year before" },
];

function ReadPanel({
  rowKey,
  row,
  noisy,
  onAnyway,
}: {
  rowKey: string;
  row: SearchRow;
  noisy: boolean;
  onAnyway: () => void;
}) {
  const money = useMoney("USD");
  const q = useQuery({
    queryKey: ["money-hub", "trips", "read", rowKey, row.mailboxId, row.msgId],
    queryFn: () => tripsApi.read(row.mailboxId, row.msgId),
    enabled: !noisy,
    staleTime: 10 * 60_000,
    retry: false,
  });
  if (noisy)
    return (
      <div className="text-foreground/80 flex flex-col items-start gap-2 text-[12.5px]">
        <p>This looks like a card alert or a promo, not a booking.</p>
        <button
          type="button"
          onClick={onAnyway}
          className="text-primary underline-offset-4 hover:underline"
        >
          Read it anyway
        </button>
      </div>
    );
  if (q.isLoading)
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-[12.5px]" aria-busy>
        <Icons.Spinner className="size-3.5 animate-spin" aria-hidden />
        Reading the email
      </p>
    );
  if (q.error) return <p className="text-destructive text-[12.5px]">{q.error.message}</p>;
  const r: EmailRead | undefined = q.data?.read;
  if (!r) return null;
  if (!r.booking)
    return <p className="text-foreground/80 text-[12.5px]">{r.why || "It is not a booking."}</p>;
  const facts = [
    ...(r.confirmation ? [{ k: "Confirmation", v: r.confirmation }] : []),
    ...(r.start
      ? [
          {
            k: r.kind === "stay" ? "Check in" : "When",
            v: `${shortDay(r.start)} ${timeOf(r.start)}`.trim(),
          },
        ]
      : []),
    ...(r.end && r.kind === "stay" ? [{ k: "Check out", v: shortDay(r.end) }] : []),
    ...(r.party ? [{ k: "Party", v: String(r.party) }] : []),
    ...(r.place ? [{ k: "Place", v: r.place }] : []),
    ...(r.total != null ? [{ k: "Total", v: money.cents(r.total) }] : []),
    ...(r.paid && r.paid !== "unknown"
      ? [{ k: "Pay", v: r.paid === "now" ? "On the card" : "Later" }]
      : []),
    ...(r.freeCancelUntil ? [{ k: "Free cancel until", v: shortDay(r.freeCancelUntil) }] : []),
    ...(r.facts ?? []),
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <KindIcon kind={r.kind ?? "other"} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[13.5px]">{r.title}</span>
          {r.sub ? (
            <span className="text-muted-foreground truncate text-[12px]">{r.sub}</span>
          ) : null}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
        {facts.map((f, i) => (
          <div key={`${f.k}${i}`} className="min-w-0">
            <dt className="text-muted-foreground text-[11px]">{f.k}</dt>
            <dd className="truncate text-[12.5px]" title={f.v}>
              {f.v}
            </dd>
          </div>
        ))}
      </dl>
      {r.lines?.length ? (
        <blockquote className="border-border text-muted-foreground max-h-28 overflow-y-auto border-l-2 pl-2.5 text-[12px]">
          {r.lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </blockquote>
      ) : null}
    </div>
  );
}

function Body({
  event,
  charges,
  status,
  start,
  phone,
  onClose,
}: {
  event: SpendingEvent;
  charges: TripCharge[];
  status: TripsStatus | undefined;
  start: FindStart;
  phone: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const money = useMoney("USD");
  const [mode, setMode] = useState<"trip" | "charge">(start.mode);
  const [chargeId, setChargeId] = useState<string | null>(start.chargeId ?? charges[0]?.id ?? null);
  const [typed, setTyped] = useState("");
  const [lookback, setLookback] = useState(LOOKBACKS[0].days);
  const [chip, setChip] = useState<TypeChip>("all");
  const [showNoise, setShowNoise] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [anyway, setAnyway] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const charge = charges.find((c) => c.id === chargeId) ?? null;

  const search = useMutation<SearchAnswer, Error, void>({
    mutationFn: () => {
      if (mode === "charge") {
        if (!charge) throw new Error("Pick a charge first.");
        return tripsApi.search({
          q: typed.trim(),
          amount: charge.amount,
          ...chargeSearchWindow(charge.date),
        });
      }
      const w = tripSearchWindow(event);
      return tripsApi.search({
        q: typed.trim(),
        from: addDays(dayOf(event.startDate), -lookback),
        to: w.to,
      });
    },
    onSuccess: () => {
      setPicked(new Set());
      setPreviewKey(null);
    },
  });

  // A search runs when the window opens and whenever the way in changes.
  useEffect(() => {
    if (status?.mailboxes.length) search.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, chargeId, lookback, !!status?.mailboxes.length]);

  const answer = search.data;
  const rows = useMemo(
    () => visibleRows(answer?.rows ?? [], chip, showNoise),
    [answer, chip, showNoise],
  );
  const byKey = new Map((answer?.rows ?? []).map((r) => [r.key, r]));
  const preview = previewKey ? byKey.get(previewKey) : undefined;

  const toggle = (r: SearchRow) => {
    if (r.onTrip) return;
    const next = new Set(picked);
    if (next.has(r.key)) next.delete(r.key);
    else {
      next.add(r.key);
      setPreviewKey(r.key);
    }
    setPicked(next);
  };

  const addPicked = async () => {
    setAdding(true);
    let added = 0;
    const skipped: string[] = [];
    for (const key of picked) {
      const r = byKey.get(key);
      if (!r) continue;
      try {
        const got = await tripsApi.read(r.mailboxId, r.msgId);
        if (!got.read.booking) {
          skipped.push(`${r.subject}: ${got.read.why ?? "not a booking"}`);
          continue;
        }
        await tripsApi.add(event.id, {
          ...inputFromRead(got.read),
          ...(mode === "charge" && charge ? { activityId: charge.id } : {}),
          source: { mailboxId: r.mailboxId, msgId: r.msgId },
        });
        added += 1;
      } catch (e) {
        skipped.push(`${r.subject}: ${(e as Error).message}`);
      }
    }
    setAdding(false);
    await qc.invalidateQueries({ queryKey: BOOKINGS_KEY });
    if (added) toast.success(added === 1 ? "Added to the trip" : `${added} added to the trip`);
    if (skipped.length) toast.error(`Not added: ${skipped.join("; ")}`);
    if (added && !skipped.length) onClose();
    else setPicked(new Set());
  };

  const noMail = status && !status.mailboxes.length;
  const readPanel =
    preview && previewKey ? (
      <ReadPanel
        key={previewKey}
        rowKey={previewKey}
        row={preview}
        noisy={preview.noise && !anyway.has(previewKey)}
        onAnyway={() => setAnyway(new Set(anyway).add(previewKey))}
      />
    ) : (
      <p className="text-muted-foreground text-[12.5px]">
        Tick an email to see what the app read from it.
      </p>
    );

  return (
    <>
      <DialogHeader className="text-left">
        <DialogTitle className={dialogTitle}>Find in email</DialogTitle>
        <DialogDescription className="text-[12px]">
          {event.name}, {rangeText(event)}
        </DialogDescription>
      </DialogHeader>

      <div role="tablist" aria-label="Look for" className="flex gap-1.5">
        {(
          [
            ["trip", "For this trip"],
            ["charge", "For one charge"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={cn(
              "h-8 flex-1 rounded-full border text-[12.5px] sm:flex-none sm:px-4",
              mode === id
                ? "bg-primary text-primary-foreground border-transparent"
                : "border-border text-foreground/80 hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "charge" ? (
        charges.length ? (
          <select
            aria-label="Charge"
            value={chargeId ?? ""}
            onChange={(e) => setChargeId(e.target.value)}
            className={fieldClass}
          >
            {charges.map((c) => (
              <option key={c.id} value={c.id}>
                {shortDay(c.date)}, {c.label}, {money.cents(c.amount)}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-muted-foreground text-[12.5px]">
            Tag a charge to this trip first, then find its email.
          </p>
        )
      ) : null}

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!noMail) search.mutate();
        }}
      >
        <label className="border-border bg-background text-muted-foreground flex h-9 min-w-0 flex-[1_1_100%] items-center gap-2 rounded-full border px-3 sm:flex-[1_1_0%]">
          <Icons.Search className="size-3.5 shrink-0" aria-hidden />
          <span className="sr-only">Search your email</span>
          <input
            type="search"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={
              mode === "charge" ? "Add a word, like the place" : "Add a word, like Dallas or Hilton"
            }
            className="text-foreground min-w-0 flex-1 border-0 bg-transparent text-[16px] outline-none sm:text-[13px]"
          />
        </label>
        {mode === "trip" ? (
          <select
            aria-label="How far back"
            value={lookback}
            onChange={(e) => setLookback(Number(e.target.value))}
            className={cn(fieldClass, "w-auto max-w-[9.5rem] rounded-full")}
          >
            {LOOKBACKS.map((l) => (
              <option key={l.days} value={l.days}>
                {l.label}
              </option>
            ))}
          </select>
        ) : null}
        <Button
          type="submit"
          size="sm"
          className="h-9 rounded-full"
          disabled={search.isPending || !!noMail}
        >
          Search
        </Button>
      </form>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Type">
        {TYPE_CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={chip === c.id}
            onClick={() => setChip(c.id)}
            className={cn(
              "h-8 rounded-full border px-3.5 text-[12px] max-md:flex-1",
              chip === c.id
                ? "bg-primary text-primary-foreground border-transparent"
                : "border-border text-foreground/80 hover:bg-muted",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div
        className={cn("grid min-h-0 gap-3", !phone && "grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]")}
      >
        <div className="flex min-h-[200px] min-w-0 flex-col" aria-busy={search.isPending}>
          {noMail ? (
            <p className="text-foreground/80 text-[13px]">
              No Gmail is linked yet. Link one in Settings, then search it from here.
            </p>
          ) : search.isPending ? (
            <p className="text-muted-foreground flex items-center gap-2 py-3 text-[12.5px]">
              <Icons.Spinner className="size-3.5 animate-spin" aria-hidden />
              Searching your email
            </p>
          ) : search.error ? (
            <p className="text-destructive py-3 text-[12.5px]">{search.error.message}</p>
          ) : (
            <>
              {answer?.errors.length ? (
                <p className="text-warning pb-1 text-[12px]">{answer.errors.join(" ")}</p>
              ) : null}
              {rows.length === 0 ? (
                <p className="text-muted-foreground py-3 text-[12.5px]">
                  {answer?.hidden && !showNoise
                    ? `Only card alerts and promos came back (${answer.hidden}).`
                    : "No emails found. Try a word like the hotel, the airline or the city."}
                </p>
              ) : (
                <ul className="flex flex-col">
                  {rows.map((r) => {
                    const note = rowNote(r);
                    const on = picked.has(r.key);
                    const open = phone && previewKey === r.key;
                    return (
                      <li
                        key={r.key}
                        className={cn("border-border/50 border-b", r.onTrip && "opacity-60")}
                      >
                        <div className="flex min-h-[52px] items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={on || !!r.onTrip}
                            disabled={!!r.onTrip}
                            onChange={() => toggle(r)}
                            aria-label={`Pick ${r.subject}`}
                            className="accent-primary size-[18px] shrink-0"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewKey(previewKey === r.key && phone ? null : r.key)
                            }
                            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                          >
                            <KindIcon kind={r.kind} />
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-[12.5px]">{r.subject}</span>
                              <span className="text-muted-foreground truncate text-[11.5px]">
                                {r.from}, {shortDay(r.date)}
                                {mailboxes(status) > 1 ? `, ${r.mailbox}` : ""}
                              </span>
                            </span>
                            <Pill
                              tone={
                                note.tone === "good"
                                  ? "good"
                                  : note.tone === "warn"
                                    ? "warn"
                                    : "plain"
                              }
                            >
                              {note.text}
                            </Pill>
                          </button>
                        </div>
                        {open ? (
                          <div className="bg-muted/50 mb-2.5 ml-7 rounded-xl p-2.5">
                            {readPanel}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="text-muted-foreground flex items-center justify-between gap-2 py-2.5 text-[11.5px]">
                <span>
                  {answer?.hidden
                    ? `${answer.hidden} card alerts and promos ${showNoise ? "shown" : "hidden"}`
                    : ""}
                  {answer?.truncated
                    ? `${answer?.hidden ? ". " : ""}Showing the newest emails only.`
                    : ""}
                </span>
                {answer?.hidden ? (
                  <button
                    type="button"
                    onClick={() => setShowNoise(!showNoise)}
                    className="text-primary shrink-0 underline-offset-4 hover:underline"
                  >
                    {showNoise ? "Hide" : "Show"}
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
        {phone ? null : (
          <aside
            aria-label="What the app read"
            className="bg-muted/50 flex min-h-[200px] flex-col gap-2 rounded-xl p-3"
          >
            <h3 className="text-muted-foreground text-[12px]">What the app read</h3>
            {readPanel}
          </aside>
        )}
      </div>

      <DialogFooter className="items-center gap-2 sm:justify-between">
        <span className="text-muted-foreground text-[12px]">
          {status && !status.ai
            ? "Reading emails needs the AI set up on the server."
            : `${picked.size} picked`}
        </span>
        <div className="flex gap-2 max-sm:flex-col-reverse">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-full sm:h-9"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-10 rounded-full sm:h-9"
            disabled={!picked.size || adding || (status ? !status.ai : false)}
            onClick={() => void addPicked()}
          >
            {adding ? "Adding" : picked.size ? `Add ${picked.size} to trip` : "Add to trip"}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

const mailboxes = (s: TripsStatus | undefined) => s?.mailboxes.length ?? 0;

export function FindInEmailDialog({
  start,
  event,
  charges,
  status,
  phone,
  onClose,
}: {
  start: FindStart | null;
  event: SpendingEvent | undefined;
  charges: TripCharge[];
  status: TripsStatus | undefined;
  phone: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!start && !!event} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-h-[90dvh] gap-3 overflow-y-auto sm:max-w-[56rem]"
        mobileClassName={cn(dialogSheet, "h-[90dvh]")}
      >
        {start && event ? (
          <Body
            key={`${event.id}:${start.mode}:${start.chargeId ?? ""}`}
            event={event}
            charges={charges}
            status={status}
            start={start}
            phone={phone}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
