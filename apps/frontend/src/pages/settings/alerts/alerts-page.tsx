// money-hub patch: Settings, Connections, Alerts. Where the money app's alerts go (owner, 2026-10-01:
// "where is ntfy config in the settings page?"): Discord and the phone through ntfy. Every alert goes
// to every place set up here, the same message. The money-hub service keeps it
// (/api/money-hub/alerts, server/drive-backup/lib/alerts.js); secrets never come back to the page.
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@wealthfolio/ui/components/ui/checkbox";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { Switch } from "@wealthfolio/ui/components/ui/switch";
import {
  ALERT_STEPS,
  pendingChangesApi,
  setPendingChanges,
  usePendingChanges,
  type PendingAlertKind,
  type PendingAlerts,
  type PendingChangesView,
} from "@/features/spending/lib/pending-changes";
import {
  ALERT_LABELS,
  SUBSCRIPTIONS_KEY,
  subscriptionsApi,
  useSubscriptions,
  type AlertKind,
} from "@/features/spending/lib/subscriptions";
import { RETURN_ALERT_LABELS, RETURNS_KEY, returnsApi, useReturns, type ReturnAlertKind } from "@/features/spending/lib/returns";
import { BILL_DAYS, FREE_CASH_ALERT_LABELS, FREE_CASH_KEY, freeCashApi, useFreeCash, type FreeCashAlertKind } from "@/features/spending/lib/free-cash";
import { TAX_ALERT_LABELS, taxesApi, taxesKey, useTaxes, type TaxAlertKind } from "@/features/taxes/lib/taxes";
import {
  BIG_ALERT_LABELS,
  BUDGET_ALERT_LABELS,
  CARD_ALERT_LABELS,
  DUE_STEPS,
  LOAN_ALERT_LABELS,
  RECEIPT_ALERT_LABELS,
  RENEW_STEPS,
  CONNECTION_ALERT_LABELS,
  MONEY_ALERTS_KEY,
  NEAR_STEPS,
  RECAP_ALERT_LABELS,
  moneyAlertsApi,
  useMoneyAlerts,
  type BigAlertKind,
  type BudgetAlertKind,
  type CardAlertKind,
  type LoanAlertKind,
  type ReceiptAlertKind,
  type ConnectionAlertKind,
  type MoneyAlertGroup,
  type RecapAlertKind,
} from "@/features/spending/lib/money-alerts";
import { cn } from "@/lib/utils";
import { SettingsHeader } from "../settings-header";

const BASE = "/api/money-hub/alerts";

interface AlertsStatus {
  discord: { on: boolean; shown: string | null };
  ntfy: { on: boolean; server: string; topic: string; hasToken: boolean; priority: number };
  last: { at: string; title: string; discord: boolean; ntfy: boolean } | null;
  went?: { discord: boolean; ntfy: boolean };
}
interface NtfyInput {
  server: string;
  topic: string;
  token?: string;
  priority: number;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `The money app helper said ${res.status}`);
  return data as T;
}
const api = {
  status: () => call<AlertsStatus>("GET", ""),
  update: (body: { discordWebhook?: string | null; ntfy?: NtfyInput | null }) => call<AlertsStatus>("PUT", "", body),
  test: (only?: "discord" | "ntfy") => call<AlertsStatus>("POST", "/test", only ? { only } : {}),
  /** A sample of the backup failure alert. */
  testBackup: () => call<AlertsStatus>("POST", "/test/backup"),
};

type Went = { discord: boolean; ntfy: boolean } | undefined;
const sentTo = (went: Went, sample?: string) => {
  const where = [went?.discord && "Discord", went?.ntfy && "your phone"].filter(Boolean).join(" and ");
  return `Sample sent to ${where}${sample ? `, using ${sample}` : ""}.`;
};

const PRIORITIES: { value: number; label: string }[] = [
  { value: 1, label: "Lowest: no sound" },
  { value: 2, label: "Low" },
  { value: 3, label: "Normal" },
  { value: 4, label: "High: rings and pops up" },
  { value: 5, label: "Urgent" },
];

// A topic on the public server is readable by anyone who knows its name, so the suggested one is
// long and random (the same Make one as WheelTradr's ntfy settings).
const randomTopic = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return "money-" + Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 18);
};

const when = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const today = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return today ? `today ${time}` : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
};

// Same pieces as the WheelTradr and Banks pages: green = set up, grey = not.
function StatusPill({ on, text }: { on: boolean; text: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${on ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-success" : "bg-muted-foreground"}`} />
      {text}
    </span>
  );
}
function SectionTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <h3 className="text-muted-foreground whitespace-nowrap text-xs font-semibold uppercase tracking-[0.08em]">{title}</h3>
      <span className="text-muted-foreground text-xs">{hint}</span>
    </div>
  );
}
/**
 * One feature's alerts, laid out like Pending vs posted (owner, 10-01: "put them all in settings
 * page"): its name (a link to its page), one switch for the whole group, and when on, each kind
 * with its own tick and a Test that sends a real-looking sample the way the real one goes.
 */
function GroupAlerts<K extends string>({
  icon,
  title,
  to,
  text,
  on,
  kinds,
  labels,
  busyKey,
  busy,
  onSwitch,
  onTest,
  extra,
}: {
  icon: ReactNode;
  title: string;
  to: string;
  text: string;
  on: boolean;
  kinds: Record<K, boolean>;
  labels: Record<K, { title: string; text: string }>;
  busyKey: string;
  busy: string | null;
  onSwitch: (patch: Partial<Record<K | "on", boolean>>) => void;
  onTest: (kind: K) => void;
  /** A setting of the feature's own, above its kinds (Free cash: how far ahead bills count). */
  extra?: ReactNode;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        {icon}
        <Link to={to} className="min-w-0 flex-1 truncate text-sm font-medium underline-offset-4 hover:underline">
          {title}
        </Link>
        <Switch aria-label={`${title} alerts`} checked={on} disabled={!!busy} onCheckedChange={(v) => onSwitch({ on: v } as Partial<Record<K | "on", boolean>>)} />
      </div>
      <p className="text-muted-foreground mt-0.5 pl-7 text-xs">{text}</p>
      {on ? (
        <div className="mt-3 space-y-2.5 pl-7 text-xs">
          {extra}
          {(Object.keys(labels) as K[]).map((k) => (
            <div key={k} className="flex items-start gap-2">
              <Checkbox
                id={`${busyKey}-${k}`}
                checked={kinds[k] !== false}
                disabled={!!busy}
                onCheckedChange={(v) => onSwitch({ [k]: v === true } as Partial<Record<K | "on", boolean>>)}
                className="mt-0.5"
              />
              <label htmlFor={`${busyKey}-${k}`} className="min-w-0 flex-1 cursor-pointer">
                <span className="block">{labels[k].title}</span>
                {/* No full stop, like the Pending vs posted lines above. */}
                <span className="text-muted-foreground block text-[11px]">{labels[k].text.replace(/\.$/, "")}</span>
              </label>
              {kinds[k] !== false ? (
                <button type="button" className="text-primary shrink-0 underline-offset-4 hover:underline disabled:opacity-50" disabled={!!busy} onClick={() => onTest(k)}>
                  {busy === `${busyKey}-test-${k}` ? "Sending" : "Test"}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** An amount saved on Enter or on leaving the box (Free cash's cushion, owner 10-01; the big money
 *  amounts, 10-02). Empty = 0 where that is allowed (`min` 0), else the old amount comes back. */
function AmountField({
  value,
  disabled,
  onSave,
  before,
  after,
  label: aria,
  min = 0,
  beforeClass,
}: {
  value: number;
  disabled: boolean;
  onSave: (amount: number) => void;
  before: string;
  after?: string;
  label: string;
  min?: number;
  /** A width for the words before the box, so boxes on the lines below each other line up. */
  beforeClass?: string;
}) {
  const shown = (v: number) => (v > 0 ? String(v) : "");
  const [text, setText] = useState(shown(value));
  useEffect(() => setText(shown(value)), [value]);
  const commit = () => {
    const n = text.trim() === "" ? 0 : Number(text.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || n < min) return setText(shown(value));
    if (Math.round(n * 100) !== Math.round(value * 100)) onSave(Math.round(n * 100) / 100);
  };
  return (
    <label className="flex flex-wrap items-center gap-2">
      <span className={cn("text-muted-foreground", beforeClass)}>{before}</span>
      <span className="relative">
        <span className="text-muted-foreground pointer-events-none absolute left-2 top-1/2 -translate-y-1/2">$</span>
        <input
          inputMode="decimal"
          aria-label={aria}
          value={text}
          placeholder="0"
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          className="h-8 w-28 rounded-md border bg-background pl-5 pr-2 text-xs tabular-nums text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
        />
      </span>
      {after ? <span className="text-muted-foreground">{after}</span> : null}
    </label>
  );
}

const btn = "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50";
const cta = "!border-primary/50 !text-primary";
const field = "h-9 w-full min-w-0 rounded-md border bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none disabled:opacity-50";
const label = "text-muted-foreground text-[11px] font-medium";

type Note = { tone: "ok" | "bad"; text: string };

export default function AlertsSettingsPage() {
  const [status, setStatus] = useState<AlertsStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [hook, setHook] = useState("");
  const [editHook, setEditHook] = useState(false);
  const [server, setServer] = useState("https://ntfy.sh");
  const [topic, setTopic] = useState("");
  const [token, setToken] = useState("");
  const [priority, setPriority] = useState(3);
  const [showMore, setShowMore] = useState(false);

  const take = (s: AlertsStatus) => {
    setStatus(s);
    setServer(s.ntfy.server);
    setTopic(s.ntfy.topic);
    setPriority(s.ntfy.priority);
    setToken("");
  };
  useEffect(() => {
    api.status().then(take).catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  const run = async (what: string, fn: () => Promise<AlertsStatus>, ok?: (s: AlertsStatus) => string) => {
    setBusy(what);
    setNote(null);
    try {
      const s = await fn();
      take(s);
      if (ok) setNote({ tone: "ok", text: ok(s) });
      return true;
    } catch (e) {
      setNote({ tone: "bad", text: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      setBusy(null);
    }
  };

  // Pending vs posted (money-hub lib/pendingChanges.js): its switch, step and test live here.
  const qc = useQueryClient();
  const { data: pending } = usePendingChanges();
  const pendingAlerts = pending?.alerts;
  const runPending = async (what: string, fn: () => Promise<PendingChangesView>, ok?: (v: PendingChangesView) => string) => {
    setBusy(what);
    setNote(null);
    try {
      const v = await fn();
      setPendingChanges(qc, v);
      if (ok) setNote({ tone: "ok", text: ok(v) });
    } catch (e) {
      setNote({ tone: "bad", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };
  const setPending = (patch: Partial<PendingAlerts>) => runPending("pending-set", () => pendingChangesApi.setAlerts(patch));
  const testPending = (kind: PendingAlertKind) =>
    runPending(`test-pending-${kind}`, () => pendingChangesApi.test(kind), (v) => {
      const where = [v.went?.discord && "Discord", v.went?.ntfy && "your phone"].filter(Boolean).join(" and ");
      return `Sample sent to ${where}, using ${v.sample}.`;
    });

  // Subscriptions & bills and Returns (money-hub lib/subscriptions.js, lib/returns.js): their switches
  // and tests live here too; each page points back to this one.
  const { data: subs } = useSubscriptions();
  const { data: returns } = useReturns();
  const { data: freeCash } = useFreeCash();
  const { data: taxes } = useTaxes(null);
  const runGroup = async <V,>(what: string, key: readonly unknown[], fn: () => Promise<V>, ok?: (v: V) => string) => {
    setBusy(what);
    setNote(null);
    try {
      const v = await fn();
      qc.setQueryData(key, v);
      if (ok) {
        setNote({ tone: "ok", text: ok(v) });
        api.status().then(take).catch(() => {});        // "Last alert" below
      }
    } catch (e) {
      setNote({ tone: "bad", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };
  const testBackup = () => run("test-backup", api.testBackup, (s) => sentTo(s.went));

  // Big money moves, budget, bank connections, weekly recap (money-hub lib/moneyAlerts.js): one view.
  const { data: more } = useMoneyAlerts();
  const setMore = (group: MoneyAlertGroup, patch: Record<string, boolean | number>) =>
    runGroup(`${group}-set`, MONEY_ALERTS_KEY, () => moneyAlertsApi.set(group, patch));
  const testMore = (group: MoneyAlertGroup, kind: string) =>
    runGroup(`${group}-test-${kind}`, MONEY_ALERTS_KEY, () => moneyAlertsApi.test(group, kind), (v) => sentTo(v.went, v.sample));

  const ntfyOn = !!status?.ntfy.on;
  const ntfyDirty = !!status && (server !== status.ntfy.server || topic !== status.ntfy.topic || priority !== status.ntfy.priority || token !== "");
  const saveNtfy = () =>
    run("ntfy", () => api.update({ ntfy: { server: server.trim(), topic: topic.trim(), priority, ...(token ? { token } : {}) } }), () => "Saved. Press Send a test to check your phone.");

  return (
    <div className="space-y-6">
      <SettingsHeader heading="Alerts" text="Where the money app tells you things: the bell in the app, Discord, and your phone through ntfy. Every alert goes to each place set up here." />
      <Separator />

      {loadError && <p className="text-destructive text-sm">{loadError}</p>}

      <section className="space-y-3">
        <SectionTitle title="Discord" hint="A channel's webhook" />
        <div className="bg-card rounded-xl border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
                <Icons.MessageSquare className="text-primary size-5" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold">Discord</div>
                <div className="text-muted-foreground truncate text-xs">
                  {status?.discord.on ? `Webhook ${status.discord.shown ?? ""}` : "Not set up"}
                </div>
              </div>
            </div>
            {status && <StatusPill on={status.discord.on} text={status.discord.on ? "Set up" : "Off"} />}
          </div>
          {status && (!status.discord.on || editHook) ? (
            <div className="mt-4 space-y-2">
              <p className="text-muted-foreground text-xs leading-relaxed">
                In Discord: the channel's settings, Integrations, Webhooks, New Webhook, Copy Webhook URL. Paste it here.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input type="password" value={hook} onChange={(e) => setHook(e.target.value)} autoComplete="off" spellCheck={false}
                  placeholder="https://discord.com/api/webhooks/..." className={`${field} flex-1 font-mono`} />
                <button type="button" className={`${btn} ${cta}`} disabled={!hook.trim() || !!busy}
                  onClick={async () => { if (await run("discord", () => api.update({ discordWebhook: hook.trim() }), () => "Discord saved.")) { setHook(""); setEditHook(false); } }}>
                  {busy === "discord" ? <Icons.Spinner className="size-3.5 animate-spin" /> : <Icons.Check className="size-3.5" />}
                  Save
                </button>
                {editHook && <button type="button" className={btn} onClick={() => { setEditHook(false); setHook(""); }}>Cancel</button>}
              </div>
            </div>
          ) : status?.discord.on ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
              <button type="button" className={`${btn} ${cta}`} disabled={!!busy}
                onClick={() => run("test-discord", () => api.test("discord"), () => "Test sent to Discord. Check the channel.")}>
                {busy === "test-discord" ? <Icons.Spinner className="size-3.5 animate-spin" /> : <Icons.Bell className="size-3.5" />}
                Send a test
              </button>
              <button type="button" className={btn} disabled={!!busy} onClick={() => setEditHook(true)}>
                <Icons.Pencil className="size-3.5" /> Change
              </button>
              <button type="button" className={btn} disabled={!!busy}
                onClick={() => run("discord-off", () => api.update({ discordWebhook: null }), () => "Discord turned off.")}>
                <Icons.Unlink className="size-3.5" /> Turn off
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle title="Phone (ntfy)" hint="Free app for iPhone and Android" />
        <div className="bg-card rounded-xl border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {/* The ntfy app's own icon (same file as WheelTradr's ntfy card), served from public/ */}
              <img src="/icons/ntfy.png" width={40} height={40} alt="" aria-hidden="true" className="size-10 shrink-0 rounded-lg" />
              <div className="min-w-0">
                <div className="text-sm font-semibold">ntfy</div>
                <div className="text-muted-foreground truncate text-xs">
                  {ntfyOn ? `Topic ${status?.ntfy.topic} on ${status?.ntfy.server.replace(/^https:\/\//, "")}` : "Not set up"}
                </div>
              </div>
            </div>
            {status && <StatusPill on={ntfyOn} text={ntfyOn ? "Set up" : "Off"} />}
          </div>
          {status && (
            <div className="mt-4 space-y-3">
              {!ntfyOn && (
                <ol className="text-muted-foreground list-inside list-decimal space-y-1 text-xs leading-relaxed">
                  <li>Install ntfy from the App Store or Google Play.</li>
                  <li>Press Make one below, then Save and turn on.</li>
                  <li>In the ntfy app press +, type the same topic name, and subscribe.</li>
                </ol>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className={label}>Topic</span>
                  <span className="flex gap-2">
                    <input value={topic} maxLength={64} autoComplete="off" spellCheck={false} className={`${field} font-mono`} placeholder="money-your-secret-topic"
                      onChange={(e) => setTopic(e.target.value.replace(/[^A-Za-z0-9_-]/g, ""))} />
                    <button type="button" className={btn} disabled={!!busy} onClick={() => setTopic(randomTopic())}>
                      <Icons.Wand2 className="size-3.5" /> Make one
                    </button>
                  </span>
                </label>
                <label className="space-y-1">
                  <span className={label}>How loud</span>
                  <select value={priority} onChange={(e) => setPriority(Number(e.target.value))} className={field}>
                    {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </label>
              </div>
              <p className="text-muted-foreground text-[11px]">
                Anyone who knows the topic can read it. Keep it long and random, like a password. Your WheelTradr topic works too: one phone then gets both.
              </p>
              {showMore && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className={label}>Server</span>
                    <input value={server} onChange={(e) => setServer(e.target.value)} autoComplete="off" spellCheck={false} className={field} placeholder="https://ntfy.sh" />
                  </label>
                  <label className="space-y-1">
                    <span className={label}>Access token (optional)</span>
                    <input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false}
                      className={`${field} font-mono`} placeholder={status.ntfy.hasToken ? "Saved. Type a new one to replace it." : "tk_..."} />
                  </label>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={() => setShowMore((v) => !v)}>
                    {showMore ? "Hide server and token" : "Own server or token"}
                  </button>
                  {ntfyOn && (
                    <a href={`${status.ntfy.server.replace(/\/+$/, "")}/${status.ntfy.topic}`} target="_blank" rel="noopener noreferrer"
                      className="text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline">
                      Open topic <Icons.ExternalLink className="size-3" />
                    </a>
                  )}
                  {ntfyOn && (
                    <button type="button" className="text-destructive underline-offset-4 hover:underline" disabled={!!busy}
                      onClick={() => run("ntfy-off", () => api.update({ ntfy: null }), () => "Phone alerts turned off.")}>
                      Turn off
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {ntfyOn && (
                    <button type="button" className={`${btn} ${ntfyDirty ? "" : cta}`} disabled={!!busy || ntfyDirty}
                      title={ntfyDirty ? "Save first, then test" : undefined}
                      onClick={() => run("test-ntfy", () => api.test("ntfy"), () => "Test sent. It should be on your phone now.")}>
                      {busy === "test-ntfy" ? <Icons.Spinner className="size-3.5 animate-spin" /> : <Icons.Bell className="size-3.5" />}
                      Send a test
                    </button>
                  )}
                  <button type="button" className={`${btn} ${ntfyOn && !ntfyDirty ? "" : cta}`} disabled={!topic.trim() || !server.trim() || !!busy || (ntfyOn && !ntfyDirty)} onClick={saveNtfy}>
                    {busy === "ntfy" ? <Icons.Spinner className="size-3.5 animate-spin" /> : <Icons.Check className="size-3.5" />}
                    {ntfyOn ? "Save changes" : "Save and turn on"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle title="What sends alerts" hint="Each one switches its own on and off" />
        <div className="bg-card divide-y rounded-xl border">
          {pendingAlerts ? (
            <div className="px-4 py-3">
              <div className="flex items-center gap-3">
                <Icons.Receipt className="text-muted-foreground size-4 shrink-0" />
                <Link to="/spending/pending-changes" className="min-w-0 flex-1 truncate text-sm font-medium underline-offset-4 hover:underline">
                  Pending vs posted
                </Link>
                <button type="button" className={`${btn} h-7`} disabled={!!busy} onClick={() => testPending("up")}>
                  {busy === "test-pending-up" ? <Icons.Spinner className="size-3.5 animate-spin" /> : null}
                  Test
                </button>
                <Switch
                  aria-label="Pending vs posted alerts"
                  checked={pendingAlerts.on}
                  disabled={!!busy}
                  onCheckedChange={(on) => setPending({ on })}
                />
              </div>
              <p className="text-muted-foreground mt-0.5 pl-7 text-xs">A card charge posts higher than it was pending: a tip, or a charge to check</p>
              {pendingAlerts.on ? (
                <div className="mt-3 space-y-2.5 pl-7 text-xs">
                  <label className="flex flex-wrap items-center gap-2">
                    <select
                      value={pendingAlerts.minDollars}
                      disabled={!!busy}
                      onChange={(e) => setPending({ minDollars: Number(e.target.value) })}
                      className="h-8 rounded-md border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
                    >
                      {[...new Set([...ALERT_STEPS, pendingAlerts.minDollars])].sort((a, b) => a - b).map((v) => (
                        <option key={v} value={v}>{v <= 0.01 ? "any amount" : `$${v} or more`}</option>
                      ))}
                    </select>
                    <span className="text-muted-foreground">above pending</span>
                  </label>
                  {([
                    ["lower", "down", "Also when it posts lower", "A gas or hotel hold that came in smaller"],
                    ["dropped", "dropped", "Also when a pending charge never posts", "A hold let go, or a cancelled charge"],
                  ] as const).map(([key, kind, title, hint]) => (
                    <div key={key} className="flex items-start gap-2">
                      <Checkbox
                        id={`pending-${key}`}
                        checked={pendingAlerts[key]}
                        disabled={!!busy}
                        onCheckedChange={(v) => setPending({ [key]: v === true })}
                        className="mt-0.5"
                      />
                      <label htmlFor={`pending-${key}`} className="min-w-0 flex-1 cursor-pointer">
                        <span className="block">{title}</span>
                        <span className="text-muted-foreground block text-[11px]">{hint}</span>
                      </label>
                      {pendingAlerts[key] ? (
                        <button type="button" className="text-primary shrink-0 underline-offset-4 hover:underline disabled:opacity-50" disabled={!!busy} onClick={() => testPending(kind)}>
                          {busy === `test-pending-${kind}` ? "Sending" : "Test"}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {subs ? (
            <GroupAlerts<AlertKind>
              icon={<Icons.RotateCcw className="text-muted-foreground size-4 shrink-0" />}
              title="Subscriptions & Bills"
              to="/spending/subscriptions"
              text="Charges that repeat: what changed, and a heads-up before a charge"
              on={subs.alerts.on !== false}
              kinds={subs.alerts}
              labels={ALERT_LABELS}
              busyKey="subs"
              busy={busy}
              onSwitch={(patch) => runGroup("subs-set", SUBSCRIPTIONS_KEY, () => subscriptionsApi.setAlerts(patch))}
              onTest={(k) => runGroup(`subs-test-${k}`, SUBSCRIPTIONS_KEY, () => subscriptionsApi.testAlert(k), (v) => sentTo(v.went, v.sample))}
            />
          ) : null}
          {returns ? (
            <GroupAlerts<ReturnAlertKind>
              icon={<Icons.Undo className="text-muted-foreground size-4 shrink-0" />}
              title="Returns"
              to="/spending/returns"
              text="Something you sent back, and the refund it is waiting for"
              on={returns.alerts.on !== false}
              kinds={returns.alerts}
              labels={RETURN_ALERT_LABELS}
              busyKey="returns"
              busy={busy}
              onSwitch={(patch) => runGroup("returns-set", RETURNS_KEY, () => returnsApi.setAlerts(patch))}
              onTest={(k) => runGroup(`returns-test-${k}`, RETURNS_KEY, () => returnsApi.testAlert(k), (v) => sentTo(v.went, v.sample))}
            />
          ) : null}
          {freeCash ? (
            <GroupAlerts<FreeCashAlertKind>
              icon={<Icons.Wallet className="text-muted-foreground size-4 shrink-0" />}
              title="Free cash vs cards"
              to="/dashboard?tab=spending"
              text="Your free cash against the cards and the bills coming up"
              on={freeCash.alerts.on !== false}
              kinds={freeCash.alerts}
              labels={FREE_CASH_ALERT_LABELS}
              busyKey="cash"
              busy={busy}
              onSwitch={(patch) => runGroup("cash-set", FREE_CASH_KEY, () => freeCashApi.setAlerts(patch))}
              onTest={(k) => runGroup(`cash-test-${k}`, FREE_CASH_KEY, () => freeCashApi.testAlert(k), (v) => sentTo(v.went, v.sample))}
              extra={
                <>
                <label className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">Count bills due in the next</span>
                  <select
                    value={freeCash.bills.days}
                    disabled={!!busy}
                    onChange={(e) => runGroup("cash-days", FREE_CASH_KEY, () => freeCashApi.setDays(Number(e.target.value)))}
                    className="h-8 rounded-md border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
                  >
                    {[...new Set([...BILL_DAYS, freeCash.bills.days])].sort((a, b) => a - b).map((d) => (
                      <option key={d} value={d}>{d} days</option>
                    ))}
                  </select>
                </label>
                <AmountField
                  label="Cushion"
                  before="Keep a cushion of"
                  after="on top of the cards and bills"
                  value={freeCash.totals.cushion ?? 0}
                  disabled={!!busy}
                  onSave={(amount) => runGroup("cash-cushion", FREE_CASH_KEY, () => freeCashApi.setCushion(amount))}
                />
                </>
              }
            />
          ) : null}
          {taxes ? (
            <GroupAlerts<TaxAlertKind>
              icon={<Icons.FileText className="text-muted-foreground size-4 shrink-0" />}
              title="Taxes"
              to="/taxes"
              text="The tax year's dates, and papers that have not come in"
              on={taxes.alerts.on !== false}
              kinds={taxes.alerts}
              labels={TAX_ALERT_LABELS}
              busyKey="taxes"
              busy={busy}
              onSwitch={(patch) => runGroup("taxes-set", taxesKey(null), () => taxesApi.setAlerts(patch))}
              onTest={(k) => runGroup(`taxes-test-${k}`, taxesKey(null), () => taxesApi.testAlert(k), (v) => sentTo(v.went, v.sample))}
            />
          ) : null}
          {more ? (
            <>
              <GroupAlerts<BigAlertKind>
                icon={<Icons.ArrowLeftRight className="text-muted-foreground size-4 shrink-0" />}
                title="Big money moves"
                to="/activities"
                text="Money in or out over an amount you pick"
                on={more.big.alerts.on !== false}
                kinds={more.big.alerts}
                labels={BIG_ALERT_LABELS}
                busyKey="big"
                busy={busy}
                onSwitch={(patch) => setMore("big", patch)}
                onTest={(k) => testMore("big", k)}
                extra={
                  <>
                    <AmountField label="Money out from" before="Money out from" beforeClass="w-24" value={more.big.outMin} min={1} disabled={!!busy}
                      onSave={(outMin) => setMore("big", { outMin })} />
                    <AmountField label="Money in from" before="Money in from" beforeClass="w-24" value={more.big.inMin} min={1} disabled={!!busy}
                      onSave={(inMin) => setMore("big", { inMin })} />
                  </>
                }
              />
              <GroupAlerts<BudgetAlertKind>
                icon={<Icons.PieChart className="text-muted-foreground size-4 shrink-0" />}
                title="Budget"
                to="/spending/budget"
                text="How much of the month's budget is spent, once each a month"
                on={more.budget.alerts.on !== false}
                kinds={more.budget.alerts}
                labels={BUDGET_ALERT_LABELS}
                busyKey="budget"
                busy={busy}
                onSwitch={(patch) => setMore("budget", patch)}
                onTest={(k) => testMore("budget", k)}
                extra={
                  <label className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground">Warn at</span>
                    <select
                      value={more.budget.nearPct}
                      disabled={!!busy}
                      onChange={(e) => setMore("budget", { nearPct: Number(e.target.value) })}
                      className="h-8 rounded-md border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
                    >
                      {[...new Set([...NEAR_STEPS, more.budget.nearPct])].sort((a, b) => a - b).map((p) => (
                        <option key={p} value={p}>{p}%</option>
                      ))}
                    </select>
                    <span className="text-muted-foreground">used</span>
                  </label>
                }
              />
              {more.cards ? (
                <GroupAlerts<CardAlertKind>
                  icon={<Icons.CreditCard className="text-muted-foreground size-4 shrink-0" />}
                  title="Credit cards"
                  to="/dashboard?tab=spending"
                  text="A card's payment due date, from the bank (Banks, Get card due dates)"
                  on={more.cards.alerts.on !== false}
                  kinds={more.cards.alerts}
                  labels={CARD_ALERT_LABELS}
                  busyKey="cards"
                  busy={busy}
                  onSwitch={(patch) => setMore("cards", patch)}
                  onTest={(k) => testMore("cards", k)}
                  extra={
                    <label className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">Remind</span>
                      <select
                        value={more.cards.daysBefore}
                        disabled={!!busy}
                        onChange={(e) => setMore("cards", { daysBefore: Number(e.target.value) })}
                        className="h-8 rounded-md border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
                      >
                        {[...new Set([...DUE_STEPS, more.cards.daysBefore])].sort((a, b) => a - b).map((d) => (
                          <option key={d} value={d}>{d === 1 ? "1 day" : `${d} days`}</option>
                        ))}
                      </select>
                      <span className="text-muted-foreground">before it is due</span>
                    </label>
                  }
                />
              ) : null}
              {more.loans ? (
                <GroupAlerts<LoanAlertKind>
                  icon={<Icons.RefreshCw className="text-muted-foreground size-4 shrink-0" />}
                  title="Loan renewals"
                  to="/holdings"
                  text="A loan's lines whose term ends soon, to renew with the bank (Holdings, the loan, Edit details, Lines)"
                  on={more.loans.alerts.on !== false}
                  kinds={more.loans.alerts}
                  labels={LOAN_ALERT_LABELS}
                  busyKey="loans"
                  busy={busy}
                  onSwitch={(patch) => setMore("loans", patch)}
                  onTest={(k) => testMore("loans", k)}
                  extra={
                    <label className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">Remind</span>
                      <select
                        value={more.loans.daysBefore}
                        disabled={!!busy}
                        onChange={(e) => setMore("loans", { daysBefore: Number(e.target.value) })}
                        className="h-8 rounded-md border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
                      >
                        {[...new Set([...RENEW_STEPS, more.loans.daysBefore])].sort((a, b) => a - b).map((d) => (
                          <option key={d} value={d}>{d === 1 ? "1 day" : `${d} days`}</option>
                        ))}
                      </select>
                      <span className="text-muted-foreground">before a line&rsquo;s term ends</span>
                    </label>
                  }
                />
              ) : null}
              {more.receipts ? (
                <GroupAlerts<ReceiptAlertKind>
                  icon={<Icons.ReceiptText className="text-muted-foreground size-4 shrink-0" />}
                  title="Receipts"
                  to="/spending/receipts"
                  text="A snapped receipt that waited for its card charge and has filed it, or a receipt found in Gmail"
                  on={more.receipts.alerts.on !== false}
                  kinds={more.receipts.alerts}
                  labels={RECEIPT_ALERT_LABELS}
                  busyKey="receipts"
                  busy={busy}
                  onSwitch={(patch) => setMore("receipts", patch)}
                  onTest={(k) => testMore("receipts", k)}
                />
              ) : null}
              <GroupAlerts<ConnectionAlertKind>
                icon={<Icons.Unlink className="text-muted-foreground size-4 shrink-0" />}
                title="Bank connections"
                to="/settings/banks"
                text="A bank or Gmail that stopped bringing transactions in"
                on={more.connections.alerts.on !== false}
                kinds={more.connections.alerts}
                labels={CONNECTION_ALERT_LABELS}
                busyKey="connections"
                busy={busy}
                onSwitch={(patch) => setMore("connections", patch)}
                onTest={(k) => testMore("connections", k)}
              />
              <GroupAlerts<RecapAlertKind>
                icon={<Icons.Calendar className="text-muted-foreground size-4 shrink-0" />}
                title="Weekly recap"
                to="/dashboard?tab=spending"
                text="Your week in one message"
                on={more.recap.alerts.on !== false}
                kinds={more.recap.alerts}
                labels={RECAP_ALERT_LABELS}
                busyKey="recap"
                busy={busy}
                onSwitch={(patch) => setMore("recap", patch)}
                onTest={(k) => testMore("recap", k)}
              />
            </>
          ) : null}
          <div className="px-4 py-3">
            <div className="flex items-center gap-3">
              <Icons.Download className="text-muted-foreground size-4 shrink-0" />
              <Link to="/settings/exports" className="min-w-0 flex-1 truncate text-sm font-medium underline-offset-4 hover:underline">
                Backups
              </Link>
              <button type="button" className={`${btn} h-7`} disabled={!!busy} onClick={testBackup}>
                {busy === "test-backup" ? <Icons.Spinner className="size-3.5 animate-spin" /> : null}
                Test
              </button>
            </div>
            <p className="text-muted-foreground mt-0.5 pl-7 text-xs">When a Google Drive backup fails. Always on.</p>
          </div>
        </div>
      </section>

      {status?.last && (
        <p className="text-muted-foreground text-xs">
          Last alert {when(status.last.at)}: {status.last.title} ({[status.last.discord && "Discord", status.last.ntfy && "phone"].filter(Boolean).join(" and ") || "not delivered"})
        </p>
      )}

      {note && <p className={`text-sm ${note.tone === "ok" ? "text-success" : "text-destructive"}`}>{note.text}</p>}
    </div>
  );
}
