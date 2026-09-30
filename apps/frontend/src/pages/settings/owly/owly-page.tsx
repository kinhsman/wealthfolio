// money-hub patch: Settings, Connections, Owly. What friends owe the owner, from Owly
// (read-only key, made in Owly: Settings, Keys for other apps), as the account "Owed to
// me" in net worth, and which Zelle names are friends: Zelle with a friend counts as
// neither spending nor income. The work runs in the money-hub service at
// /api/money-hub/owly (server/drive-backup/lib/owly.js in the money-hub repo).
import { useEffect, useState } from "react";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui/components/ui/select";
import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { SettingsHeader } from "../settings-header";

const BASE = "/api/money-hub/owly";

interface OwlyPerson { id: number; name: string; active: boolean }
interface OwlyFriend { personId: number | null; name: string | null }
interface ZelleName {
  name: string; inCount: number; inTotal: number; outCount: number; outTotal: number;
  last: string | null; counted: string | null;
}
interface OwlyStatus {
  connected: boolean; keyShown: string | null; baseUrl: string; accountId: string | null; entries: number;
  owlyTotal: number | null; bookedTotal: number | null; busy: boolean; applying: boolean;
  lastSync: { at: string; ok: boolean; error?: string } | null;
  people: OwlyPerson[]; friends: Record<string, OwlyFriend>; names: ZelleName[]; namesError?: string | null;
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
  status: () => call<OwlyStatus>("GET", "/status"),
  connect: (apiKey: string) => call<OwlyStatus>("PUT", "/key", { apiKey }),
  disconnect: () => call<OwlyStatus>("DELETE", "/key"),
  friend: (name: string, who: string | null) => call<OwlyStatus>("PUT", "/friends", { name, who }),
  sync: () => call<OwlyStatus>("POST", "/sync", {}),
};

const usd = (n: number | null | undefined, digits = 2) =>
  n == null ? "" : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });
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
/** "QUANG VAN VO" as "Quang Van Vo": the bank writes names in capitals. */
const nameCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());

// Same pieces as the WheelTradr page: green = connected, amber only when it needs a look.
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
const NOT_FRIEND = "none";
const FRIEND_NOT_IN_OWLY = "friend";

export default function OwlySettingsPage() {
  const [status, setStatus] = useState<OwlyStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<null | string>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  useEffect(() => {
    api.status().then(setStatus).catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  // While the bank entries are being redone for a change of friends, check back until done.
  const applying = !!status?.applying;
  useEffect(() => {
    if (!applying) return;
    const t = setInterval(() => { api.status().then(setStatus).catch(() => undefined); }, 4000);
    return () => clearInterval(t);
  }, [applying]);

  const run = async (what: string, fn: () => Promise<OwlyStatus>, ok?: string) => {
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
  const last = status?.lastSync;
  const matches = status?.owlyTotal != null && status?.bookedTotal != null
    && Math.round(status.owlyTotal * 100) === Math.round(status.bookedTotal * 100);
  const valueFor = (n: ZelleName) => {
    const f = status?.friends[n.name];
    return !f ? NOT_FRIEND : f.personId == null ? FRIEND_NOT_IN_OWLY : String(f.personId);
  };
  const connectKey = () => run("connect", () => api.connect(key.trim()), "Connected. Owed to me is in your net worth. Now mark which Zelle names are friends.");

  return (
    <div className="space-y-6">
      <SettingsHeader heading="Owly" text="What friends owe you, from Owly, in your net worth. Zelle with friends is neither spending nor income." />
      <Separator />

      {loadError && <p className="text-destructive text-sm">{loadError}</p>}

      <section className="space-y-3">
        <SectionTitle title="1. Connect" hint="With a key made in Owly" />
        <div className="bg-card rounded-xl border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
                <Icons.HandCoins className="text-primary size-5" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold">Owly</div>
                <div className="text-muted-foreground truncate text-xs">
                  {connected ? `Key ${status?.keyShown ?? ""}` : status ? "Not connected" : loadError ? "" : "Checking…"}
                </div>
              </div>
            </div>
            {status && (last && !last.ok && connected
              ? <StatusPill on={false} warn text="Needs a look" />
              : <StatusPill on={connected} text={connected ? "Connected" : "Not connected"} />)}
          </div>

          {status && !connected && (
            <div className="mt-4 space-y-2">
              <p className="text-muted-foreground text-xs leading-relaxed">
                In Owly, open Settings, Keys for other apps, make a key named Money app and copy it. Paste it here.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false}
                  placeholder="owly_..." className={`${field} min-w-0 flex-1 font-mono`}
                  onKeyDown={(e) => { if (e.key === "Enter" && key.trim() && !busy) void connectKey(); }} />
                <button type="button" className={`${btn} ${cta}`} disabled={!key.trim() || !!busy} onClick={connectKey}>
                  {busy === "connect" ? <Icons.Spinner className="size-3.5 animate-spin" /> : <Icons.Link className="size-3.5" />}
                  Connect
                </button>
              </div>
            </div>
          )}

          {connected && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
              {last && !last.ok && <p className="text-warning w-full text-xs">{last.error}</p>}
              {confirmOff ? (
                <>
                  <span className="text-muted-foreground text-xs">Stop updating? Owed to me stays as it is now.</span>
                  <button type="button" className={`${btn} !border-destructive/50 !text-destructive`} disabled={!!busy}
                    onClick={() => run("disconnect", api.disconnect, "Disconnected. Owed to me keeps its history.").then(() => setConfirmOff(false))}>
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
          <SectionTitle title="2. Owed to me" hint="An account in your net worth" />
          <div className="bg-card divide-y rounded-xl border">
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 text-sm">Friends owe you, in Owly</div>
              <div className="text-sm tabular-nums">{usd(status?.owlyTotal)}</div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm">Owed to me, here</div>
                <div className="text-muted-foreground truncate text-xs">
                  {status?.entries ? `${status.entries} charges and payments from Owly` : "Nothing from Owly yet"}
                </div>
              </div>
              <div className="text-sm tabular-nums">{usd(status?.bookedTotal)}</div>
              {status?.bookedTotal != null && (matches
                ? <StatusPill on text="Matches Owly" />
                : <StatusPill on={false} warn text="Does not match" />)}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs">
              {last
                ? last.ok ? `Last update ${when(last.at)}. Updates every hour.` : `Last update ${when(last.at)} failed: ${last.error ?? "unknown reason"}`
                : "Not updated yet."}
            </span>
            <button type="button" className={btn} disabled={!!busy} onClick={() => run("sync", api.sync, "Updated.")}>
              {busy === "sync" ? <Icons.Spinner className="size-3.5 animate-spin" /> : <Icons.RefreshCw className="size-3.5" />}
              Update now
            </button>
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            The account Owed to me, in the group Owly, holds every charge and payment in Owly, so its balance is what friends owe you on every date. It counts in your net worth and is neither spending nor income.
          </p>
        </section>
      )}

      {connected && (
        <section className="space-y-3">
          <SectionTitle title="3. Zelle names" hint="Mark who is a friend" />
          <p className="text-muted-foreground text-xs leading-relaxed">
            The names on your banks&apos; Zelle lines. Zelle with a friend counts as neither spending nor income: money you send a friend and money they pay you back. Owly keeps who owes what.
          </p>
          {applying && (
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <Icons.Spinner className="size-3.5 animate-spin" /> Updating your bank entries for the change.
            </p>
          )}
          {status?.namesError && <p className="text-destructive text-xs">{status.namesError}</p>}
          <div className="bg-card divide-y rounded-xl border">
            {status!.names.length === 0 && !status?.namesError && (
              <p className="text-muted-foreground p-4 text-sm">No Zelle lines in your bank accounts yet.</p>
            )}
            {status!.names.map((n) => (
              <div key={n.name} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{nameCase(n.name)}</div>
                  <div className="text-muted-foreground truncate text-xs">
                    {[
                      n.inCount ? `${n.inCount} from them, ${usd(n.inTotal, 0)}` : null,
                      n.outCount ? `${n.outCount} to them, ${usd(n.outTotal, 0)}` : null,
                      n.last ? `last ${day(n.last)}` : null,
                    ].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {n.counted ? (
                  <span className="text-muted-foreground w-32 shrink-0 text-right text-xs">{n.counted}</span>
                ) : busy === n.name ? (
                  <span className="flex w-32 shrink-0 justify-end"><Icons.Spinner className="text-muted-foreground size-4 animate-spin" /></span>
                ) : (
                  <Select value={valueFor(n)} disabled={!!busy}
                    onValueChange={(v) => run(n.name, () => api.friend(n.name, v === NOT_FRIEND ? null : v))}>
                    <SelectTrigger className="h-9 w-32 shrink-0 text-xs" aria-label={`Is ${nameCase(n.name)} a friend`}>
                      <SelectValue />
                    </SelectTrigger>
                    {/* A set height that scrolls: the shared list's own limit is written the Tailwind 3 way
                        (max-h-[--var]), which Tailwind 4 drops, so a long list ran off the screen. */}
                    <SelectContent className="max-h-[min(18rem,var(--radix-select-content-available-height))]">
                      <SelectItem className="text-xs" value={NOT_FRIEND}>Not a friend</SelectItem>
                      <SelectItem className="text-xs" value={FRIEND_NOT_IN_OWLY}>Other friend</SelectItem>
                      {status!.people.map((p) => (
                        <SelectItem className="text-xs" key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {note && (
        <p className={`text-sm ${note.tone === "ok" ? "text-success" : "text-destructive"}`}>{note.text}</p>
      )}
    </div>
  );
}
