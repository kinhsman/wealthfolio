// money-hub patch: Home & Car (owner, 2026-10-08: "make the money app a lifeOS, first track the regular house
// and car maintenance", then "any asset can have maintenance"). A maintenance plan belongs to a Holdings
// ASSET (a house is a Property, a car a Vehicle): the money-hub service keeps the jobs and what was done
// (server/drive-backup/lib/upkeep.js) and works out where every job stands; this file reads it, sends the
// owner's picks, and words the small labels. The name on a tab is the asset's own, read live.
import { useQuery } from "@tanstack/react-query";

export type StatusKind = "bad" | "warn" | "later" | "new";

export interface JobStatus {
  kind: StatusKind;
  /** What comes first: the date (d) or the miles (m). */
  by: "d" | "m" | null;
  dayLeft: number | null;
  miLeft: number | null;
  due: string | null;
  dueMi: number | null;
  /** The day it is due, or about when the miles run out. */
  dueOn: string | null;
  rank: number;
  /** The words the page shows: "Overdue 16d", "in 4d", "in 300 mi", "Jan 12, 2027", "Set last done". */
  chip: string;
}

export interface Job {
  id: string;
  name: string;
  months: number | null;
  miles: number | null;
  last: { date: string; miles: number | null } | null;
  status: JobStatus;
}

export interface Plan {
  assetId: string;
  kind: string;
  /** The asset's own name in Holdings. */
  name: string;
  /** The owner's short name for the tab; empty = the asset's name. */
  label: string;
  odo: { miles: number; at: string } | null;
  odoDays: number | null;
  perMonth: number;
  learned: boolean;
  jobs: Job[];
}

export interface UpkeepAsset {
  id: string;
  kind: string;
  name: string;
  symbol: string | null;
}

export interface BankCharge {
  id: string;
  merchant: string;
  amount: number;
  date: string;
  accountId: string | null;
}

export interface UpkeepEvent {
  id: string;
  assetId: string;
  assetName: string;
  jobId: string | null;
  name: string;
  date: string;
  cost: number;
  miles: number | null;
  note: string;
  charge: BankCharge | null;
  oneoff: boolean;
}

export interface ChargeChoice {
  id: string;
  accountId: string | null;
  date: string;
  amount: number;
  currency?: string;
  merchant: string;
  notes: string;
  /** In a category that fits this asset (house = maintenance, car = car maintenance). */
  looksRight: boolean;
  /** Already on another job. */
  used: boolean;
}

export interface UpkeepView {
  today: string;
  currency: string;
  assets: UpkeepAsset[];
  plans: Plan[];
  events: UpkeepEvent[];
  spent: { year: string; total: number; byAsset: Record<string, number> };
  summary: {
    overdue: number;
    soon: number;
    next: {
      assetId: string;
      assetName: string;
      jobId: string;
      name: string;
      chip: string;
      dueOn: string | null;
    } | null;
  };
}

/** A job as typed in a window (the service checks every field). */
export interface JobInput {
  name: string;
  months?: number | string | null;
  miles?: number | string | null;
  lastDate?: string | null;
  lastMiles?: number | string | null;
}

export interface DoneInput {
  jobId?: string;
  oneoff?: boolean;
  name?: string;
  date: string;
  cost: string;
  miles?: string;
  note?: string;
  charge?: BankCharge | null;
}

const BASE = "/api/money-hub/upkeep";
export const UPKEEP_KEY = ["money-hub", "upkeep"] as const;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      (data as { error?: string }).error || `The money app helper said ${res.status}`,
    );
  return data as T;
}

const seg = (s: string | number) => encodeURIComponent(String(s));

export const upkeepApi = {
  get: () => call<UpkeepView>("GET", ""),
  /** Money out that can be named as what paid a job: the last 14 days, or 120 when searched by a word. */
  charges: (assetId: string, q = "") =>
    call<ChargeChoice[]>(
      "GET",
      `/charges?assetId=${seg(assetId)}${q ? `&q=${seg(q)}&days=120` : ""}`,
    ),
  addPlan: (assetId: string, jobs: JobInput[], label?: string) =>
    call<UpkeepView>("POST", "/plans", { assetId, jobs, ...(label ? { label } : {}) }),
  setLabel: (assetId: string, label: string) =>
    call<UpkeepView>("PUT", `/plans/${seg(assetId)}`, { label }),
  stop: (assetId: string) => call<UpkeepView>("DELETE", `/plans/${seg(assetId)}`),
  setMiles: (assetId: string, miles: string) =>
    call<UpkeepView>("PUT", `/plans/${seg(assetId)}/miles`, { miles }),
  addJob: (assetId: string, job: JobInput) =>
    call<UpkeepView>("POST", `/plans/${seg(assetId)}/jobs`, job),
  updateJob: (assetId: string, jobId: string, job: Partial<JobInput>) =>
    call<UpkeepView>("PUT", `/plans/${seg(assetId)}/jobs/${seg(jobId)}`, job),
  removeJob: (assetId: string, jobId: string) =>
    call<UpkeepView>("DELETE", `/plans/${seg(assetId)}/jobs/${seg(jobId)}`),
  done: (assetId: string, input: DoneInput) =>
    call<UpkeepView>("POST", `/plans/${seg(assetId)}/done`, input),
  removeEvent: (id: string) => call<UpkeepView>("DELETE", `/events/${seg(id)}`),
};

export function useUpkeep() {
  return useQuery({
    queryKey: UPKEEP_KEY,
    queryFn: upkeepApi.get,
    staleTime: 60 * 1000,
  });
}

// --------------------------------------------------------------- words --

/** "Jun 3", and with the year when it is not this year's (or when asked). */
export function shortDay(iso: string, today?: string): string {
  const withYear = today ? iso.slice(0, 4) !== today.slice(0, 4) : false;
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

export const miles = (n: number) => Math.round(n).toLocaleString("en-US");
const thousands = (n: number) =>
  n % 1000 === 0 ? `${n / 1000}k` : `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;

/** "every 5k mi or 6 mo", "yearly", "every 2 yr". */
export function everyText(job: Pick<Job, "months" | "miles">): string {
  if (job.months === 12 && !job.miles) return "yearly";
  const parts: string[] = [];
  if (job.miles) parts.push(`${thousands(job.miles)} mi`);
  if (job.months) parts.push(job.months % 12 === 0 ? `${job.months / 12} yr` : `${job.months} mo`);
  return `every ${parts.join(" or ")}`;
}

/** "Jun 3 · 57,900 mi": when it was last done (the miles only for a vehicle). */
export function lastText(job: Job, today: string): string {
  if (!job.last) return "not set yet";
  return `${shortDay(job.last.date, today)}${job.last.miles != null ? ` · ${miles(job.last.miles)} mi` : ""}`;
}

/** The text of "Next due ..." under the Done window: from the day and miles typed there. */
export function nextDueText(
  job: Pick<Job, "months" | "miles">,
  date: string,
  milesNow: number | null,
  today: string,
): string {
  const parts: string[] = [];
  if (job.miles && milesNow != null) parts.push(`${miles(milesNow + job.miles)} mi`);
  if (job.months && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split("-").map(Number);
    const last = new Date(Date.UTC(y, m - 1 + job.months + 1, 0)).getUTCDate();
    const due = new Date(Date.UTC(y, m - 1 + job.months, Math.min(d, last)))
      .toISOString()
      .slice(0, 10);
    parts.push(shortDay(due, today));
  }
  return parts.length ? `Next due ${parts.join(" or ")}` : "";
}

/** The name on a tab: the owner's short name, else the asset's own. */
export const tabName = (p: Pick<Plan, "label" | "name">) => p.label || p.name;

/** Whether an asset kind can have a vehicle's miles. */
export const hasMiles = (kind: string) => kind === "vehicle";

export const KIND_WORDS: Record<string, string> = {
  property: "Property",
  vehicle: "Vehicle",
  collectible: "Collectible",
  precious: "Precious metal",
  other: "Other",
};
