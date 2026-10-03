// money-hub patch: Settings, Connections, Google (owner, 2026-10-03: "Google deserve their own place under
// the Settings Connections section. because now it can allow you to track a bank, as well as tracking
// amazon orders, in the future road map we can expand it to track other things"). The Google accounts the
// money app reads (Gmail, read only), and what reads each one: banks that email each transaction
// (Settings, Banks, Email alerts) and Amazon orders, which reads the account the owner picks here
// ("allow user to switch to whatever google account they connected"). The money-hub service keeps the
// links (/api/money-hub/email, lib/emailAlerts.js) and Amazon (/api/money-hub/amazon, lib/amazon.js).
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { Switch } from "@wealthfolio/ui/components/ui/switch";
import { SettingsHeader } from "../settings-header";

const EMAIL = "/api/money-hub/email";
const AMAZON = "/api/money-hub/amazon";

interface Mailbox { id: string; email: string; linkedAt: string; error: string | null }
interface EmailBank { id: string; bankName: string; accountName: string; mailboxId: string; enabled: boolean }
interface EmailStatus { clientReady: boolean; mailboxes: Mailbox[]; banks: EmailBank[] }
interface AmazonStatus {
  on: boolean;
  busy: boolean;
  mailboxId: string | null;
  mailboxes: { id: string; email: string }[];
  orders: number;
  matched: number;
  returns: number;
  last: { at: string; read: number; orders: number; charges: number; matched: number; errors: string[] } | null;
}

async function call<T>(base: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `The money app helper said ${res.status}`);
  return data as T;
}

/** Google's consent in a small window, opened before any await so no pop-up blocker fires. Resolves with
 *  the new list once the account shows up. */
function linkGoogle(before: number): Promise<EmailStatus> {
  const win = window.open("about:blank", "money-gmail-link", "width=520,height=680");
  if (!win) return Promise.reject(new Error("Your browser blocked the Google window. Allow pop-ups for this site and try again."));
  return new Promise((resolve, reject) => {
    let done = false;
    let closedChecks = 0;
    const finish = (fn: () => void) => { if (done) return; done = true; clearInterval(timer); window.removeEventListener("message", onMsg); fn(); };
    const check = async () => {
      try {
        const s = await call<EmailStatus>(EMAIL, "GET", "/status");
        if (s.mailboxes.length > before || s.mailboxes.some((m) => Date.now() - new Date(m.linkedAt).getTime() < 15_000)) { finish(() => resolve(s)); return true; }
      } catch { /* keep waiting */ }
      return false;
    };
    const onMsg = (e: MessageEvent) => { if (e.origin === window.location.origin && e.data?.type === "money-gmail-link") void check(); };
    window.addEventListener("message", onMsg);
    const timer = setInterval(async () => {
      if (await check()) return;
      if (win.closed && ++closedChecks > 2) finish(() => reject(new Error("The Google account was not linked (the Google window was closed).")));
    }, 1500);
    setTimeout(() => finish(() => reject(new Error("Linking took too long. Try again."))), 10 * 60_000);
    call<{ url: string }>(EMAIL, "POST", "/link", {})
      .then((r) => { win.location.href = r.url; })
      .catch((err) => { try { win.close(); } catch { /* already gone */ } finish(() => reject(err)); });
  });
}

const btn = "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50";
const cta = "!border-primary/50 !text-primary";
const field = "h-8 rounded-md border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none disabled:opacity-50";

const when = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? `today ${time}` : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
};

function Pill({ tone, text }: { tone: "ok" | "warn" | "off"; text: string }) {
  const c = tone === "warn" ? "bg-warning/15 text-warning" : tone === "ok" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground";
  const d = tone === "warn" ? "bg-warning" : tone === "ok" ? "bg-success" : "bg-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${c}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${d}`} />{text}
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

function Logo({ src, children }: { src?: string; children?: ReactNode }) {
  return src ? (
    <img src={src} width={40} height={40} alt="" aria-hidden="true" className="ring-border size-10 shrink-0 rounded-lg bg-white object-contain ring-1" />
  ) : (
    <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">{children}</span>
  );
}

const AMAZON_LOGO = "https://cdn.jsdelivr.net/gh/selfhst/icons@main/png/amazon.png";

export default function GoogleSettingsPage() {
  const [email, setEmail] = useState<EmailStatus | null>(null);
  const [amazon, setAmazon] = useState<AmazonStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState<string | null>(null);

  useEffect(() => {
    call<EmailStatus>(EMAIL, "GET", "/status").then(setEmail).catch((e) => setNote({ tone: "bad", text: e instanceof Error ? e.message : String(e) }));
    call<AmazonStatus>(AMAZON, "GET", "").then(setAmazon).catch(() => setAmazon(null));
  }, []);

  const run = async <T,>(what: string, fn: () => Promise<T>, take: (v: T) => void, ok?: string) => {
    setBusy(what);
    setNote(null);
    try {
      take(await fn());
      if (ok) setNote({ tone: "ok", text: ok });
    } catch (e) {
      setNote({ tone: "bad", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };
  const refreshAmazon = () => call<AmazonStatus>(AMAZON, "GET", "").then(setAmazon).catch(() => {});

  // What reads each account: its banks, and Amazon orders (the picked account, or every one).
  const usedBy = (m: Mailbox) => {
    const banks = (email?.banks ?? []).filter((b) => b.mailboxId === m.id).map((b) => b.accountName || b.bankName);
    const amazonHere = amazon?.on && (!amazon.mailboxId || amazon.mailboxId === m.id);
    return [banks.length ? `Bank emails: ${banks.join(", ")}` : null, amazonHere ? "Amazon orders" : null].filter(Boolean).join(" · ") || "Nothing reads it yet";
  };
  const amazonErrors = amazon?.last?.errors?.length ?? 0;

  return (
    <div className="space-y-6">
      <SettingsHeader heading="Google" text="The Google accounts the money app reads, and what reads each one. Read only: it cannot send, delete or change mail." />
      <Separator />

      <section className="space-y-3">
        <SectionTitle title="Accounts" hint="Gmail, read only" />
        <div className="bg-card rounded-xl border">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Logo src="/icons/gmail.png" />
              <div className="min-w-0">
                <div className="text-sm font-semibold">Google accounts</div>
                <div className="text-muted-foreground truncate text-xs">
                  {email ? (email.mailboxes.length ? `${email.mailboxes.length} linked` : "None linked yet") : "Loading"}
                </div>
              </div>
            </div>
            {email ? (
              <button type="button" className={`${btn} ${cta}`} disabled={!!busy || !email.clientReady}
                onClick={() => run("link", () => linkGoogle(email.mailboxes.length), (s) => { setEmail(s); refreshAmazon(); }, "Linked. Pick below what reads it.")}>
                {busy === "link" ? <Icons.Spinner className="size-3.5 animate-spin" /> : <Icons.Plus className="size-3.5" />} Link a Google account
              </button>
            ) : null}
          </div>
          {email && email.mailboxes.length > 0 ? (
            <div className="divide-y border-t">
              {email.mailboxes.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{m.email}</div>
                    <div className={`truncate text-xs ${m.error ? "text-warning" : "text-muted-foreground"}`}>{m.error || usedBy(m)}</div>
                  </div>
                  <Pill tone={m.error ? "warn" : "ok"} text={m.error ? "Link again" : "Linked"} />
                  {confirmUnlink === m.id ? (
                    <>
                      <button type="button" className={`${btn} !border-destructive/50 !text-destructive h-7`} disabled={!!busy}
                        onClick={() => run(`unlink:${m.id}`, () => call<EmailStatus>(EMAIL, "DELETE", `/mailboxes/${m.id}`), (s) => { setEmail(s); setConfirmUnlink(null); refreshAmazon(); })}>
                        Unlink
                      </button>
                      <button type="button" className={`${btn} h-7`} onClick={() => setConfirmUnlink(null)}>Keep</button>
                    </>
                  ) : (
                    <button type="button" aria-label={`Unlink ${m.email}`} className={`${btn} h-7 px-2`} onClick={() => setConfirmUnlink(m.id)}>
                      <Icons.Close className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle title="What reads them" hint="Each picks its account" />

        {amazon ? (
          <div className="bg-card rounded-xl border">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Logo src={AMAZON_LOGO} />
              <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-0">
                <div className="truncate text-sm font-semibold">Amazon orders</div>
                <div className="text-muted-foreground truncate text-xs">
                  {amazon.on
                    ? [`${amazon.matched} charges matched to ${amazon.orders} orders`, amazon.returns ? `${amazon.returns} returns` : null, amazon.last?.at && `checked ${when(amazon.last.at)}`].filter(Boolean).join(" · ")
                    : "Off"}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-3">
                {amazon.on ? <Pill tone={amazonErrors ? "warn" : "ok"} text={amazonErrors ? "Needs a look" : "Reading"} /> : <Pill tone="off" text="Off" />}
                <Switch checked={amazon.on} disabled={!!busy} aria-label="Read Amazon orders"
                  onCheckedChange={(on) => run("amazon-on", () => call<AmazonStatus>(AMAZON, "PUT", "", { on }), setAmazon)} />
              </div>
            </div>
            {amazon.on ? (
              <div className="space-y-2.5 border-t px-4 py-3 text-xs">
                <label className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">Read from</span>
                  <select value={amazon.mailboxId ?? ""} disabled={!!busy || !amazon.mailboxes.length} className={field}
                    onChange={(e) => run("amazon-box", () => call<AmazonStatus>(AMAZON, "PUT", "", { mailboxId: e.target.value || null }), setAmazon, "Saved. Reading that account now.")}>
                    <option value="">Every linked account</option>
                    {amazon.mailboxes.map((m) => <option key={m.id} value={m.id}>{m.email}</option>)}
                  </select>
                </label>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">Each Amazon charge shows its order; a return Amazon confirms goes on the Returns page.</span>
                  <button type="button" className={`${btn} h-7`} disabled={!!busy || amazon.busy}
                    onClick={() => run("amazon-run", () => call<AmazonStatus>(AMAZON, "POST", "/run"), setAmazon, "Checked.")}>
                    {busy === "amazon-run" || amazon.busy ? <Icons.Spinner className="size-3.5 animate-spin" /> : <Icons.RefreshCw className="size-3.5" />} Check now
                  </button>
                </div>
                {amazonErrors ? <p className="text-warning">{amazon.last?.errors.join(" · ")}</p> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {email ? (
          <div className="bg-card flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3">
            <Logo><Icons.Building className="text-primary size-5" /></Logo>
            <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-0">
              <div className="truncate text-sm font-semibold">Bank emails</div>
              <div className="text-muted-foreground truncate text-xs">
                {email.banks.length
                  ? email.banks.map((b) => `${b.accountName || b.bankName} (${email.mailboxes.find((m) => m.id === b.mailboxId)?.email ?? "no account"})`).join(" · ")
                  : "Banks Plaid cannot reach, read from the emails they send"}
              </div>
            </div>
            <Link to="/settings/banks" className={`${btn} ml-auto`}>
              <Icons.Settings className="size-3.5" /> Set up on Banks
            </Link>
          </div>
        ) : null}
      </section>

      {note && <p className={`text-sm ${note.tone === "ok" ? "text-success" : "text-destructive"}`}>{note.text}</p>}
    </div>
  );
}
