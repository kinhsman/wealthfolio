// money-hub patch: Maintenance (owner, 2026-10-08: "make the money app a lifeOS, first track the regular house and
// car maintenance", then "any asset can have maintenance"). One tab per tracked Holdings asset, named by the
// asset itself, each with its jobs and what is due first; an Overview of all of them and the recent jobs. Marking
// a job done can name the bank charge that paid it. Everything comes from the money-hub service
// (lib/upkeep.ts); the page only shows it and sends the owner's picks back.
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useDashboardSkins } from "@/features/spending/lib/dashboard-skin";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icons,
  Page,
  PageContent,
  PageHeader,
  Skeleton,
} from "@wealthfolio/ui";

import { DoneDialog, type DoneStart } from "../components/done-dialog";
import { HistoryCard } from "../components/history-card";
import {
  JobDialog,
  RenameDialog,
  StarterDialog,
  TrackDialog,
  type JobStart,
} from "../components/job-dialogs";
import { PlanCard, type PlanActions } from "../components/plan-card";
import { Card, useUpkeepAct } from "../components/parts";
import { Summary } from "../components/summary";
import { tabName, upkeepApi, useUpkeep, type Plan } from "../lib/upkeep";

function Pills({
  items,
  value,
  onPick,
}: {
  items: { key: string; label: string }[];
  value: string;
  onPick: (key: string) => void;
}) {
  return (
    <div
      className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-[var(--m-track)] p-[3px]"
      role="group"
      aria-label="Maintenance"
    >
      {items.map((i) => (
        <button
          key={i.key}
          type="button"
          aria-pressed={i.key === value}
          data-m={i.key === value ? "fill" : undefined}
          onClick={() => onPick(i.key)}
          className={cn(
            "h-7 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[12.5px] max-md:px-3",
            i.key === value
              ? "bg-[var(--m-surface)] text-[var(--m-ink)]"
              : "text-[var(--m-muted)] hover:text-[var(--m-ink-2)]",
          )}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

function AddMenu({
  phone,
  hasPlans,
  onStarter,
  onCustom,
  onOneOff,
  onTrack,
}: {
  phone: boolean;
  hasPlans: boolean;
  onStarter: () => void;
  onCustom: () => void;
  onOneOff: () => void;
  onTrack: () => void;
}) {
  if (!hasPlans)
    return (
      <Button type="button" size="sm" className="h-8 gap-1.5" onClick={onTrack}>
        <Icons.Plus className="size-4" aria-hidden />
        Track an asset
      </Button>
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          className={cn("h-8 gap-1.5", phone && "w-8 px-0")}
          aria-label="Add job"
        >
          <Icons.Plus className="size-4" aria-hidden />
          {phone ? null : (
            <>
              Add job
              <Icons.ChevronDown className="size-3.5 opacity-80" aria-hidden />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuItem className="h-8" onSelect={onStarter}>
          <Icons.List className="mr-2 size-4" aria-hidden />
          From a starter list
        </DropdownMenuItem>
        <DropdownMenuItem className="h-8" onSelect={onCustom}>
          <Icons.Plus className="mr-2 size-4" aria-hidden />
          Custom job
        </DropdownMenuItem>
        <DropdownMenuItem className="h-8" onSelect={onOneOff}>
          <Icons.Wrench className="mr-2 size-4" aria-hidden />
          One-off repair
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="h-8" onSelect={onTrack}>
          <Icons.Plus className="mr-2 size-4" aria-hidden />
          Track another asset
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Welcome({ hasAssets, onTrack }: { hasAssets: boolean; onTrack: () => void }) {
  return (
    <Card className="flex flex-col items-start gap-2.5 !px-5 !py-5">
      <h2 className="text-[16px] font-medium">Keep up with the house, the car, anything you own</h2>
      <p className="max-w-[60ch] text-[13.5px] text-[var(--m-ink-2)]">
        Pick an asset from Holdings and list the jobs it needs: the furnace filter every 3 months,
        the oil change every 5,000 miles. You get a reminder before each is due, and every job you
        finish keeps its cost and the bank charge that paid it.
      </p>
      {hasAssets ? (
        <Button type="button" size="sm" className="h-8 gap-1.5" onClick={onTrack}>
          <Icons.Plus className="size-4" aria-hidden />
          Track an asset
        </Button>
      ) : (
        <p className="text-[13px] text-[var(--m-muted)]">
          There is no asset to track yet. Add your house or car in{" "}
          <Link to="/holdings" className="underline underline-offset-4 hover:no-underline">
            Holdings, Assets
          </Link>{" "}
          first, then come back.
        </p>
      )}
    </Card>
  );
}

export default function UpkeepPage() {
  const skins = useDashboardSkins();
  const phone = useIsMobileViewport();
  const [params, setParams] = useSearchParams();
  const { data: view, error, isLoading, refetch } = useUpkeep();
  const { run } = useUpkeepAct();
  const [done, setDone] = useState<DoneStart | null>(null);
  const [job, setJob] = useState<JobStart | null>(null);
  const [starter, setStarter] = useState<string | null>(null);
  const [track, setTrack] = useState(false);
  const [rename, setRename] = useState<Plan | null>(null);
  const [stopping, setStopping] = useState<Plan | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const plans = view?.plans ?? [];
  const asked = params.get("tab") ?? "overview";
  const tab = asked === "history" || plans.some((p) => p.assetId === asked) ? asked : "overview";
  const pick = (key: string) =>
    setParams(key === "overview" ? {} : { tab: key }, { replace: true });
  const current = plans.find((p) => p.assetId === tab) ?? plans[0];

  const actions: PlanActions = {
    onDone: (p, j) => setDone({ assetId: p.assetId, jobId: j.id }),
    onEdit: (p, j) => setJob({ assetId: p.assetId, jobId: j.id }),
    onAddJob: (p) => setJob({ assetId: p.assetId, jobId: null }),
    onStarter: (p) => setStarter(p.assetId),
    onOneOff: (p) => setDone({ assetId: p.assetId, jobId: null }),
    onRename: (p) => setRename(p),
    onStop: (p) => setStopping(p),
    onMiles: (p, m) => run("miles", () => upkeepApi.setMiles(p.assetId, m), "Miles saved"),
  };

  const cards = (list: Plan[]) =>
    list.map((p) => (
      <PlanCard
        key={p.assetId}
        plan={p}
        today={view?.today ?? ""}
        phone={phone}
        flashJob={flash}
        actions={actions}
      />
    ));

  return (
    <div className="meadow min-h-screen" data-light-skin={skins.light} data-dark-skin={skins.dark}>
      <Page>
        <PageHeader
          heading="Maintenance"
          actions={
            view ? (
              <AddMenu
                phone={phone}
                hasPlans={plans.length > 0}
                onStarter={() => current && setStarter(current.assetId)}
                onCustom={() => current && setJob({ assetId: current.assetId, jobId: null })}
                onOneOff={() => current && setDone({ assetId: current.assetId, jobId: null })}
                onTrack={() => setTrack(true)}
              />
            ) : undefined
          }
        />
        <PageContent className="px-3 pb-[var(--mobile-nav-total-offset)] md:px-6 md:pb-8 lg:px-8">
          <div className="flex flex-col gap-3.5 max-md:gap-2">
            {view && plans.length ? (
              <>
                <Pills
                  items={[
                    { key: "overview", label: "Overview" },
                    ...plans.map((p) => ({ key: p.assetId, label: tabName(p) })),
                    { key: "history", label: "History" },
                  ]}
                  value={tab}
                  onPick={pick}
                />
                {tab === "history" ? null : <Summary view={view} phone={phone} />}
                {tab === "overview" ? (
                  <>
                    <div
                      className={cn(
                        "grid items-start gap-3.5 max-md:gap-2",
                        plans.length > 1 && "lg:grid-cols-2",
                      )}
                    >
                      {cards(plans)}
                    </div>
                    <HistoryCard
                      events={view.events}
                      currency={view.currency}
                      today={view.today}
                      phone={phone}
                      limit={phone ? 3 : 6}
                      onTakeBack={(e) =>
                        run("back", () => upkeepApi.removeEvent(e.id), "Taken back")
                      }
                    />
                  </>
                ) : tab === "history" ? (
                  <HistoryCard
                    events={view.events}
                    currency={view.currency}
                    today={view.today}
                    phone={phone}
                    onTakeBack={(e) => run("back", () => upkeepApi.removeEvent(e.id), "Taken back")}
                  />
                ) : (
                  cards(plans.filter((p) => p.assetId === tab))
                )}
              </>
            ) : view ? (
              <Welcome hasAssets={view.assets.length > 0} onTrack={() => setTrack(true)} />
            ) : isLoading ? (
              <div className="flex flex-col gap-3.5" aria-busy>
                <Skeleton className="h-20 w-full rounded-[20px]" />
                <Skeleton className="h-64 w-full rounded-[20px]" />
              </div>
            ) : (
              <div className="rounded-[20px] border border-[var(--m-line)] bg-[var(--m-surface)] px-[18px] py-4 text-[13.5px]">
                <p>{error?.message ?? "Maintenance could not be loaded."}</p>
                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="mt-1 text-[12.5px] underline underline-offset-4 hover:no-underline"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </PageContent>
      </Page>

      <DoneDialog
        start={done}
        plans={plans}
        today={view?.today ?? ""}
        currency={view?.currency ?? "USD"}
        onClose={() => setDone(null)}
        onSave={async (assetId, input) => {
          const ok = await run(
            "done",
            () => upkeepApi.done(assetId, input),
            input.oneoff ? `${input.name} saved` : "Marked done",
          );
          if (ok && input.jobId) {
            setFlash(input.jobId);
            setTimeout(() => setFlash(null), 1700);
          }
          return ok;
        }}
      />
      <JobDialog
        start={job}
        plans={plans}
        today={view?.today ?? ""}
        onClose={() => setJob(null)}
        onAdd={(a, j) => run("job", () => upkeepApi.addJob(a, j), "Job added")}
        onChange={(a, id, j) => run("job", () => upkeepApi.updateJob(a, id, j), "Job saved")}
        onRemove={(a, id) => run("job", () => upkeepApi.removeJob(a, id), "Job deleted")}
      />
      <StarterDialog
        start={starter}
        plans={plans}
        onClose={() => setStarter(null)}
        onAdd={(a, jobs) => run("starter", () => upkeepApi.addPlan(a, jobs), "Jobs added")}
      />
      <TrackDialog
        open={track}
        assets={view?.assets ?? []}
        tracked={new Set(plans.map((p) => p.assetId))}
        onClose={() => setTrack(false)}
        onTrack={async (a, jobs) => {
          const ok = await run("track", () => upkeepApi.addPlan(a, jobs), "Tracking it");
          if (ok) pick(a);
          return ok;
        }}
      />
      <RenameDialog
        plan={rename}
        onClose={() => setRename(null)}
        onSave={(a, label) => run("rename", () => upkeepApi.setLabel(a, label), "Tab renamed")}
      />
      <AlertDialog open={!!stopping} onOpenChange={(o) => !o && setStopping(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop tracking {stopping ? tabName(stopping) : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              The tab and its reminders go. What was done stays in History, and tracking the asset
              again brings its jobs back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep tracking</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const p = stopping;
                setStopping(null);
                if (!p) return;
                void run("stop", () => upkeepApi.stop(p.assetId), "Stopped tracking").then((ok) => {
                  if (ok && tab === p.assetId) pick("overview");
                });
              }}
            >
              Stop tracking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
