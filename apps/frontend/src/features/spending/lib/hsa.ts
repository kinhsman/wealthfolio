// money-hub patch: HSA receipts (/spending/hsa; owner, 2026-10-04: "plan to move it directly to this app
// instead", the n8n "HSA Receipt Bot" that logged medical receipts for reimbursement). A photo, a PDF's
// picture or typed details go to the money-hub service (server/drive-backup/lib/hsa.js): the AI reads
// provider, date, amount and currency, the page keeps them, finds the card charge, marks what is reimbursed,
// and exports a packet for a claim. This file is the page's whole data layer: the types, the API client, the
// hooks, and the pure helpers (labels, search, filters, totals, banner words, export links) that are tested.
import { useQuery, type QueryClient } from "@tanstack/react-query";

import { dayWords, moneyWords, plain } from "./receipts";

// ---------------------------------------------------------------------------------------------- types --

export type HsaStatus = "unreimbursed" | "reimbursed" | "review" | "junk";
/** Where the dollar figure comes from: the bank charge, the receipt itself, a converted estimate, or typed by hand. */
export type HsaAmountSource = "card" | "receipt" | "estimate" | "unverified";

export interface HsaReceipt {
  id: string;
  at: string;
  /** photo, text (typed details), or import (the old Notion table). */
  source: string;
  date: string;
  provider: string;
  patient: string | null;
  type: string;
  description: string;
  /** What the receipt says, in its own currency. */
  amount: number;
  currency: string;
  rate: number | null;
  /** The dollars; null when no rate was available. */
  usd: number | null;
  amountSource: HsaAmountSource;
  status: HsaStatus;
  reimbursedOn: string | null;
  notes: string;
  dupeGroup: string;
  photos: number;
  /** The old Drive picture of a row moved from Notion. */
  oldLink: string | null;
  chargeId: string | null;
  chargeDate: string | null;
  confidence: number | null;
  /** Every picture is copied to the Drive folder. */
  inDrive: boolean;
}

export interface HsaSum {
  n: number;
  usd: number;
  /** How many of them have no dollar amount yet. */
  noUsd: number;
}

export interface HsaTotals {
  unreimbursed: HsaSum;
  review: HsaSum;
  reimbursed: HsaSum;
  needsPhoto: number;
  byYear: { year: string; all: HsaSum; unreimbursed: HsaSum }[];
  byPatient: { patient: string | null; all: HsaSum; unreimbursed: HsaSum }[];
}

export interface HsaSettings {
  patients: string[];
  sameTolerance: number;
  approxTolerance: number;
  minConfidence: number;
  /** The Drive copy switch. */
  mirror: boolean;
}

export interface HsaMirror {
  on: boolean;
  link: "ok" | "unlinked" | "relink";
  folder: string | null;
  waiting: number;
  paused: string | null;
  error: string | null;
  lastAt: string | null;
  /** The Google Sheet "HSA Receipts List" (a full copy of the table); null until the first copy ran. */
  sheetUrl: string | null;
  /** The Drive folder "HSA Receipts" with the picture copies. */
  folderUrl: string | null;
  /** When the sheet was last written. */
  sheetAt: string | null;
}

export interface HsaView {
  ready: boolean;
  settings: HsaSettings;
  types: string[];
  totals: HsaTotals;
  mirror: HsaMirror;
  receipts: HsaReceipt[];
}

export type HsaOutcome =
  | "saved"
  | "duplicate"
  | "attached"
  | "unreadable"
  | "not_receipt"
  | "need_detail";

export interface HsaMatch {
  id: string;
  title: string;
  how: string;
  hasPhoto: boolean;
}

export interface HsaAnswer {
  outcome: HsaOutcome;
  matches?: HsaMatch[];
  receipt: HsaReceipt | null;
}

/** A card charge the receipt may be for. */
export interface HsaCharge {
  id: string;
  date: string;
  amount: number;
  name: string;
  account: string;
  /** Its total is the receipt's, to the cent. */
  sameTotal: boolean;
  /** The provider's name is in the bank text. */
  store: boolean;
}

// ------------------------------------------------------------------------------------------------ api --

const BASE = "/api/money-hub/hsa";
export const HSA_KEY = ["money-hub", "hsa"] as const;
export const HSA_PATH = "/spending/hsa";
/** Where the Google Drive link is made (Settings, Backups). */
export const DRIVE_SETTINGS_PATH = "/settings/exports";
/** The server's way to say "a receipt with no patient" in an export. */
export const NO_PATIENT = "-";
export const MAX_PHOTOS = 4;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: body === undefined || isForm ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      (data as { error?: string }).error || `The money app helper said ${res.status}`,
    );
  return data as T;
}

const photosForm = (files: File[]) => {
  const form = new FormData();
  for (const f of files.slice(0, MAX_PHOTOS)) form.append("photo", f);
  return form;
};

export const hsaApi = {
  /** Photos of one receipt (up to 4): read, checked for a twin, kept. */
  add: (files: File[]) => call<HsaAnswer>("POST", "", photosForm(files)),
  /** Typed details. */
  addText: (text: string) => call<HsaAnswer>("POST", "/text", { text }),
  /** Only the fields that changed. */
  edit: (id: string, patch: HsaPatch) => call<HsaReceipt>("PUT", `/${id}`, patch),
  /** The card charge the owner picked for a receipt: its amount becomes the figure. */
  setCharge: (id: string, activityId: string) =>
    call<HsaReceipt>("PUT", `/${id}/charge`, { activityId }),
  /** More pictures for a receipt kept already. */
  addPhotos: (id: string, files: File[]) =>
    call<HsaReceipt>("POST", `/${id}/photos`, photosForm(files)),
  remove: (id: string) => call<HsaView>("DELETE", `/${id}`),
  saveSettings: (patch: Partial<Pick<HsaSettings, "patients" | "mirror">>) =>
    call<HsaView>("PUT", "/settings", patch),
  /** Copy to Drive now; answers at once, the copy runs on. */
  runMirror: () => call<HsaView>("POST", "/mirror/run"),
};

export const photoUrl = (id: string, n = 0) => `${BASE}/${id}/photo/${n}`;

/**
 * The list, with its totals, settings and the Drive copy's state. `poll` is read after every answer: a number
 * of milliseconds keeps asking again, false stops (the page polls for a minute after Copy now).
 */
export function useHsa(poll?: (view: HsaView | undefined) => number | false) {
  return useQuery({
    queryKey: HSA_KEY,
    queryFn: () => call<HsaView>("GET", ""),
    staleTime: 60 * 1000,
    refetchInterval: poll ? (query) => poll(query.state.data) : false,
  });
}

export function useHsaCharges(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...HSA_KEY, "candidates", id],
    queryFn: () =>
      call<{ from: string; to: string; items: HsaCharge[] }>("GET", `/${id}/candidates`),
    enabled,
    staleTime: 0,
  });
}

/** After any change: the list answers again. */
export const refreshAfterHsa = (qc: QueryClient) => qc.invalidateQueries({ queryKey: HSA_KEY });

// ------------------------------------------------------------------------------------------ labels --

export const STATUS_LABEL: Record<HsaStatus, string> = {
  unreimbursed: "Unreimbursed",
  review: "Needs review",
  reimbursed: "Reimbursed",
  junk: "Junk / test",
};
/** The statuses in the order a status pick lists them. */
export const STATUS_ORDER: HsaStatus[] = ["unreimbursed", "review", "reimbursed", "junk"];

export const SOURCE_LABEL: Record<HsaAmountSource, string> = {
  card: "Card charge",
  receipt: "Receipt total",
  estimate: "Converted estimate",
  unverified: "Unverified",
};
/** A phone's one-word forms. */
export const SOURCE_SHORT: Record<HsaAmountSource, string> = {
  card: "Card",
  receipt: "Receipt",
  estimate: "Estimate",
  unverified: "Unverified",
};
export const SOURCE_ORDER: HsaAmountSource[] = ["card", "receipt", "estimate", "unverified"];

/** How loud a tag is: good = green, plain = neutral, look = amber (needs a look), bad = red, info = cool, muted = quiet. */
export type Tone = "good" | "plain" | "look" | "bad" | "info" | "muted";

export const sourceTone = (s: HsaAmountSource): Tone =>
  s === "card" ? "good" : s === "estimate" ? "look" : s === "unverified" ? "bad" : "plain";

export const statusTone = (s: HsaStatus): Tone =>
  s === "reimbursed" ? "good" : s === "review" ? "look" : s === "junk" ? "muted" : "info";

// ------------------------------------------------------------------------------------------- money --

/** "$1,234.50" (pure). */
export const formatUsd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** What the receipt says, in its own currency: "$45.00", "1,250,000 VND" (pure). */
export function amountText(r: Pick<HsaReceipt, "amount" | "currency">): string {
  if (r.currency === "USD") return formatUsd(r.amount);
  return `${r.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${r.currency}`;
}

/** The dollar figure for a receipt that is not in dollars; null for one that is (the amount says it). */
export const usdNote = (r: Pick<HsaReceipt, "currency" | "usd">): string | null =>
  r.currency === "USD" ? null : r.usd != null ? formatUsd(r.usd) : null;

/** "Sep 19, 2026" from "2026-09-19" (pure; no time zone shift). */
export function dayText(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Today as the owner's calendar says it, YYYY-MM-DD (not the UTC day). */
export function todayIso(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** The picture-less and picture-full shapes the shared picture panel takes (pure). */
export const pictured = (r: HsaReceipt) => ({
  id: r.id,
  photos: r.photos,
  source: "photo" as const,
  store: r.provider,
  date: r.date,
  total: r.usd ?? r.amount,
});

/** No picture of its own and no old Drive link: the "Needs photo" list. */
export const needsPhoto = (r: Pick<HsaReceipt, "photos" | "oldLink">) =>
  !(r.photos > 0) && !r.oldLink;

// ----------------------------------------------------------------------------------------- totals --

const cents = (x: number | null | undefined) => Math.round(Number(x || 0) * 100);

const sumOf = (rows: HsaReceipt[]): HsaSum => ({
  n: rows.length,
  usd: rows.reduce((a, r) => a + cents(r.usd), 0) / 100,
  noUsd: rows.filter((r) => !((r.usd ?? 0) > 0)).length,
});

export interface HsaScope {
  year: string | null;
  /** A name, NO_PATIENT for none, or null for everyone. */
  patient: string | null;
}

/** The receipts inside a year and a person (junk is never in them). */
export function scopeRows(rows: HsaReceipt[], scope: HsaScope): HsaReceipt[] {
  return rows.filter(
    (r) =>
      r.status !== "junk" &&
      (!scope.year || r.date.startsWith(scope.year)) &&
      (scope.patient == null ||
        (scope.patient === NO_PATIENT ? !r.patient : r.patient === scope.patient)),
  );
}

/** The strip's three figures for the receipts in scope, in whole cents so nothing drifts (the server's own sums). */
export function totalsOfRows(rows: HsaReceipt[]) {
  const live = rows.filter((r) => r.status !== "junk");
  return {
    unreimbursed: sumOf(live.filter((r) => r.status === "unreimbursed")),
    review: sumOf(live.filter((r) => r.status === "review")),
    reimbursed: sumOf(live.filter((r) => r.status === "reimbursed")),
    needsPhoto: live.filter(needsPhoto).length,
  };
}

/** "6 receipts" (pure). */
export const countText = (n: number) => `${n} ${n === 1 ? "receipt" : "receipts"}`;

/** What is still missing a dollar figure, in words; null when nothing is (a phone's words are fewer). */
export function noUsdText(sum: Pick<HsaSum, "noUsd">, short = false): string | null {
  if (sum.noUsd <= 0) return null;
  if (short) return `${sum.noUsd} with no $`;
  return sum.noUsd === 1 ? "1 has no dollar amount yet" : `${sum.noUsd} have no dollar amount yet`;
}

// ----------------------------------------------------------------------------------------- filters --

export interface HsaFilters extends HsaScope {
  status: HsaStatus | null;
  needsPhoto: boolean;
}

export const NO_FILTERS: HsaFilters = {
  year: null,
  patient: null,
  status: null,
  needsPhoto: false,
};

export const isFiltered = (f: HsaFilters) =>
  !!(f.year || f.patient != null || f.status || f.needsPhoto);

/** The receipts the list shows (pure): junk stays hidden unless the status filter is Junk. */
export function filterHsa(rows: HsaReceipt[], f: HsaFilters): HsaReceipt[] {
  return rows.filter((r) => {
    if (f.status === "junk" ? r.status !== "junk" : r.status === "junk") return false;
    if (f.status && f.status !== "junk" && r.status !== f.status) return false;
    if (f.year && !r.date.startsWith(f.year)) return false;
    if (f.patient != null && (f.patient === NO_PATIENT ? !!r.patient : r.patient !== f.patient))
      return false;
    if (f.needsPhoto && !needsPhoto(r)) return false;
    return true;
  });
}

/** How many receipts are junk (the Junk chip shows only when there are some). */
export const junkCount = (rows: HsaReceipt[]) => rows.filter((r) => r.status === "junk").length;

// ------------------------------------------------------------------------------------------ search --

/**
 * Everything a receipt's row shows, as the page words it, ready to be searched (owner rule, 10-04: only words
 * the page really shows; a hidden word made "pho" match every photo receipt). The notes are not here: they are
 * only in the opened receipt, and "Added from a photo." would match every one.
 */
export function hsaSearchText(r: HsaReceipt): string {
  const own =
    r.currency === "USD"
      ? moneyWords(r.amount)
      : [
          r.amount.toFixed(2),
          r.amount.toLocaleString("en-US", { maximumFractionDigits: 2 }),
          String(r.amount),
          r.currency,
        ];
  return plain(
    [
      r.provider,
      r.description,
      r.patient ?? "no patient",
      r.type,
      ...dayWords(r.date),
      ...own,
      ...(r.currency === "USD" ? [] : moneyWords(r.usd)),
      SOURCE_LABEL[r.amountSource],
      STATUS_LABEL[r.status],
      needsPhoto(r) ? "no photo" : null,
      r.inDrive ? "in drive" : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

/** The receipts with their search text, made once so each keystroke only compares. */
export const hsaSearchIndex = (rows: HsaReceipt[]) =>
  rows.map((receipt) => ({ receipt, text: hsaSearchText(receipt) }));

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The receipts holding every word typed, each at the START of a word (any order). Unlike the Receipts page this is
 * not "anywhere in the text": "reimbursed" must not find every "Unreimbursed" row. Nothing typed shows them all;
 * a "$" before an amount is ignored.
 */
export function searchHsa(index: ReturnType<typeof hsaSearchIndex>, query: string): HsaReceipt[] {
  const words = plain(query)
    .split(/\s+/)
    .map((w) => w.replace(/^\$/, ""))
    .filter(Boolean);
  if (!words.length) return index.map((x) => x.receipt);
  const tests = words.map((w) => new RegExp(`(?:^|[^a-z0-9])${escape(w)}`));
  return index.filter((x) => tests.every((t) => t.test(x.text))).map((x) => x.receipt);
}

// -------------------------------------------------------------------------------------- the banner --

export interface HsaBanner {
  tone: "good" | "plain" | "look";
  /** The first words ("Receipt saved", "Already filed."). */
  title: string;
  /** The rest, as the old bot said it. */
  text?: string;
  /** The titles of the receipts it matched. */
  lines?: string[];
  /** A receipt the banner can open. */
  receiptId?: string;
}

/** What the page says after an add (pure). The wording is the old Telegram bot's. */
export function outcomeBanner(answer: HsaAnswer): HsaBanner {
  const r = answer.receipt;
  switch (answer.outcome) {
    case "saved": {
      const usd = r ? usdNote(r) : null;
      return {
        tone: "good",
        title: "Receipt saved",
        text: r
          ? [r.provider, dayText(r.date), amountText(r), usd ? `about ${usd}` : null]
              .filter(Boolean)
              .join(" · ")
          : undefined,
        receiptId: r?.id,
      };
    }
    case "duplicate":
      return {
        tone: "plain",
        title: "Already filed.",
        text: "This receipt is already in your records.",
        lines: (answer.matches ?? []).map((m) => m.title),
        receiptId: r?.id,
      };
    case "attached":
      return {
        tone: "plain",
        title: "Photo attached to an existing entry.",
        text: "No new row was made.",
        lines: (answer.matches ?? []).map((m) => m.title),
        receiptId: r?.id,
      };
    case "unreadable":
      return {
        tone: "look",
        title: "Couldn't read that clearly.",
        text: "The photo looks blurry or too small. Please send a sharper, larger photo of the full receipt.",
      };
    case "not_receipt":
      return {
        tone: "look",
        title: "That doesn't look like a receipt.",
        text: "Send a clear photo, or type: provider, amount, currency, date.",
      };
    case "need_detail":
      return {
        tone: "look",
        title: "Need a bit more.",
        text: "Include provider, amount, currency and date.",
      };
  }
}

export const errorBanner = (message: string): HsaBanner => ({ tone: "look", title: message });

export const NOT_READY_TEXT = "The AI reader is not set up on the server.";

// ------------------------------------------------------------------------------------ the Drive copy --

/** "just now", "5 min ago", "3 h ago", else the day (pure). */
export function agoText(iso: string | null, now = Date.now()): string | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  const min = Math.max(0, Math.floor((now - t) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export interface MirrorLine {
  text: string;
  tone: "good" | "plain" | "look";
  /** A page the words link to (Settings, Backups). */
  to?: string;
  /** Copy now is offered. */
  canRun: boolean;
}

/** The Drive copy's one status line (pure). `short`: a phone's keywords. */
export function mirrorLine(m: HsaMirror, { short = false, now = Date.now() } = {}): MirrorLine {
  if (!m.on) return { text: "Drive copy is off", tone: "plain", canRun: false };
  if (m.link === "unlinked")
    return {
      text: short
        ? "Link Google Drive on Settings, Backups"
        : "Link Google Drive on Settings, Backups to copy receipts to Drive",
      tone: "look",
      to: DRIVE_SETTINGS_PATH,
      canRun: false,
    };
  if (m.link === "relink" || m.paused)
    return {
      text: "Drive copy paused: link Google again",
      tone: "look",
      to: DRIVE_SETTINGS_PATH,
      canRun: false,
    };
  if (m.error)
    return {
      text: short ? "Drive copy hit a problem" : "Drive copy hit a problem and will try again",
      tone: "look",
      canRun: true,
    };
  const waiting = m.waiting > 0 ? `${m.waiting} waiting` : null;
  const ago = agoText(m.sheetAt, now);
  const copied = m.sheetUrl
    ? short
      ? `Copied ${ago ?? "to Drive"}`
      : `Copied to Drive. Sheet and pictures updated ${ago ?? "recently"}`
    : m.folder
      ? short
        ? "Copied to Drive"
        : `Copied to Drive folder ${m.folder}`
      : "Drive copy is on";
  return {
    text: [copied, waiting].filter(Boolean).join(short ? ", " : ". "),
    tone: "good",
    canRun: true,
  };
}

const POLL_EVERY = 4000;
const POLL_MAX = 60_000;
/** Even with nothing waiting, the sheet is rewritten a moment after Copy now. */
const POLL_MIN = 12_000;

/**
 * How long to wait before asking again after Copy now (pure): every few seconds while pictures wait, for a minute at
 * most; with nothing waiting only the first few seconds (the sheet is written last). False stops.
 */
export function pollAfterCopy({
  startedAt,
  now,
  waiting,
}: {
  startedAt: number | null;
  now: number;
  waiting: number;
}): number | false {
  if (startedAt == null) return false;
  const age = now - startedAt;
  if (age >= POLL_MAX) return false;
  return waiting > 0 || age < POLL_MIN ? POLL_EVERY : false;
}

// --------------------------------------------------------------------------------------- export --

export interface ExportChoice {
  year: string | null;
  /** A name, NO_PATIENT, or null for everyone. */
  patient: string | null;
  status: HsaStatus | null;
}

/** The link that downloads the packet (zip) or the list sheet (CSV) for a year, a person and a status (pure). */
export function exportUrl(kind: "zip" | "csv", c: ExportChoice): string {
  const q = new URLSearchParams();
  if (c.year) q.set("year", c.year);
  if (c.patient != null && c.patient !== "") q.set("patient", c.patient);
  if (c.status) q.set("status", c.status);
  const query = q.toString();
  return `${BASE}/export.${kind}${query ? `?${query}` : ""}`;
}

// ---------------------------------------------------------------------------------------- the edit --

/** The editor's boxes, all text. */
export interface HsaDraft {
  provider: string;
  date: string;
  patient: string;
  type: string;
  description: string;
  notes: string;
  dupeGroup: string;
  amount: string;
  currency: string;
  usd: string;
  amountSource: HsaAmountSource;
  status: HsaStatus;
  reimbursedOn: string;
}

export type HsaPatch = Partial<{
  provider: string;
  date: string;
  patient: string;
  type: string;
  description: string;
  notes: string;
  dupeGroup: string;
  amount: number;
  currency: string;
  usd: number | null;
  amountSource: HsaAmountSource;
  status: HsaStatus;
  reimbursedOn: string | null;
}>;

export const draftOf = (r: HsaReceipt): HsaDraft => ({
  provider: r.provider,
  date: r.date,
  patient: r.patient ?? "",
  type: r.type,
  description: r.description,
  notes: r.notes,
  dupeGroup: r.dupeGroup,
  amount: String(r.amount),
  currency: r.currency,
  usd: r.usd != null ? r.usd.toFixed(2) : "",
  amountSource: r.amountSource,
  status: r.status,
  reimbursedOn: r.reimbursedOn ?? "",
});

const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/[$,\s]/g, "")));
const dayOk = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** The first thing wrong with the boxes, in the server's own words; null when they can be saved (pure). */
export function draftError(d: HsaDraft): string | null {
  if (!d.provider.trim()) return "Name the provider.";
  if (!dayOk(d.date)) return "The date must look like 2026-10-04.";
  if (!(num(d.amount) > 0)) return "The amount must be more than zero.";
  if (!/^[A-Za-z]{3}$/.test(d.currency.trim()))
    return "The currency is a 3-letter code like USD or VND.";
  if (d.usd.trim() !== "" && !(num(d.usd) > 0)) return "The dollar amount must be more than zero.";
  if (d.reimbursedOn && !dayOk(d.reimbursedOn))
    return "The reimbursed date must look like 2026-10-04.";
  return null;
}

/** The amount or currency was changed and the dollar box left alone: the server works the dollars out again. */
export function dollarsRecalculated(r: HsaReceipt, d: HsaDraft): boolean {
  const moneyChanged = num(d.amount) !== r.amount || d.currency.trim().toUpperCase() !== r.currency;
  return moneyChanged && d.usd.trim() === (r.usd != null ? r.usd.toFixed(2) : "");
}

/** Only what changed, ready for PUT (pure). A dollar figure typed by hand goes with where it is from. */
export function patchOf(r: HsaReceipt, d: HsaDraft): HsaPatch {
  const out: HsaPatch = {};
  const text = (
    k: "provider" | "date" | "type" | "description" | "notes" | "dupeGroup",
    before: string,
  ) => {
    const now = d[k].trim();
    if (now !== before) out[k] = now;
  };
  text("provider", r.provider);
  text("date", r.date);
  text("type", r.type);
  text("description", r.description);
  text("notes", r.notes);
  text("dupeGroup", r.dupeGroup);
  if (d.patient.trim() !== (r.patient ?? "")) out.patient = d.patient.trim();
  const amount = num(d.amount);
  if (amount !== r.amount) out.amount = amount;
  const currency = d.currency.trim().toUpperCase();
  if (currency !== r.currency) out.currency = currency;
  const usdBefore = r.usd != null ? r.usd.toFixed(2) : "";
  if (d.usd.trim() !== usdBefore) {
    out.usd = d.usd.trim() === "" ? null : num(d.usd);
    out.amountSource = d.amountSource;
  } else if (d.amountSource !== r.amountSource) out.amountSource = d.amountSource;
  if (d.status !== r.status) out.status = d.status;
  if (d.reimbursedOn !== (r.reimbursedOn ?? "")) out.reimbursedOn = d.reimbursedOn || null;
  return out;
}

/** The one tap that files a receipt as paid back. */
export const reimbursedPatch = (on: string): HsaPatch => ({
  status: "reimbursed",
  reimbursedOn: on,
});

// -------------------------------------------------------------------------------------- settings --

/** The patients as the box shows them, one per line. */
export const patientsText = (list: string[]) => list.join("\n");

/** The patients typed in the box (pure): one per line (commas too), trimmed, no repeats, as many as the server keeps. */
export function parsePatients(text: string): string[] {
  const names = text
    .split(/[\n,]/)
    .map((n) => n.replace(/\s+/g, " ").trim().slice(0, 60))
    .filter(Boolean);
  return names
    .filter((n, i) => names.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i)
    .slice(0, 20);
}
