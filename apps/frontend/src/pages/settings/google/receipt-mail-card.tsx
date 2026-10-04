// money-hub patch: Settings, Google, Receipt emails (owner, 2026-10-04: "upgrade the receipts feature to auto find
// details from gmail", then "filters and keywords config must be visible for users to edit, eg. Amazon and tiktok
// can be saved as template but when user click on the gear button next to them they should be able to see the
// config and modify as they need to"). The money-hub service (/api/money-hub/receipt-mail, lib/receiptMail.js)
// looks in the linked Gmail for the store's receipt of each recent card charge; the gear opens every filter
// and keyword it uses (the built-in ones are templates: Amazon and TikTok Shop are the first two stores it
// skips), each editable, with Reset to put the templates back.
import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Switch } from "@wealthfolio/ui/components/ui/switch";
import { StoresSkipped, type StoreRow, type StoreTemplate } from "./stores-skipped";

export const RECEIPT_MAIL = "/api/money-hub/receipt-mail";

interface SkipStore {
  id: string;
  name: string;
  words: string[];
  on: boolean;
  /** The template this row was copied from (the row's own edits never change it). */
  templateId: string | null;
  icon: string | null;
}
interface ReceiptMailConfig {
  days: number;
  minAmount: number;
  minLines: number;
  mailBefore: number;
  mailAfter: number;
  skipWords: string[];
  skipSenders: string[];
  skipSubjects: string[];
  skipStores: SkipStore[];
}
export interface ReceiptMailStatus {
  on: boolean;
  busy: boolean;
  ready: boolean;
  mailboxId: string | null;
  mailboxes: { id: string; email: string }[];
  found: number;
  toReview: number;
  /** The owner saved their own filters over the templates. */
  custom: boolean;
  config: ReceiptMailConfig;
  defaults: ReceiptMailConfig;
  /** A scan of older charges (up to 2 years): how far it got. */
  backfill: {
    days: number;
    status: "running" | "done" | "stopped" | "error" | "interrupted";
    total: number | null;
    done: number;
    found: number;
    remaining: number | null;
    error: string | null;
  } | null;
  /** Built in (read only) and the owner's own, kept apart from the filters. */
  templates: { builtIn: StoreTemplate[]; mine: StoreTemplate[] };
  last: {
    at: string;
    looked: number;
    read: number;
    asked: number;
    found: number;
    errors: string[];
  } | null;
}

/** What the boxes hold: numbers and word lists as text, so a half-typed value is not rewritten under the cursor. */
interface Draft {
  days: string;
  minAmount: string;
  minLines: string;
  mailBefore: string;
  mailAfter: string;
  skipWords: string;
  skipSenders: string;
  skipSubjects: string;
  skipStores: StoreRow[];
}

const toDraft = (c: ReceiptMailConfig): Draft => ({
  days: String(c.days),
  minAmount: String(c.minAmount),
  minLines: String(c.minLines),
  mailBefore: String(c.mailBefore),
  mailAfter: String(c.mailAfter),
  skipWords: c.skipWords.join(", "),
  skipSenders: c.skipSenders.join(", "),
  skipSubjects: c.skipSubjects.join(", "),
  skipStores: c.skipStores.map((s) => ({
    id: s.id,
    name: s.name,
    words: s.words.join(", "),
    on: s.on,
    templateId: s.templateId ?? null,
    icon: s.icon ?? null,
  })),
});

async function call<T>(method: string, body?: unknown, path = ""): Promise<T> {
  const res = await fetch(`${RECEIPT_MAIL}${path}`, {
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

const btn =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50";
const field =
  "h-8 rounded-md border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none disabled:opacity-50";

const when = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString()
    ? `today ${time}`
    : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
};

function Pill({ tone, text }: { tone: "ok" | "warn" | "off"; text: string }) {
  const c =
    tone === "warn"
      ? "bg-warning/15 text-warning"
      : tone === "ok"
        ? "bg-success/15 text-success"
        : "bg-muted text-muted-foreground";
  const d = tone === "warn" ? "bg-warning" : tone === "ok" ? "bg-success" : "bg-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${c}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${d}`} />
      {text}
    </span>
  );
}

/** One label and its box(es), the label on top on a phone and beside the box from `sm` up. */
export function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[5.75rem_minmax(0,1fr)] items-center gap-2 py-1.5 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-3">
      <div className="min-w-0">
        <div className="text-foreground">{label}</div>
        {hint ? (
          <div className="text-muted-foreground hidden text-[11px] leading-snug sm:block">
            {hint}
          </div>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-muted-foreground pt-1 text-[11px] font-semibold uppercase tracking-[0.08em]">
        {title}
      </div>
      <div className="divide-y">{children}</div>
    </div>
  );
}

/**
 * Scan older charges (owner, 10-04: "only 2 receipts was found for the past 2 years??": the usual look is 30 days). One
 * scan, up to 2 years, in the background and gently on Gmail; the progress is shown here and it can be stopped. What
 * it finds goes to Receipts, To review, without a bell for each.
 */
function ScanOlder({
  rm,
  busy,
  run,
  setRm,
}: {
  rm: ReceiptMailStatus;
  busy: string | null;
  run: Run;
  setRm: (s: ReceiptMailStatus) => void;
}) {
  const [days, setDays] = useState("730");
  const b = rm.backfill;
  const running = b?.status === "running";
  const shown = b ? Math.min(b.done, b.total ?? b.done) : 0;
  const text = !b
    ? null
    : b.status === "running"
      ? `Looked at ${b.done} of ${b.total ?? "…"} charges · ${b.found} found`
      : b.status === "done"
        ? `Done. Looked at ${b.done} charges and found ${b.found} ${b.found === 1 ? "receipt" : "receipts"}.`
        : b.status === "stopped"
          ? `Stopped after ${b.done} of ${b.total ?? "…"} charges, ${b.found} found. Scan again to carry on.`
          : b.status === "interrupted"
            ? `Stopped when the app restarted, after ${b.done} of ${b.total ?? "…"} charges. Scan again to carry on.`
            : `Stopped: ${b.error ?? "something went wrong"}`;
  return (
    <Group title="Scan older charges">
      <Row label="Go back" hint="One scan, in the background.">
        <span className="inline-flex flex-wrap items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={30}
            max={730}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className={`${field} w-20`}
            aria-label="Days to scan back"
            disabled={running}
          />
          <span className="text-muted-foreground">days</span>
          {running ? (
            <button
              type="button"
              className={`${btn} h-8`}
              disabled={!!busy}
              onClick={() =>
                run(
                  "receipt-scan-stop",
                  () => call<ReceiptMailStatus>("POST", undefined, "/backfill/stop"),
                  setRm,
                  "Stopping after this round.",
                )
              }
            >
              <Icons.Close className="size-3.5" /> Stop
            </button>
          ) : (
            <button
              type="button"
              className={`${btn} !border-primary/50 !text-primary h-8`}
              disabled={!!busy || !rm.on}
              onClick={() =>
                run(
                  "receipt-scan",
                  () => call<ReceiptMailStatus>("POST", { days: Number(days) || 730 }, "/backfill"),
                  setRm,
                  "Scanning in the background. You can leave this page.",
                )
              }
            >
              {busy === "receipt-scan" ? (
                <Icons.Spinner className="size-3.5 animate-spin" />
              ) : (
                <Icons.Search className="size-3.5" />
              )}{" "}
              Scan older charges
            </button>
          )}
        </span>
      </Row>
      {text ? (
        <div className="space-y-1.5 py-1.5 text-[11px]">
          <p className={b?.status === "error" ? "text-warning" : "text-muted-foreground"}>{text}</p>
          {running && b?.total ? (
            <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-all"
                style={{ width: `${Math.round((shown / b.total) * 100)}%` }}
              />
            </div>
          ) : null}
          {b && b.found > 0 && b.status !== "running" ? (
            <p className="text-muted-foreground">
              They are on{" "}
              <Link
                to="/spending/receipts"
                className="text-foreground underline-offset-4 hover:underline"
              >
                Receipts
              </Link>
              , waiting for your Looks good.
            </p>
          ) : null}
        </div>
      ) : null}
    </Group>
  );
}

/** Every filter and keyword the finder uses, editable. Save sends them; Reset puts the templates back. */
function ConfigPanel({
  rm,
  busy,
  run,
  setRm,
}: {
  rm: ReceiptMailStatus;
  busy: string | null;
  run: Run;
  setRm: (s: ReceiptMailStatus) => void;
}) {
  // Keyed by what is saved, so the status refreshing while a check runs never rewrites what is being typed.
  const savedKey = JSON.stringify(rm.config);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const saved = useMemo(() => toDraft(rm.config), [savedKey]);
  const [draft, setDraft] = useState<Draft>(saved);
  useEffect(() => setDraft(saved), [saved]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const isTemplate = JSON.stringify(saved) === JSON.stringify(toDraft(rm.defaults));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  // The owner's own templates are kept at once (not with Save): a template saved is a template made.
  const saveTemplates = async (list: StoreTemplate[]) => {
    let out: StoreTemplate[] | null = null;
    await run(
      "receipt-templates",
      async () => {
        const s = await call<ReceiptMailStatus>("PUT", { templates: list });
        out = s.templates.mine;
        return s;
      },
      setRm,
      "Templates saved.",
    );
    return out as StoreTemplate[] | null;
  };

  const save = () =>
    run(
      "receipt-config",
      () => call<ReceiptMailStatus>("PUT", { config: draft }),
      setRm,
      "Saved. Checking with these filters now.",
    );
  const reset = () =>
    run(
      "receipt-reset",
      () => call<ReceiptMailStatus>("PUT", { config: null }),
      setRm,
      "Back to the built-in filters.",
    );

  const num = (
    k: "days" | "minAmount" | "minLines" | "mailBefore" | "mailAfter",
    w = "w-16",
    step?: string,
  ) => (
    <input
      type="number"
      inputMode={step ? "decimal" : "numeric"}
      min={0}
      step={step}
      value={draft[k]}
      onChange={(e) => set(k, e.target.value)}
      className={`${field} ${w}`}
      aria-label={k}
    />
  );
  const words = (k: "skipWords" | "skipSenders" | "skipSubjects", placeholder: string) => (
    <textarea
      rows={k === "skipWords" ? 3 : 2}
      value={draft[k]}
      placeholder={placeholder}
      onChange={(e) => set(k, e.target.value)}
      className={`${field} h-auto w-full resize-y py-1.5 leading-snug`}
      aria-label={k}
    />
  );

  return (
    <div className="space-y-2 border-t px-4 py-3 text-xs">
      <ScanOlder rm={rm} busy={busy} run={run} setRm={setRm} />
      <Group title="Which charges">
        <Row label="Look back" hint="Charges this recent.">
          <span className="inline-flex items-center gap-1.5">
            {num("days")} <span className="text-muted-foreground">days</span>
          </span>
        </Row>
        <Row label="Skip under" hint="Not worth looking for.">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-muted-foreground">$</span>
            {num("minAmount", "w-20", "0.01")}
          </span>
        </Row>
        <Row label="Skip words" hint="Whole words in the charge's name. Separate with commas.">
          {words("skipWords", "payment, transfer, zelle")}
        </Row>
      </Group>

      <Group title="Stores skipped">
        <StoresSkipped
          rows={draft.skipStores}
          setRows={(rows) => set("skipStores", rows)}
          builtIn={rm.templates.builtIn}
          mine={rm.templates.mine}
          busy={!!busy}
          saveTemplates={saveTemplates}
        />
      </Group>

      <Group title="Which emails">
        <Row label="Dated" hint="Around the charge's day.">
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {num("mailBefore", "w-14")}{" "}
            <span className="text-muted-foreground">days before to</span> {num("mailAfter", "w-14")}{" "}
            <span className="text-muted-foreground">after</span>
          </span>
        </Row>
        <Row label="At least" hint="Lines with a price.">
          <span className="inline-flex items-center gap-1.5">
            {num("minLines", "w-14")} <span className="text-muted-foreground">lines</span>
          </span>
        </Row>
        <Row label="Skip senders" hint="Part of an address. Never read by the AI.">
          {words("skipSenders", "citi.com, chase.com")}
        </Row>
        <Row label="Skip subjects" hint="Words in the subject. Never read by the AI.">
          {words("skipSubjects", "statement, reminder")}
        </Row>
      </Group>

      <div className="flex flex-wrap items-center gap-2 border-t pt-2.5">
        <button
          type="button"
          className={`${btn} !border-primary/50 !text-primary h-8`}
          disabled={!!busy || !dirty}
          onClick={save}
        >
          {busy === "receipt-config" ? (
            <Icons.Spinner className="size-3.5 animate-spin" />
          ) : (
            <Icons.Check className="size-3.5" />
          )}{" "}
          Save
        </button>
        {dirty ? (
          <button
            type="button"
            className={`${btn} h-8`}
            disabled={!!busy}
            onClick={() => setDraft(saved)}
          >
            Undo changes
          </button>
        ) : null}
        <span className="flex-1" />
        {isTemplate && !dirty ? (
          <span className="text-muted-foreground text-[11px]">Built-in filters</span>
        ) : (
          <button
            type="button"
            className={`${btn} h-8`}
            disabled={!!busy}
            onClick={reset}
            title="Puts the built-in filters back. Your own templates stay."
          >
            {busy === "receipt-reset" ? (
              <Icons.Spinner className="size-3.5 animate-spin" />
            ) : (
              <Icons.Undo className="size-3.5" />
            )}{" "}
            Reset to built-in
          </button>
        )}
      </div>
    </div>
  );
}

type Run = <T>(
  what: string,
  fn: () => Promise<T>,
  take: (v: T) => void,
  ok?: string,
) => Promise<void>;

/** The card: on or off, which Google account, what was found, and the gear that opens the filters. */
export function ReceiptMailCard({
  rm,
  setRm,
  busy,
  run,
  Logo,
  extra = null,
}: {
  rm: ReceiptMailStatus;
  setRm: (s: ReceiptMailStatus) => void;
  busy: string | null;
  run: Run;
  Logo: (p: { children?: ReactNode }) => ReactElement;
  /** More rows of the card (owner, 10-04: Amazon orders on the Receipts page lives here, not under Amazon orders). */
  extra?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const errors = rm.last?.errors?.length ?? 0;
  // A check can take minutes (the AI reads each email), so it runs in the background: look again until it is done.
  useEffect(() => {
    if (!rm.busy && rm.backfill?.status !== "running") return;
    const t = setInterval(
      () =>
        call<ReceiptMailStatus>("GET")
          .then(setRm)
          .catch(() => {}),
      3000,
    );
    return () => clearInterval(t);
  }, [rm.busy, rm.backfill?.status, setRm]);
  return (
    <div className="bg-card rounded-xl border">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Logo>
          <Icons.Receipt className="text-primary size-5" />
        </Logo>
        <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-0">
          <div className="truncate text-sm font-semibold">Receipt emails</div>
          <div className="text-muted-foreground truncate text-xs">
            {rm.on
              ? [
                  rm.found ? `${rm.found} found` : "None found yet",
                  rm.toReview ? `${rm.toReview} to review` : null,
                  rm.last?.at && `checked ${when(rm.last.at)}`,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Off"}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {rm.on ? (
            <Pill tone={errors ? "warn" : "ok"} text={errors ? "Needs a look" : "Reading"} />
          ) : (
            <Pill tone="off" text="Off" />
          )}
          <button
            type="button"
            className={`${btn} h-8 px-2 ${open ? "!border-primary/50 !text-primary" : ""}`}
            aria-label="Receipt email filters"
            aria-expanded={open}
            title="Filters and keywords"
            onClick={() => setOpen((o) => !o)}
          >
            <Icons.Settings className="size-4" />
          </button>
          <Switch
            checked={rm.on}
            disabled={!!busy || !rm.mailboxes.length}
            aria-label="Find receipts in Gmail"
            onCheckedChange={(on) =>
              run(
                "receipt-mail-on",
                () => call<ReceiptMailStatus>("PUT", { on }),
                setRm,
                on ? "On. Looking for your receipts now." : undefined,
              )
            }
          />
        </div>
      </div>
      <div className="space-y-2.5 border-t px-4 py-3 text-xs">
        {rm.on ? (
          <label className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Read from</span>
            <select
              value={rm.mailboxId ?? ""}
              disabled={!!busy || !rm.mailboxes.length}
              className={field}
              onChange={(e) =>
                run(
                  "receipt-mail-box",
                  () => call<ReceiptMailStatus>("PUT", { mailboxId: e.target.value || null }),
                  setRm,
                  "Saved. Looking in that account now.",
                )
              }
            >
              <option value="">Every linked account</option>
              {rm.mailboxes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.email}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground">
            Finds the store&apos;s emailed receipt for a card charge and files its lines. You check
            each on{" "}
            <Link
              to="/spending/receipts"
              className="text-foreground underline-offset-4 hover:underline"
            >
              Receipts
            </Link>
            .
          </span>
          {rm.on ? (
            <button
              type="button"
              className={`${btn} h-7`}
              disabled={!!busy || rm.busy}
              onClick={() =>
                run(
                  "receipt-mail-run",
                  () => call<ReceiptMailStatus>("POST", undefined, "/run"),
                  setRm,
                  "Checking. It can take a few minutes.",
                )
              }
            >
              {busy === "receipt-mail-run" || rm.busy ? (
                <Icons.Spinner className="size-3.5 animate-spin" />
              ) : (
                <Icons.RefreshCw className="size-3.5" />
              )}{" "}
              Check now
            </button>
          ) : null}
        </div>
        {!rm.ready ? <p className="text-warning">The AI is not set up on the server yet.</p> : null}
        {errors ? <p className="text-warning">{rm.last?.errors.join(" · ")}</p> : null}
      </div>
      {extra}
      {open ? <ConfigPanel rm={rm} busy={busy} run={run} setRm={setRm} /> : null}
    </div>
  );
}
