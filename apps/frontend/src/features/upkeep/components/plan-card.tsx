// money-hub patch: Maintenance, one asset's card: its name (read live from Holdings), what kind it is, a car's
// miles, and its jobs with what is due first on top. A job row: name over "every X · last Y", where it stands,
// and Done. On a phone a row is a check circle, the name and where it stands, and the list folds after four.
import { Sprout } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { cn } from "@/lib/utils";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icons,
} from "@wealthfolio/ui";

import {
  KIND_WORDS,
  hasMiles,
  rowText,
  miles as milesText,
  tabName,
  type Job,
  type Plan,
} from "../lib/upkeep";
import { AssetTile, Card, CountChip, StatusChip, fieldClass } from "./parts";

const PHONE_ROWS = 4;

export interface PlanActions {
  onDone: (plan: Plan, job: Job) => void;
  onEdit: (plan: Plan, job: Job) => void;
  onAddJob: (plan: Plan) => void;
  onStarter: (plan: Plan) => void;
  onLawn: (plan: Plan) => void;
  onOneOff: (plan: Plan) => void;
  onRename: (plan: Plan) => void;
  onStop: (plan: Plan) => void;
  onMiles: (plan: Plan, miles: string) => Promise<boolean>;
}

function JobRow({
  plan,
  job,
  today,
  phone,
  flash,
  actions,
}: {
  plan: Plan;
  job: Job;
  today: string;
  phone: boolean;
  flash: boolean;
  actions: PlanActions;
}) {
  const kind = job.status.kind;
  const tint = kind === "bad" ? "bg-[color-mix(in_srgb,var(--m-bad)_8%,transparent)]" : "";
  if (phone)
    return (
      <li
        className={cn(
          "grid min-h-[38px] grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-2 px-3 text-[14px]",
          tint,
          flash && "animate-pulse",
        )}
      >
        <button
          type="button"
          aria-label={`Mark ${job.name} done`}
          title="Mark done"
          onClick={() => actions.onDone(plan, job)}
          className={cn(
            "flex size-6 items-center justify-center rounded-full border-[1.5px] text-transparent active:bg-[var(--m-done)] active:text-[var(--m-on-done)]",
            kind === "bad"
              ? "border-[var(--m-bad)]"
              : kind === "warn"
                ? "border-[var(--m-warn)]"
                : "border-[color-mix(in_srgb,var(--m-muted)_55%,transparent)]",
          )}
        >
          <Icons.Check className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => actions.onEdit(plan, job)}
          className="min-w-0 truncate text-left"
        >
          {job.name}
        </button>
        <StatusChip
          status={job.status}
          onClick={kind === "new" ? () => actions.onEdit(plan, job) : undefined}
        />
      </li>
    );
  return (
    <li
      className={cn(
        "grid min-h-[46px] grid-cols-[minmax(0,1fr)_auto_84px_28px] items-center gap-3 px-3.5 text-[14px] hover:bg-[var(--m-tile)]",
        tint,
        flash && "animate-pulse",
      )}
    >
      <button
        type="button"
        onClick={() => actions.onEdit(plan, job)}
        className="flex min-w-0 flex-col text-left leading-[1.3]"
        title="Change this job"
      >
        <span className="truncate">{job.name}</span>
        <span className="truncate text-[12px] text-[var(--m-muted)]">{rowText(job, today)}</span>
      </button>
      <StatusChip
        status={job.status}
        onClick={kind === "new" ? () => actions.onEdit(plan, job) : undefined}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1 px-2.5 text-[12px]"
        onClick={() => actions.onDone(plan, job)}
      >
        <Icons.Check className="size-3.5" aria-hidden />
        Done
      </Button>
      <button
        type="button"
        aria-label={`Change ${job.name}`}
        title="Change this job"
        onClick={() => actions.onEdit(plan, job)}
        className="flex size-7 items-center justify-center rounded-md text-[var(--m-muted)] hover:bg-[var(--m-track)] hover:text-[var(--m-ink)]"
      >
        <Icons.Pencil className="size-3.5" aria-hidden />
      </button>
    </li>
  );
}

function MilesEditor({
  plan,
  onSave,
  onCancel,
}: {
  plan: Plan;
  onSave: (miles: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(plan.odo ? String(plan.odo.miles) : "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const ok = await onSave(value);
    setBusy(false);
    if (ok) onCancel();
  };
  return (
    <span className="flex items-center gap-1.5">
      <input
        type="text"
        inputMode="numeric"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^\d,]/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") onCancel();
        }}
        aria-label="Miles on the odometer"
        placeholder="Odometer"
        className={cn(fieldClass, "h-7 w-[104px] text-[14px] sm:text-[13px]")}
      />
      <Button
        type="button"
        size="sm"
        className="h-7 px-2.5 text-[12px]"
        disabled={busy || !value}
        onClick={() => void save()}
      >
        Save
      </Button>
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="flex size-7 items-center justify-center rounded-md text-[var(--m-muted)] hover:bg-[var(--m-track)]"
      >
        <Icons.X className="size-3.5" aria-hidden />
      </button>
    </span>
  );
}

export function PlanCard({
  plan,
  today,
  phone,
  flashJob,
  actions,
}: {
  plan: Plan;
  today: string;
  phone: boolean;
  flashJob: string | null;
  actions: PlanActions;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const navigate = useNavigate();
  const car = hasMiles(plan.kind);
  const fold = phone && plan.jobs.length > PHONE_ROWS;
  const shown = fold && !open ? plan.jobs.slice(0, PHONE_ROWS) : plan.jobs;
  const stale = car && plan.odoDays != null && plan.odoDays > 30;
  const sub = [
    KIND_WORDS[plan.kind] ?? "Asset",
    ...(plan.label && plan.label !== plan.name && !phone ? [plan.name] : []),
    ...(car
      ? [
          plan.odo ? `${milesText(plan.odo.miles)} mi` : "no miles yet",
          ...(plan.learned && !phone ? [`${milesText(plan.perMonth)} mi a month`] : []),
        ]
      : []),
  ].join(" · ");
  return (
    <Card bleed>
      <div className="flex items-center gap-2.5 px-3.5 pb-1.5 pt-3 max-md:gap-2 max-md:px-2.5 max-md:pb-0.5 max-md:pt-2">
        <AssetTile plan={plan} size="size-7 max-md:size-6" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-medium max-md:text-[14px]">{tabName(plan)}</h2>
          <div className="flex min-h-[20px] items-center gap-2 truncate text-[12px] text-[var(--m-muted)]">
            {editing ? (
              <MilesEditor
                plan={plan}
                onSave={(m) => actions.onMiles(plan, m)}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <>
                <span className="truncate">{sub}</span>
                {stale ? (
                  <span className="shrink-0 text-[var(--m-warn)]">
                    read {plan.odoDays} days ago
                  </span>
                ) : null}
              </>
            )}
          </div>
        </div>
        {car && !editing ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("h-7 gap-1 text-[12px]", phone ? "w-7 px-0" : "px-2.5")}
            aria-label="Update miles"
            title="Update miles"
            onClick={() => setEditing(true)}
          >
            <Icons.CircleGauge className="size-3.5" aria-hidden />
            {phone ? null : "Update miles"}
          </Button>
        ) : null}
        <CountChip plan={plan} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`More for ${tabName(plan)}`}
              className="flex size-7 items-center justify-center rounded-md text-[var(--m-muted)] hover:bg-[var(--m-track)] hover:text-[var(--m-ink)]"
            >
              <Icons.Ellipsis className="size-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            <DropdownMenuItem className="h-8" onSelect={() => actions.onAddJob(plan)}>
              <Icons.Plus className="mr-2 size-4" aria-hidden />
              Custom job
            </DropdownMenuItem>
            <DropdownMenuItem className="h-8" onSelect={() => actions.onStarter(plan)}>
              <Icons.List className="mr-2 size-4" aria-hidden />
              From a starter list
            </DropdownMenuItem>
            {plan.kind === "property" ? (
              <DropdownMenuItem className="h-8" onSelect={() => actions.onLawn(plan)}>
                <Sprout className="mr-2 size-4" aria-hidden />
                Lawn care (Chicago)
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem className="h-8" onSelect={() => actions.onOneOff(plan)}>
              <Icons.Wrench className="mr-2 size-4" aria-hidden />
              One-off repair
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="h-8"
              onSelect={() => navigate(`/holdings/${encodeURIComponent(plan.assetId)}`)}
            >
              <Icons.Link className="mr-2 size-4" aria-hidden />
              Linked charges
            </DropdownMenuItem>
            <DropdownMenuItem className="h-8" onSelect={() => actions.onRename(plan)}>
              <Icons.Pencil className="mr-2 size-4" aria-hidden />
              Rename the tab
            </DropdownMenuItem>
            <DropdownMenuItem className="h-8" onSelect={() => actions.onStop(plan)}>
              <Icons.Trash className="mr-2 size-4" aria-hidden />
              Stop tracking
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {plan.jobs.length ? (
        <ul className="pb-1.5">
          {shown.map((j) => (
            <JobRow
              key={j.id}
              plan={plan}
              job={j}
              today={today}
              phone={phone}
              flash={flashJob === j.id}
              actions={actions}
            />
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-start gap-2 px-3.5 pb-3.5 pt-1 text-[13px] text-[var(--m-muted)]">
          <p>No jobs yet.</p>
          <Button type="button" size="sm" className="h-8" onClick={() => actions.onStarter(plan)}>
            Pick from a starter list
          </Button>
        </div>
      )}
      {fold ? (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex h-[38px] w-full items-center justify-center gap-1.5 border-t border-[var(--m-line-soft)] text-[13px] text-[var(--m-muted)]"
        >
          {open ? "Show less" : `Show ${plan.jobs.length - PHONE_ROWS} more`}
        </button>
      ) : null}
    </Card>
  );
}
