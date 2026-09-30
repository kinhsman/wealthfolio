// money-hub patch: Settings, Connections, Banks. The owner's bank and credit card
// accounts (Citi, Chase) through Plaid's free Trial plan, read only. The work runs
// in the money-hub service at /api/money-hub/plaid (server/drive-backup/lib/plaid.js
// and plaidSync.js in the money-hub repo): the owner pastes the Plaid keys here,
// links a bank in Plaid's window (a page the service serves, since Wealthfolio's
// pages do not allow Plaid's script), and each account switched on becomes a Cash or
// Credit Card account here whose transactions are imported and kept current.
import { useEffect, useState } from "react";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { Switch } from "@wealthfolio/ui/components/ui/switch";
import { SettingsHeader } from "../settings-header";

const BASE = "/api/money-hub/plaid";

interface BankAccount {
  id: string; name: string; officialName: string | null; mask: string | null; type: string; subtype: string | null;
  balance: number | null; currency: string; include: boolean; supported: boolean; balanceOnly: boolean; wfAccountId: string | null;
  txns: number; firstDate: string | null;
}
interface BankItem {
  id: string; institution: { name: string }; env: string; error: string | null; needsLogin: boolean;
  historical: boolean; accounts: BankAccount[];
}
interface BanksStatus {
  configured: boolean; env: string; clientIdShown: string | null; secrets: { production: boolean; sandbox: boolean };
  busy: boolean; itemsLeft: number;
  lastSync: { at: string; ok: boolean; error?: string; added?: number } | null;
  items: BankItem[];
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
  status: () => call<BanksStatus>("GET", "/status"),
  keys: (clientId: string, secret: string, env: string) => call<BanksStatus>("PUT", "/keys", { clientId, secret, env }),
  forget: () => call<BanksStatus>("DELETE", "/keys"),
  include: (item: string, id: string, include: boolean) =>
    call<BanksStatus>("PUT", `/accounts/${encodeURIComponent(item)}/${encodeURIComponent(id)}`, { include }),
  sync: () => call<BanksStatus>("POST", "/sync", {}),
};

const money = (n: number | null | undefined, ccy = "USD") =>
  n == null ? "" : n.toLocaleString("en-US", { style: "currency", currency: ccy, maximumFractionDigits: 2 });
const monthYear = (ymd?: string | null) =>
  ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "";
const when = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const today = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return today ? `today ${time}` : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
};
const KIND: Record<string, string> = {
  checking: "Checking", savings: "Savings", "money market": "Money market", cd: "CD", "credit card": "Credit card",
  paypal: "PayPal", "cash management": "Cash management",
};
const kindOf = (a: BankAccount) =>
  a.balanceOnly ? "Cash, balance only"
    : KIND[a.subtype ?? ""] ?? (a.type === "credit" ? "Credit card" : a.type === "depository" ? "Bank account" : a.type);

// Same pieces as the WheelTradr and Backups pages: green = connected, amber only when it needs a look.
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

export default function BanksSettingsPage() {
  const [status, setStatus] = useState<BanksStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [sandbox, setSandbox] = useState("");
  const [editKeys, setEditKeys] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmForget, setConfirmForget] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  useEffect(() => {
    api.status().then(setStatus).catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
    if (new URLSearchParams(window.location.search).get("linked")) {
      setNote({ tone: "ok", text: "Bank linked. Switch on the accounts that should count in your net worth." });
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const run = async (what: string, fn: () => Promise<BanksStatus>, ok?: string) => {
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

  const saveKeys = () =>
    run("keys", async () => {
      let s: BanksStatus | null = null;
      if (sandbox.trim()) s = await api.keys(clientId.trim(), sandbox.trim(), "sandbox");
      if (secret.trim()) s = await api.keys(clientId.trim(), secret.trim(), "production");
      setSecret("");
      setSandbox("");
      setEditKeys(false);
      return s ?? api.status();
    }, "Plaid accepted the keys.");

  const configured = !!status?.configured;
  const showKeyForm = !!status && (!configured || editKeys);
  const items = status?.items ?? [];
  const on = items.flatMap((i) => i.accounts.filter((a) => a.include));
  const last = status?.lastSync;

  return (
    <div className="space-y-6">
      <SettingsHeader heading="Banks" text="Your bank and credit card accounts, through Plaid. Read only: nothing here can move money." />
      <Separator />

      {loadError && <p className="text-destructive text-sm">{loadError}</p>}

      <section className="space-y-3">
        <SectionTitle title="1. Plaid keys" hint="From the Plaid dashboard, Developers, Keys" />
        <div className="bg-card rounded-xl border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
                <Icons.Building className="text-primary size-5" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold">Plaid</div>
                <div className="text-muted-foreground truncate text-xs">
                  {configured
                    ? `Client ${status?.clientIdShown ?? ""}${status?.env === "sandbox" ? " · test banks only" : ""}`
                    : "Not set up"}
                </div>
              </div>
            </div>
            {status && <StatusPill on={configured} text={configured ? "Keys saved" : "Not set up"} />}
          </div>

          {showKeyForm && (
            <div className="mt-4 space-y-2">
              <p className="text-muted-foreground text-xs leading-relaxed">
                In the Plaid dashboard, open Developers, Keys. Copy the Client ID and the Production secret into the boxes
                below. The Sandbox secret is optional: it only lets the money app practise on Plaid's test bank.
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <input value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" spellCheck={false}
                  placeholder="Client ID" className={`${field} font-mono`} />
                <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" spellCheck={false}
                  placeholder="Production secret" className={`${field} font-mono`} />
                <input type="password" value={sandbox} onChange={(e) => setSandbox(e.target.value)} autoComplete="off" spellCheck={false}
                  placeholder="Sandbox secret (optional)" className={`${field} font-mono`} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={`${btn} ${cta}`} disabled={!clientId.trim() || !(secret.trim() || sandbox.trim()) || !!busy}
                  onClick={saveKeys}>
                  {busy === "keys" ? <Icons.Spinner className="size-3.5 animate-spin" /> : <Icons.Check className="size-3.5" />}
                  Save keys
                </button>
                {configured && <button type="button" className={btn} onClick={() => setEditKeys(false)}>Cancel</button>}
              </div>
            </div>
          )}

          {configured && !editKeys && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
              {confirmForget ? (
                <>
                  <span className="text-muted-foreground text-xs">Forget the keys? Linked banks stop updating until you add them again.</span>
                  <button type="button" className={`${btn} !border-destructive/50 !text-destructive`} disabled={!!busy}
                    onClick={() => run("forget", api.forget, "Keys forgotten. The accounts already here keep their history.").then(() => setConfirmForget(false))}>
                    {busy === "forget" ? <Icons.Spinner className="size-3.5 animate-spin" /> : <Icons.Trash className="size-3.5" />}
                    Forget keys
                  </button>
                  <button type="button" className={btn} onClick={() => setConfirmForget(false)}>Keep</button>
                </>
              ) : (
                <>
                  <button type="button" className={btn} onClick={() => setEditKeys(true)}>Replace keys</button>
                  <button type="button" className={btn} onClick={() => setConfirmForget(true)}>
                    <Icons.Trash className="size-3.5" /> Forget keys
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {configured && (
        <section className="space-y-3">
          <SectionTitle title="2. Banks" hint="Switch on the accounts that are yours" />

          {items.length === 0 && (
            <div className="bg-card text-muted-foreground rounded-xl border p-4 text-sm">No bank linked yet.</div>
          )}

          {items.map((item) => (
            <div key={item.id} className="bg-card rounded-xl border">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{item.institution.name}</div>
                  <div className="text-muted-foreground truncate text-xs">
                    {item.env === "sandbox" ? "Plaid's test bank" : item.historical ? "History loaded" : "Loading history from the bank"}
                  </div>
                </div>
                {item.needsLogin ? (
                  <a className={`${btn} ${cta}`} href={`${BASE}/link?item=${encodeURIComponent(item.id)}`}>
                    <Icons.RefreshCw className="size-3.5" /> Reconnect
                  </a>
                ) : item.error ? (
                  <StatusPill on={false} warn text="Needs a look" />
                ) : (
                  <StatusPill on text="Linked" />
                )}
              </div>
              {item.error && <p className="text-warning px-4 pb-3 text-xs">{item.error}</p>}
              <div className="divide-y border-t">
                {item.accounts.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {a.name}{a.mask ? ` ••${a.mask}` : ""}
                      </div>
                      <div className="text-muted-foreground truncate text-xs">
                        {[kindOf(a),
                          !a.supported ? "Not brought in (loans stay out)" :
                            !a.include ? "Not in net worth" :
                              a.balanceOnly ? (a.firstDate ? `In net worth since ${monthYear(a.firstDate)}` : "In net worth, first update running")
                                : a.firstDate ? `In net worth, ${a.txns} transactions since ${monthYear(a.firstDate)}` : "In net worth, first update running",
                        ].join(" · ")}
                      </div>
                    </div>
                    <div className="text-sm tabular-nums">{money(a.type === "credit" && a.balance != null ? -a.balance : a.balance, a.currency)}</div>
                    {busy === `${item.id}/${a.id}`
                      ? <Icons.Spinner className="text-muted-foreground size-4 animate-spin" />
                      : <Switch checked={a.include} disabled={!!busy || !a.supported} aria-label={`${a.name} in net worth`}
                          onCheckedChange={(v) => run(`${item.id}/${a.id}`, () => api.include(item.id, a.id, v),
                            v ? `${a.name} is in your net worth, with its transactions.` : `${a.name} is out of your net worth. Its history is kept.`)} />}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs">
              {last
                ? last.ok
                  ? `Last update ${when(last.at)}${on.length ? ". Updates every 4 hours." : ""}`
                  : `Last update ${when(last.at)} failed: ${last.error ?? "unknown reason"}`
                : "Not updated yet."}
            </span>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn} disabled={!!busy || !on.length} onClick={() => run("sync", api.sync, "Updated.")}>
                {busy === "sync" ? <Icons.Spinner className="size-3.5 animate-spin" /> : <Icons.RefreshCw className="size-3.5" />}
                Update now
              </button>
              <a className={`${btn} ${cta} ${busy ? "pointer-events-none opacity-50" : ""}`} href={`${BASE}/link`}>
                <Icons.Plus className="size-3.5" /> Link a bank
              </a>
            </div>
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Plaid's free plan allows {status!.env === "sandbox" ? "unlimited test banks" : `10 bank links in total (${status!.itemsLeft} left)`}.
            If a bank asks for its login again, press Reconnect on it: linking it a second time would use up another one. Link from a
            computer, since some banks (Chase, Citi) finish their sign-in in a second window.
          </p>
        </section>
      )}

      {note && (
        <p className={`text-sm ${note.tone === "ok" ? "text-success" : "text-destructive"}`}>{note.text}</p>
      )}
    </div>
  );
}
