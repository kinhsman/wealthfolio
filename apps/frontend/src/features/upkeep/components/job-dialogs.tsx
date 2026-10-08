// money-hub patch: Home & Car, the small windows: a job (new, changed, or its last-done day set), a starter list to
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
  everyText,
  hasMiles,
  tabName,
  type Job,
  type JobInput,
  type Plan,
  type UpkeepAsset,
} from "../lib/upkeep";
import { startersFor, starterJob, type Starter } from "../lib/starters";
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
  const [months, setMonths] = useState(job?.months ? String(job.months) : "");
  const [every, setEvery] = useState(job?.miles ? String(job.miles) : "");
  const [lastDate, setLastDate] = useState(job?.last?.date ?? "");
  const [lastMiles, setLastMiles] = useState(
    job?.last?.miles != null ? String(job.last.miles) : "",
  );
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const valid = name.trim() && (months || (car && every));
  const input = (): JobInput => ({
    name,
    months: months || null,
    miles: car ? every.replace(/,/g, "") || null : null,
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
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-2">
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
        {car
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
  kind,
  have,
  picked,
  setPicked,
}: {
  kind: string;
  have: Set<string>;
  picked: Set<string>;
  setPicked: (next: Set<string>) => void;
}) {
  const list = startersFor(kind);
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
  onClose,
  onAdd,
}: {
  plans: Plan[];
  start: string;
  onClose: () => void;
  onAdd: (assetId: string, jobs: JobInput[]) => Promise<boolean>;
}) {
  const [assetId, setAssetId] = useState(start);
  const plan = plans.find((p) => p.assetId === assetId) ?? plans[0];
  const [picked, setPicked] = useState(() => startPicks(startersFor(plan.kind)));
  const [busy, setBusy] = useState(false);
  const have = new Set(plan.jobs.map((j) => j.name.toLowerCase()));
  const chosen = startersFor(plan.kind).filter(
    (s) => picked.has(s.name) && !have.has(s.name.toLowerCase()),
  );
  const save = async () => {
    setBusy(true);
    const ok = await onAdd(plan.assetId, chosen.map(starterJob));
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <>
      <DialogHeader className="text-left">
        <DialogTitle className={dialogTitle}>From a starter list</DialogTitle>
        <DialogDescription>
          Tick what applies; every number can be changed after. Set when each was last done, and the
          reminders start.
        </DialogDescription>
      </DialogHeader>
      {plans.length > 1 ? (
        <Field label="For">
          <select
            value={assetId}
            onChange={(e) => {
              setAssetId(e.target.value);
              const next = plans.find((p) => p.assetId === e.target.value);
              if (next) setPicked(startPicks(startersFor(next.kind)));
            }}
            className={fieldClass}
          >
            {plans.map((p) => (
              <option key={p.assetId} value={p.assetId}>
                {tabName(p)} ({KIND_WORDS[p.kind] ?? "Asset"})
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <StarterList kind={plan.kind} have={have} picked={picked} setPicked={setPicked} />
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
  plans,
  onClose,
  onAdd,
}: {
  /** The asset the list is for. */
  start: string | null;
  plans: Plan[];
  onClose: () => void;
  onAdd: (assetId: string, jobs: JobInput[]) => Promise<boolean>;
}) {
  return (
    <Dialog open={!!start} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={dialogShell} mobileClassName={dialogSheet}>
        {start && plans.length ? (
          <StarterForm key={start} plans={plans} start={start} onClose={onClose} onAdd={onAdd} />
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
                kind={asset.kind}
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
