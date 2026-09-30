// money-hub patch: Settings, Connections, WheelTradr. The owner's brokerage accounts
// from WheelTradr (read-only API key, made in WheelTradr: Settings, AI & Integrations,
// API keys) pulled into net worth. The work runs in the money-hub service at
// /api/money-hub/wheeltradr (server/drive-backup/lib/wheeltradr.js in the money-hub
// repo): each account switched on becomes an investment account here whose value is
// the account's value at every day's close, and today's live value, updated hourly.
import { useEffect, useState } from "react";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { Switch } from "@wealthfolio/ui/components/ui/switch";
import { SettingsHeader } from "../settings-header";

const BASE = "/api/money-hub/wheeltradr";

interface WtAccount {
  id: string; name: string; broker: string | null; netValue: number | null; inWheelTradr: boolean;
  include: boolean; wfAccountId: string | null; lastDate: string | null; days: number;
}
interface WtStatus {
  connected: boolean; keyShown: string | null; baseUrl: string; asOf: string | null; error: string | null; busy: boolean;
  lastSync: { at: string; ok: boolean; error?: string; accounts?: number; days?: number } | null;
  accounts: WtAccount[];
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
  status: () => call<WtStatus>("GET", "/status"),
  connect: (apiKey: string) => call<WtStatus>("PUT", "/key", { apiKey }),
  disconnect: () => call<WtStatus>("DELETE", "/key"),
  include: (id: string, include: boolean) => call<WtStatus>("PUT", `/accounts/${encodeURIComponent(id)}`, { include }),
  sync: () => call<WtStatus>("POST", "/sync", {}),
};

const BROKERS: Record<string, string> = {
  fidelity: "Fidelity", schwab: "Schwab", ibkr: "Interactive Brokers", tastytrade: "tastytrade", robinhood: "Robinhood",
  vanguard: "Vanguard", etrade: "E*TRADE", webull: "Webull", merrill: "Merrill", tradestation: "TradeStation",
  moomoo: "moomoo", sofi: "SoFi",
};
const usd = (n: number | null | undefined) =>
  n == null ? "" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const day = (ymd?: string | null) => {
  if (!ymd) return "";
  const d = new Date(`${ymd}T12:00:00`);
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(thisYear ? {} : { year: "numeric" }) });
};
const when = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const today = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return today ? `today ${time}` : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
};

// Same pieces as the Backups tab (drive-backup-tab.tsx): green = connected, amber only when it needs a look.
function StatusPill({ on, text, warn }: { on: boolean; text: string; warn?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${warn ? "bg-warning/15 text-warning" : on ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${warn ? "bg-warning" : on ? "bg-success" : "bg-muted-foreground"}`} />
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
const btn = "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50";
const cta = "!border-primary/50 !text-primary";
const field = "h-9 rounded-md border bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none disabled:opacity-50";

type Note = { tone: "ok" | "bad"; text: string };

export default function WheelTradrSettingsPage() {
  const [status, setStatus] = useState<WtStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<null | "connect" | "disconnect" | "sync" | string>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  useEffect(() => {
    api.status().then(setStatus).catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  const run = async (what: string, fn: () => Promise<WtStatus>, ok?: string) => {
    setBusy(what);
    setNote(null);
    try {
      setStatus(await fn());
      if (ok) setNote({ tone: "ok", text: ok });
    } catch (e) {
      setNote({ tone: "bad", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const connected = !!status?.connected;
  const on = status?.accounts.filter((a) => a.include) ?? [];
  const last = status?.lastSync;

  return (
    <div className="space-y-6">
      <SettingsHeader heading="WheelTradr" text="Your brokerage accounts from WheelTradr, in your net worth. Read only: nothing here can trade." />
      <Separator />

      {loadError && <p className="text-destructive text-sm">{loadError}</p>}

      <section className="space-y-3">
        <SectionTitle title="1. Connect" hint="With a key made in WheelTradr" />
        <div className="bg-card rounded-xl border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
                <Icons.TrendingUp className="text-primary size-5" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold">WheelTradr</div>
                <div className="text-muted-foreground truncate text-xs">
                  {connected ? `Key ${status?.keyShown ?? ""}` : "Not connected"}
                </div>
              </div>
            </div>
            {status && (status.error
              ? <StatusPill on={false} warn text="Needs a look" />
              : <StatusPill on={connected} text={connected ? "Connected" : "Not connected"} />)}
          </div>

          {status && !connected && (
            <div className="mt-4 space-y-2">
              <p className="text-muted-foreground text-xs leading-relaxed">
                In WheelTradr, open Settings, AI &amp; Integrations, API keys, make a key named Money app and copy it. Paste it here.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false}
                  placeholder="wt_..." className={`${field} min-w-0 flex-1 font-mono`}
                  onKeyDown={(e) => { if (e.key === "Enter" && key.trim() && !busy) void run("connect", () => api.connect(key.trim()), "Connected. Now choose which accounts count in your net worth."); }} />
                <button type="button" className={`${btn} ${cta}`} disabled={!key.trim() || !!busy}
                  onClick={() => run("connect", () => api.connect(key.trim()), "Connected. Now choose which accounts count in your net worth.")}>
                  {busy === "connect" ? <Icons.Spinner className="size-3.5 animate-spin" /> : <Icons.Link className="size-3.5" />}
                  Connect
                </button>
              </div>
            </div>
          )}

          {connected && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
              {status?.error && <p className="text-warning w-full text-xs">{status.error}</p>}
              {confirmOff ? (
                <>
                  <span className="text-muted-foreground text-xs">Stop updating? The accounts already here stay as they are.</span>
                  <button type="button" className={`${btn} !border-destructive/50 !text-destructive`} disabled={!!busy}
                    onClick={() => run("disconnect", api.disconnect, "Disconnected. The accounts already here keep their history.").then(() => setConfirmOff(false))}>
                    {busy === "disconnect" ? <Icons.Spinner className="size-3.5 animate-spin" /> : <Icons.Unlink className="size-3.5" />}
                    Disconnect
                  </button>
                  <button type="button" className={btn} onClick={() => setConfirmOff(false)}>Keep</button>
                </>
              ) : (
                <button type="button" className={btn} onClick={() => setConfirmOff(true)}>
                  <Icons.Unlink className="size-3.5" /> Disconnect
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {connected && (
        <section className="space-y-3">
          <SectionTitle title="2. Accounts" hint="Switch on the ones that are yours" />
          <div className="bg-card divide-y rounded-xl border">
            {status!.accounts.length === 0 && (
              <p className="text-muted-foreground p-4 text-sm">WheelTradr has no accounts to share yet.</p>
            )}
            {status!.accounts.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{a.name}</div>
                  <div className="text-muted-foreground truncate text-xs">
                    {[a.broker ? BROKERS[a.broker] ?? a.broker : null,
                      !a.inWheelTradr ? "No longer in WheelTradr" : null,
                      a.include && a.lastDate ? `In net worth, updated ${day(a.lastDate)}` : a.include ? "In net worth, first update running" : "Not in net worth",
                    ].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="text-sm tabular-nums">{usd(a.netValue)}</div>
                {busy === a.id
                  ? <Icons.Spinner className="text-muted-foreground size-4 animate-spin" />
                  : <Switch checked={a.include} disabled={!!busy || (!a.inWheelTradr && !a.include)} aria-label={`${a.name} in net worth`}
                      onCheckedChange={(v) => run(a.id, () => api.include(a.id, v),
                        v ? `${a.name} is in your net worth, with its history.` : `${a.name} is out of your net worth. Its history is kept.`)} />}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs">
              {last
                ? last.ok
                  ? `Last update ${when(last.at)}${on.length ? `. Updates every hour.` : ""}`
                  : `Last update ${when(last.at)} failed: ${last.error ?? "unknown reason"}`
                : "Not updated yet."}
            </span>
            <button type="button" className={btn} disabled={!!busy || !on.length} onClick={() => run("sync", api.sync, "Updated.")}>
              {busy === "sync" ? <Icons.Spinner className="size-3.5 animate-spin" /> : <Icons.RefreshCw className="size-3.5" />}
              Update now
            </button>
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Each account you switch on shows in Accounts and on the Dashboard, in the group WheelTradr (you can rename it there), with its value at every day's close back to its first day in WheelTradr. Switching one off hides it and takes it out of net worth; its history is kept.
          </p>
        </section>
      )}

      {note && (
        <p className={`text-sm ${note.tone === "ok" ? "text-success" : "text-destructive"}`}>{note.text}</p>
      )}
    </div>
  );
}
