// money-hub patch: Maintenance, the small windows: a job (new, changed, or its last-done day set), a starter list to
// tick, Track another asset (any Holdings asset but a loan), and the tab's short name. Each is the app's Dialog:
// a centered window on a computer, a sheet from the bottom on a phone.
import { useState } from "react";

import { cn } from "@/lib/utils";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@wealthfolio/ui";

import {
  KIND_WORDS,
  MONTH_DAYS,
  everyText,
  hasMiles,
  monthName,
  tabName,
  yearDayText,
  type Job,
  type JobInput,
  type Plan,
  type UpkeepAsset,
} from "../lib/upkeep";
import { KITS, startersFor, starterJob, type KitId, type Starter } from "../lib/starters";
import { AssetTile, Field, dialogSheet, dialogShell, dialogTitle, fieldClass } from "./parts";

// -------------------------------------------------------------------------------------- one job --

export interface JobStart {
  assetId: string;
  /** The job being changed; none = a new one. */
  jobId: string | null;
}

function JobForm({
  plans,
  today,
  start,
  onClose,
  onAdd,
  onChange,
  onRemove,
}: {
  plans: Plan[];
  today: string;
  start: JobStart;
  onClose: () => void;
  onAdd: (assetId: string, job: JobInput) => Promise<boolean>;
  onChange: (assetId: string, jobId: string, job: Partial<JobInput>) => Promise<boolean>;
  onRemove: (assetId: string, jobId: string) => Promise<boolean>;
}) {
  const [assetId, setAssetId] = useState(start.assetId);
  const plan = plans.find((p) => p.assetId === assetId) ?? plans[0];
  const job = start.jobId ? (plan.jobs.find((j) => j.id === start.jobId) ?? null) : null;
  const car = hasMiles(plan.kind);
  const [name, setName] = useState(job?.name ?? "");
  const [yearly, setYearly] = useState(!!job?.on);
  const [months, setMonths] = useState(job?.months ? String(job.months) : "");
  const [every, setEvery] = useState(job?.miles ? String(job.miles) : "");
  const [month, setMonth] = useState(String(job?.on?.month ?? 1));
  const [day, setDay] = useState(job?.on ? String(job.on.day) : "");
  const [lastDate, setLastDate] = useState(job?.last?.date ?? "");
  const [lastMiles, setLastMiles] = useState(
    job?.last?.miles != null ? String(job.last.miles) : "",
  );
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const dayOk = Number(day) >= 1 && Number(day) <= MONTH_DAYS[Number(month) - 1];
  const valid = name.trim() && (yearly ? dayOk : months || (car && every));
  const input = (): JobInput => ({
    name,
    months: yearly ? null : months || null,
    miles: car && !yearly ? every.replace(/,/g, "") || null : null,
    on: yearly ? { month: Number(month), day: Number(day) } : null,
    lastDate: lastDate || null,
    lastMiles: car ? lastMiles.replace(/,/g, "") || null : null,
  });
  const save = async () => {
    setBusy(true);
    const ok = job
      ? await onChange(plan.assetId, job.id, input())
      : await onAdd(plan.assetId, input());
    setBusy(false);
    if (ok) onClose();
  };
  const remove = async () => {
    if (!job) return;
    setBusy(true);
    const ok = await onRemove(plan.assetId, job.id);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <>
      <DialogHeader className="text-left">
        <DialogTitle className={dialogTitle}>{job ? "Change this job" : "Custom job"}</DialogTitle>
        <DialogDescription className="sr-only">
          What it is, how often it is due, and when it was last done.
        </DialogDescription>
      </DialogHeader>
      {!job && plans.length > 1 ? (
        <Field label="For">
          <select
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
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
      <Field label="Job">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          autoFocus={!job}
          placeholder="Gutters, oil change…"
          className={fieldClass}
        />
      </Field>
      <div
        className="inline-flex w-fit gap-1 rounded-full bg-[var(--m-track)] p-[3px]"
        role="group"
        aria-label="How it repeats"
      >
        {[
          { yes: false, label: "Every so often" },
          { yes: true, label: "A day each year" },
        ].map((o) => (
          <button
            key={o.label}
            type="button"
            aria-pressed={yearly === o.yes}
            onClick={() => setYearly(o.yes)}
            className={cn(
              "h-7 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[12.5px]",
              yearly === o.yes
                ? "bg-[var(--m-surface)] text-[var(--m-ink)]"
                : "text-[var(--m-muted)] hover:text-[var(--m-ink-2)]",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-2">
        {yearly ? (
          <>
            <Field label="Month">
              <select
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  if (Number(day) > MONTH_DAYS[Number(e.target.value) - 1])
                    setDay(String(MONTH_DAYS[Number(e.target.value) - 1]));
                }}
                className={fieldClass}
              >
                {MONTH_DAYS.map((_, i) => (
                  <option key={i} value={i + 1}>
                    {monthName(i + 1)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Day">
              <input
                type="text"
                inputMode="numeric"
                value={day}
                onChange={(e) => setDay(e.target.value.replace(/\D/g, "").slice(0, 2))}
                placeholder="15"
                className={fieldClass}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Every (months)">
              <input
                type="text"
                inputMode="numeric"
                value={months}
                onChange={(e) => setMonths(e.target.value.replace(/\D/g, ""))}
                placeholder="12"
                className={fieldClass}
              />
            </Field>
            {car ? (
              <Field label="Or every (miles)">
                <input
                  type="text"
                  inputMode="numeric"
                  value={every}
                  onChange={(e) => setEvery(e.target.value.replace(/[^\d,]/g, ""))}
                  placeholder="5,000"
                  className={fieldClass}
                />
              </Field>
            ) : null}
          </>
        )}
        <Field label="Last done">
          <input
            type="date"
            value={lastDate}
            max={today}
            onChange={(e) => setLastDate(e.target.value)}
            className={fieldClass}
          />
        </Field>
        {car ? (
          <Field label="At miles">
            <input
              type="text"
              inputMode="numeric"
              value={lastMiles}
              onChange={(e) => setLastMiles(e.target.value.replace(/[^\d,]/g, ""))}
              placeholder={plan.odo ? String(plan.odo.miles) : "Odometer"}
              className={fieldClass}
            />
          </Field>
        ) : null}
      </div>
      <p className="text-[12px] text-[var(--m-muted)]">
        {yearly
          ? "Comes up on this day every year, with no last-done day needed. It stays due for a month, then waits for next year."
          : car
            ? "Months, miles, or both: whichever comes first. Without a last-done day it stays quiet."
            : "Without a last-done day it stays quiet: no reminder until you set one."}
      </p>
      <DialogFooter className="items-center gap-2 sm:justify-between">
        {job ? (
          asking ? (
            <span className="flex items-center gap-2 text-[13px]">
              Delete it?
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => void remove()}
              >
                Yes, delete
              </Button>
            </span>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-[var(--m-bad)]"
              onClick={() => setAsking(true)}
            >
              Delete job
            </Button>
          )
        ) : (
          <span />
        )}
        <span className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={busy || !valid} onClick={() => void save()}>
            {job ? "Save" : "Add job"}
          </Button>
        </span>
      </DialogFooter>
    </>
  );
}

export function JobDialog(props: {
  start: JobStart | null;
  plans: Plan[];
  today: string;
  onClose: () => void;
  onAdd: (assetId: string, job: JobInput) => Promise<boolean>;
  onChange: (assetId: string, jobId: string, job: Partial<JobInput>) => Promise<boolean>;
  onRemove: (assetId: string, jobId: string) => Promise<boolean>;
}) {
  const { start, ...rest } = props;
  return (
    <Dialog open={!!start} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className={dialogShell} mobileClassName={dialogSheet}>
        {start && props.plans.length ? (
          <JobForm key={`${start.assetId}:${start.jobId ?? "new"}`} start={start} {...rest} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------------------- starter lists --

/** The ticking list: a row a job, its schedule in words; jobs already on the plan are marked and left out. */
function StarterList({
  list,
  have,
  picked,
  setPicked,
}: {
  list: Starter[];
  have: Set<string>;
  picked: Set<string>;
  setPicked: (next: Set<string>) => void;
}) {
  const toggle = (name: string) => {
    const next = new Set(picked);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setPicked(next);
  };
  return (
    <div className="max-h-[17rem] overflow-y-auto" role="group" aria-label="Starter jobs">
      {list.map((s) => {
        const already = have.has(s.name.toLowerCase());
        return (
          <label
            key={s.name}
            title={s.tip}
            className={cn(
              "grid min-h-[34px] cursor-pointer grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 text-[14px] hover:bg-[var(--m-tile)]",
              already && "cursor-default opacity-45 hover:bg-transparent",
            )}
          >
            <input
              type="checkbox"
              checked={already || picked.has(s.name)}
              disabled={already}
              onChange={() => toggle(s.name)}
              className="m-0 accent-[var(--m-done)]"
            />
            <span className="truncate">{s.name}</span>
            <span className="text-[12px] text-[var(--m-muted)]">
              {already
                ? "on the list"
                : s.yearly
                  ? yearDayText(s.yearly)
                  : everyText({ months: s.months ?? null, miles: s.miles ?? null })}
            </span>
          </label>
        );
      })}
    </div>
  );
}

const startPicks = (list: Starter[]) => new Set(list.filter((s) => s.on).map((s) => s.name));

function StarterForm({
  plans,
  start,
  kit,
  onClose,
  onAdd,
}: {
  plans: Plan[];
  start: string;
  kit: KitId | null;
  onClose: () => void;
  onAdd: (assetId: string, jobs: JobInput[]) => Promise<boolean>;
}) {
  // A kit (the lawn) is for a house, not a car: only the properties are offered.
  const choices = kit ? plans.filter((p) => p.kind === "property") : plans;
  const [assetId, setAssetId] = useState(start);
  const plan = choices.find((p) => p.assetId === assetId) ?? choices[0] ?? plans[0];
  const listFor = (p: Plan) => (kit ? KITS[kit].list : startersFor(p.kind));
  const [picked, setPicked] = useState(() => startPicks(listFor(plan)));
  const [busy, setBusy] = useState(false);
  const have = new Set(plan.jobs.map((j) => j.name.toLowerCase()));
  const chosen = listFor(plan).filter((s) => picked.has(s.name) && !have.has(s.name.toLowerCase()));
  const save = async () => {
    setBusy(true);
    const ok = await onAdd(plan.assetId, chosen.map(starterJob));
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <>
      <DialogHeader className="text-left">
        <DialogTitle className={dialogTitle}>
          {kit ? KITS[kit].title : "From a starter list"}
        </DialogTitle>
        <DialogDescription>
          {kit
            ? KITS[kit].blurb
            : "Tick what applies; every number can be changed after. Set when each was last done, and the reminders start."}
        </DialogDescription>
      </DialogHeader>
      {choices.length > 1 ? (
        <Field label="For">
          <select
            value={assetId}
            onChange={(e) => {
              setAssetId(e.target.value);
              const next = plans.find((p) => p.assetId === e.target.value);
              if (next) setPicked(startPicks(listFor(next)));
            }}
            className={fieldClass}
          >
            {choices.map((p) => (
              <option key={p.assetId} value={p.assetId}>
                {tabName(p)} ({KIND_WORDS[p.kind] ?? "Asset"})
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <StarterList list={listFor(plan)} have={have} picked={picked} setPicked={setPicked} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={busy || !chosen.length} onClick={() => void save()}>
          {chosen.length ? `Add ${chosen.length} job${chosen.length === 1 ? "" : "s"}` : "Add jobs"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function StarterDialog({
  start,
  kit = null,
  plans,
  onClose,
  onAdd,
}: {
  /** The asset the list is for. */
  start: string | null;
  /** A kit instead of the asset's own starter list. */
  kit?: KitId | null;
  plans: Plan[];
  onClose: () => void;
  onAdd: (assetId: string, jobs: JobInput[]) => Promise<boolean>;
}) {
  return (
    <Dialog open={!!start} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={dialogShell} mobileClassName={dialogSheet}>
        {start && plans.length ? (
          <StarterForm
            key={`${start}:${kit ?? ""}`}
            plans={plans}
            start={start}
            kit={kit}
            onClose={onClose}
            onAdd={onAdd}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------- track an asset --

function TrackForm({
  assets,
  tracked,
  onClose,
  onTrack,
}: {
  assets: UpkeepAsset[];
  tracked: Set<string>;
  onClose: () => void;
  onTrack: (assetId: string, jobs: JobInput[]) => Promise<boolean>;
}) {
  const free = assets.filter((a) => !tracked.has(a.id));
  const [assetId, setAssetId] = useState<string | null>(free[0]?.id ?? null);
  const asset = free.find((a) => a.id === assetId) ?? null;
  const [picked, setPicked] = useState(() =>
    free[0] ? startPicks(startersFor(free[0].kind)) : new Set<string>(),
  );
  const [busy, setBusy] = useState(false);
  const chosen = asset ? startersFor(asset.kind).filter((s) => picked.has(s.name)) : [];
  const save = async () => {
    if (!asset) return;
    setBusy(true);
    const ok = await onTrack(asset.id, chosen.map(starterJob));
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <>
      <DialogHeader className="text-left">
        <DialogTitle className={dialogTitle}>Track an asset</DialogTitle>
        <DialogDescription>
          Any asset in Holdings can have upkeep: a house, a car, a boat. Add one in Holdings, Assets
          first if it is not there.
        </DialogDescription>
      </DialogHeader>
      {free.length ? (
        <>
          <div className="max-h-[11rem] overflow-y-auto" role="radiogroup" aria-label="Asset">
            {free.map((a) => (
              <label
                key={a.id}
                className={cn(
                  "grid min-h-[40px] cursor-pointer grid-cols-[20px_28px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 text-[14px] hover:bg-[var(--m-tile)]",
                  assetId === a.id && "bg-[var(--m-tile)]",
                )}
              >
                <input
                  type="radio"
                  name="upkeep-asset"
                  checked={assetId === a.id}
                  onChange={() => {
                    setAssetId(a.id);
                    setPicked(startPicks(startersFor(a.kind)));
                  }}
                  className="m-0 accent-[var(--m-done)]"
                />
                <AssetTile plan={{ assetId: a.id, kind: a.kind, name: a.name }} size="size-6" />
                <span className="truncate">{a.name}</span>
                <span className="text-[12px] text-[var(--m-muted)]">
                  {KIND_WORDS[a.kind] ?? "Asset"}
                </span>
              </label>
            ))}
          </div>
          {asset ? (
            <>
              <div className="text-[12px] text-[var(--m-muted)]">Start with these jobs</div>
              <StarterList
                list={startersFor(asset.kind)}
                have={new Set()}
                picked={picked}
                setPicked={setPicked}
              />
            </>
          ) : null}
        </>
      ) : (
        <p className="text-[13px] text-[var(--m-muted)]">
          {assets.length
            ? "Every asset in Holdings is tracked already."
            : "There is no asset to track yet. Add your house or car in Holdings, Assets, then come back."}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={busy || !asset} onClick={() => void save()}>
          {chosen.length
            ? `Track it with ${chosen.length} job${chosen.length === 1 ? "" : "s"}`
            : "Track it"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function TrackDialog({
  open,
  assets,
  tracked,
  onClose,
  onTrack,
}: {
  open: boolean;
  assets: UpkeepAsset[];
  tracked: Set<string>;
  onClose: () => void;
  onTrack: (assetId: string, jobs: JobInput[]) => Promise<boolean>;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={dialogShell} mobileClassName={dialogSheet}>
        {open ? (
          <TrackForm assets={assets} tracked={tracked} onClose={onClose} onTrack={onTrack} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------------------------------------------- the tab name --

function RenameForm({
  plan,
  onClose,
  onSave,
}: {
  plan: Plan;
  onClose: () => void;
  onSave: (assetId: string, label: string) => Promise<boolean>;
}) {
  const [label, setLabel] = useState(plan.label);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const ok = await onSave(plan.assetId, label);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <>
      <DialogHeader className="text-left">
        <DialogTitle className={dialogTitle}>Rename the tab</DialogTitle>
        <DialogDescription>
          The tab shows the asset&rsquo;s own name from Holdings (&ldquo;{plan.name}&rdquo;). A
          short name fits better; leave it empty to use the asset&rsquo;s name.
        </DialogDescription>
      </DialogHeader>
      <Field label="Short name">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void save()}
          maxLength={16}
          autoFocus
          placeholder={plan.name}
          className={fieldClass}
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={busy} onClick={() => void save()}>
          Save
        </Button>
      </DialogFooter>
    </>
  );
}

export function RenameDialog({
  plan,
  onClose,
  onSave,
}: {
  plan: Plan | null;
  onClose: () => void;
  onSave: (assetId: string, label: string) => Promise<boolean>;
}) {
  return (
    <Dialog open={!!plan} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={dialogShell} mobileClassName={dialogSheet}>
        {plan ? (
          <RenameForm key={plan.assetId} plan={plan} onClose={onClose} onSave={onSave} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export type { Job };
