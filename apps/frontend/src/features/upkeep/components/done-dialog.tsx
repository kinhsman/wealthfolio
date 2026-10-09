// money-hub patch: Maintenance, the Done window: the day, the cost, a vehicle's miles, a note, and "Match a bank
// charge" (the last 14 days of money out, the likely one picked and its amount filled in; or "No charge" for cash
// and anything paid elsewhere). The same window records a one-off repair, which has a name instead of a job.
// A centered window on a computer, a sheet from the bottom on a phone (the app's Dialog does both).
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

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
  PrivacyAmount,
} from "@wealthfolio/ui";

import {
  UPKEEP_KEY,
  hasMiles,
  miles as milesText,
  nextDueText,
  shortDay,
  tabName,
  upkeepApi,
  type ChargeChoice,
  type DoneInput,
  type Plan,
} from "../lib/upkeep";
import { Field, dialogSheet, dialogShell, dialogTitle, fieldClass } from "./parts";

export interface DoneStart {
  assetId: string;
  /** The job being done; none = a one-off repair. */
  jobId: string | null;
}

function ChargeList({
  assetId,
  currency,
  today,
  picked,
  onPick,
  onData,
}: {
  assetId: string;
  currency: string;
  today: string;
  picked: string | null;
  onPick: (id: string | null, amount: number | null) => void;
  /** The list as it arrived; `initial` for the plain last-14-days one (the likely charge is picked from it). */
  onData: (list: ChargeChoice[], initial: boolean) => void;
}) {
  const [typed, setTyped] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(typed.trim()), 350);
    return () => clearTimeout(t);
  }, [typed]);
  const { data, isLoading, error } = useQuery({
    queryKey: [...UPKEEP_KEY, "charges", assetId, term],
    queryFn: () => upkeepApi.charges(assetId, term),
    staleTime: 30 * 1000,
  });
  useEffect(() => {
    if (data) onData(data, !term);
    // Only when a list arrives: the owner's own pick afterwards stands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[12px] text-[var(--m-muted)]">
        <Icons.Link className="size-3.5" aria-hidden />
        <span>Match a bank charge</span>
        <input
          type="search"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Search"
          aria-label="Search bank charges"
          className="bg-background text-foreground placeholder:text-muted-foreground focus:border-primary ml-auto h-6 w-[7.5rem] rounded-md border px-2 text-[16px] focus:outline-none sm:text-[12px]"
        />
      </div>
      <div className="max-h-[11.5rem] overflow-y-auto" role="radiogroup" aria-label="Bank charge">
        <label
          className={cn(
            "grid min-h-[34px] cursor-pointer grid-cols-[20px_minmax(0,1fr)] items-center gap-2 rounded-lg px-2 text-[14px] hover:bg-[var(--m-tile)]",
            picked === null && "bg-[var(--m-tile)]",
          )}
        >
          <input
            type="radio"
            name="upkeep-charge"
            checked={picked === null}
            onChange={() => onPick(null, null)}
            className="m-0 accent-[var(--m-done)]"
          />
          <span>
            No charge
            <span className="ml-1.5 text-[12px] text-[var(--m-muted)]">Cash or paid elsewhere</span>
          </span>
        </label>
        {isLoading ? (
          <p className="px-2 py-2 text-[13px] text-[var(--m-muted)]">
            Looking at your bank charges…
          </p>
        ) : error ? (
          <p className="px-2 py-2 text-[13px] text-[var(--m-bad)]">
            Could not read the bank charges.
          </p>
        ) : null}
        {(data ?? []).map((c) => (
          <label
            key={c.id}
            className={cn(
              "grid min-h-[34px] cursor-pointer grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 text-[14px] hover:bg-[var(--m-tile)]",
              picked === c.id && "bg-[var(--m-tile)]",
              c.used && "cursor-not-allowed opacity-45 hover:bg-transparent",
            )}
          >
            <input
              type="radio"
              name="upkeep-charge"
              checked={picked === c.id}
              disabled={c.used}
              onChange={() => onPick(c.id, c.amount)}
              className="m-0 accent-[var(--m-done)]"
            />
            <span className="min-w-0 truncate">
              {c.merchant}
              <span className="ml-1.5 text-[12px] text-[var(--m-muted)]">
                {shortDay(c.date, today)}
                {c.linked ? " · linked" : c.looksRight ? " · looks right" : ""}
                {c.used ? " · on another job" : ""}
              </span>
            </span>
            <span className="tabular-nums">
              <PrivacyAmount value={c.amount} currency={c.currency ?? currency} />
            </span>
          </label>
        ))}
        {data && !data.length ? (
          <p className="px-2 py-1 text-[13px] text-[var(--m-muted)]">
            {term ? "No charge with that word." : "No money out in the last 14 days."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function DoneForm({
  plans,
  today,
  currency,
  start,
  onClose,
  onSave,
}: {
  plans: Plan[];
  today: string;
  currency: string;
  start: DoneStart;
  onClose: () => void;
  onSave: (assetId: string, input: DoneInput) => Promise<boolean>;
}) {
  const oneoff = start.jobId === null;
  const [assetId, setAssetId] = useState(start.assetId);
  const plan = plans.find((p) => p.assetId === assetId) ?? plans[0];
  const job = oneoff ? null : (plan.jobs.find((j) => j.id === start.jobId) ?? null);
  const car = hasMiles(plan.kind);
  const [name, setName] = useState("");
  const [date, setDate] = useState(today);
  const [cost, setCost] = useState("");
  const [odo, setOdo] = useState(plan.odo ? String(plan.odo.miles) : "");
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedAmount, setPickedAmount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const touched = useRef(false);
  // Every charge the list has shown, so the pick goes to the service with its details (it keeps a copy).
  const seen = useRef(new Map<string, ChargeChoice>());

  const pick = (id: string | null, amount: number | null) => {
    touched.current = true;
    setPicked(id);
    // The cost follows the charge, unless the owner typed a different one.
    setCost((c) =>
      !c || (pickedAmount != null && Number(c) === pickedAmount)
        ? amount != null
          ? String(amount)
          : ""
        : c,
    );
    setPickedAmount(amount);
  };
  const onData = (list: ChargeChoice[], initial: boolean) => {
    for (const c of list) seen.current.set(c.id, c);
    const likely = list.find((c) => c.looksRight && !c.used);
    if (!initial || touched.current || !likely) return;
    setPicked(likely.id);
    setPickedAmount(likely.amount);
    setCost((c) => c || String(likely.amount));
  };

  const next = job
    ? nextDueText(job, date, Number(odo.replace(/,/g, "")) || plan.odo?.miles || null, today)
    : "";
  const save = async () => {
    setBusy(true);
    const c = picked ? seen.current.get(picked) : null;
    const ok = await onSave(plan.assetId, {
      ...(job ? { jobId: job.id } : { oneoff: true, name }),
      date,
      cost,
      ...(car && odo ? { miles: odo.replace(/,/g, "") } : {}),
      note,
      charge: c
        ? { id: c.id, merchant: c.merchant, amount: c.amount, date: c.date, accountId: c.accountId }
        : null,
    });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <>
      <DialogHeader className="text-left">
        <DialogTitle className={dialogTitle}>
          {oneoff ? "One-off repair" : `Mark done: ${job?.name ?? ""}`}
        </DialogTitle>
        <DialogDescription className="sr-only">
          The day, the cost and the bank charge that paid it.
        </DialogDescription>
      </DialogHeader>
      {oneoff && plans.length > 1 ? (
        <Field label="For">
          <select
            value={assetId}
            onChange={(e) => {
              setAssetId(e.target.value);
              setPicked(null);
              setPickedAmount(null);
              touched.current = false;
            }}
            className={fieldClass}
          >
            {plans.map((p) => (
              <option key={p.assetId} value={p.assetId}>
                {tabName(p)}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {oneoff ? (
        <Field label="What was done">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoFocus
            placeholder="New battery, furnace igniter…"
            className={fieldClass}
          />
        </Field>
      ) : null}
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-2">
        <Field label="Date">
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className={fieldClass}
          />
        </Field>
        <Field label="Cost">
          <input
            type="text"
            inputMode="decimal"
            value={cost}
            onChange={(e) => setCost(e.target.value.replace(/[^\d.,$]/g, ""))}
            placeholder="0.00"
            className={fieldClass}
          />
        </Field>
        {car ? (
          <Field label="Miles">
            <input
              type="text"
              inputMode="numeric"
              value={odo}
              onChange={(e) => setOdo(e.target.value.replace(/[^\d,]/g, ""))}
              placeholder={plan.odo ? milesText(plan.odo.miles) : "Odometer"}
              className={fieldClass}
            />
          </Field>
        ) : null}
        <Field label="Note" className={car ? "col-span-2 sm:col-span-1" : "col-span-2"}>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="Optional"
            className={fieldClass}
          />
        </Field>
      </div>
      <ChargeList
        key={plan.assetId}
        assetId={plan.assetId}
        currency={currency}
        today={today}
        picked={picked}
        onPick={pick}
        onData={onData}
      />
      <DialogFooter className="items-center gap-2 sm:justify-between">
        <span className="text-[12px] text-[var(--m-muted)]">{next}</span>
        <span className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || (oneoff && !name.trim())}
            onClick={() => void save()}
          >
            <Icons.Check className="mr-1.5 size-4" aria-hidden />
            Mark done
          </Button>
        </span>
      </DialogFooter>
    </>
  );
}

export function DoneDialog({
  start,
  plans,
  today,
  currency,
  onClose,
  onSave,
}: {
  start: DoneStart | null;
  plans: Plan[];
  today: string;
  currency: string;
  onClose: () => void;
  onSave: (assetId: string, input: DoneInput) => Promise<boolean>;
}) {
  return (
    <Dialog open={!!start} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={dialogShell} mobileClassName={dialogSheet}>
        {start && plans.length ? (
          <DoneForm
            key={`${start.assetId}:${start.jobId ?? "oneoff"}`}
            plans={plans}
            today={today}
            currency={currency}
            start={start}
            onClose={onClose}
            onSave={onSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
