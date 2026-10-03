// money-hub patch: Settings, Banks, Email alerts. Banks Plaid cannot reach (Vietnam's MB, ACB) email
// each transaction; the owner links one or more Gmail accounts (read only) and sets each bank up as a
// template: which Gmail, which emails (conditions, all or any), and the words written in front of the
// date, amount, account and the rest. The money-hub service (lib/emailAlerts.js, /api/money-hub/email)
// reads them every 5 minutes into a Cash or Credit Card account, like any other bank.
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Icons } from "@wealthfolio/ui";
import { Switch } from "@wealthfolio/ui/components/ui/switch";
import { RoundLogo } from "@/components/round-logo";

const BASE = "/api/money-hub/email";

type Op = "contains" | "not_contains" | "is";
type CondField = "from" | "to" | "subject" | "body";
interface Condition { field: CondField; op: Op; value: string }
type FieldKey = "date" | "time" | "amount" | "account" | "description" | "counterparty" | "reference" | "balance";
interface Template {
  bankName: string; accountName: string; mailboxId: string; type: "bank" | "card"; currency: string; startDate: string | null;
  match: { mode: "all" | "any"; conditions: Condition[] };
  fields: Record<FieldKey, { before: string; after: string }>;
  dateFormat: "DMY" | "MDY" | "YMD"; numberStyle: "comma" | "dot"; timeZone: string;
  direction: { default: "out" | "in"; useSign: boolean; inWords: string[]; outWords: string[] };
  ownWords: string[];
  balanceSet: { amount: number; at: string } | null;
  enabled: boolean;
}
interface Bank extends Template {
  id: string; hasLogo?: boolean; logoHash?: string; lastCheck?: string; error?: string | null; emails?: number;
  problems?: { id: string; subject: string; date: number; problems: string[] }[];
  imported?: { added: number; updated: number; removed: number } | { error: string };
}
interface Mailbox { id: string; email: string; linkedAt: string; error: string | null; expiresAt: string | null }
interface Preset extends Partial<Template> { key: string; name: string }
interface Status { clientReady: boolean; lastRun: string | null; busy: boolean; mailboxes: Mailbox[]; banks: Bank[]; presets: Preset[] }
interface PreviewRow {
  id: string; from: string; subject: string; date: number; text: string; ok: boolean; problems: string[];
  values: { date: string; time: string; amount: number | null; out: boolean; account: string | null; description: string | null;
    counterparty: string | null; reference: string | null; balance: number | null; own: boolean };
}
interface Preview { query: string; rows: PreviewRow[]; balance: number | null }

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method, credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `The money app helper said ${res.status}`);
  return data as T;
}

/** A picture file to the helper (multipart: the logo upload). */
async function upload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("logo", file);
  const res = await fetch(`${BASE}${path}`, { method: "PUT", credentials: "include", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `The money app helper said ${res.status}`);
  return data as T;
}
const logoSrc = (b: { id: string; logoHash?: string }) => `${BASE}/banks/${b.id}/logo?v=${b.logoHash ?? ""}`;

/** The bank's logo on its account: a picture from its newest email, an upload, or none. Applies at once. */
function LogoRow({ bank, onSaved }: { bank: Bank; onSaved: (s: Status) => void }) {
  const [choices, setChoices] = useState<{ key: string; dataUrl: string }[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const act = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const done = (s: Status) => { onSaved(s); setChoices(null); };
  return (
    <section className="space-y-2">
      <div className="text-xs font-semibold">Logo <span className="text-muted-foreground font-normal">· shown on the account</span></div>
      <div className="flex flex-wrap items-center gap-2">
        {/* money-hub patch: as it shows on the account, round and filling the circle (owner, 10-02). */}
        {bank.hasLogo ? <RoundLogo url={logoSrc(bank)} className="size-10" /> : (
          <span className="bg-muted flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border">
            <Icons.Building className="text-muted-foreground size-5" />
          </span>
        )}
        <button type="button" className={btn} disabled={!!busy}
          onClick={() => act("load", async () => setChoices((await call<{ choices: { key: string; dataUrl: string }[] }>("GET", `/banks/${bank.id}/logo-choices`)).choices))}>
          {busy === "load" ? <Icons.Spinner className="size-3.5 animate-spin" /> : <Icons.Mail className="size-3.5" />} From the email
        </button>
        <label className={`${btn} cursor-pointer`}>
          {busy === "upload" ? <Icons.Spinner className="size-3.5 animate-spin" /> : <Icons.Upload className="size-3.5" />} Upload
          <input type="file" accept="image/*" className="hidden" disabled={!!busy}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void act("upload", async () => done(await upload<Status>(`/banks/${bank.id}/logo`, f))); }} />
        </label>
        {bank.hasLogo && (
          <button type="button" className={btn} disabled={!!busy}
            onClick={() => act("clear", async () => done(await call<Status>("DELETE", `/banks/${bank.id}/logo`)))}>
            <Icons.Close className="size-3.5" /> No logo
          </button>
        )}
      </div>
      {choices && (choices.length ? (
        <div className="flex flex-wrap gap-2">
          {choices.map((c) => (
            <button key={c.key} type="button" disabled={!!busy} aria-label="Use this picture"
              className="hover:border-primary size-16 overflow-hidden rounded-lg border bg-white p-0.5 disabled:opacity-50"
              onClick={() => act(`pick:${c.key}`, async () => done(await call<Status>("PUT", `/banks/${bank.id}/logo`, { key: c.key })))}>
              <img src={c.dataUrl} alt="" className="size-full object-contain" />
            </button>
          ))}
        </div>
      ) : <p className="text-muted-foreground text-[11px]">The newest email has no pictures. Upload one instead.</p>)}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </section>
  );
}

const FIELD_LABELS: [FieldKey, string, string][] = [
  ["amount", "Amount", "Số tiền giao dịch"],
  ["date", "Date", "Ngày, giờ giao dịch"],
  ["time", "Time", "Ngày, giờ giao dịch"],
  ["account", "Account number", "Tài khoản"],
  ["description", "Description", "Nội dung"],
  ["counterparty", "Other side", "Người thụ hưởng"],
  ["reference", "Reference", "Số tham chiếu"],
  ["balance", "Balance after", "Số dư"],
];
const COND_FIELDS: [CondField, string][] = [["from", "From"], ["subject", "Subject"], ["body", "Email text"], ["to", "To"]];
const OPS: [Op, string][] = [["contains", "contains"], ["not_contains", "does not contain"], ["is", "is exactly"]];
const ZONES = ["Asia/Ho_Chi_Minh", "America/Chicago", "America/New_York", "America/Los_Angeles", "UTC"];

const emptyFields = () => Object.fromEntries(FIELD_LABELS.map(([k]) => [k, { before: "", after: "" }])) as Template["fields"];
const blank = (mailboxId = ""): Template => ({
  bankName: "", accountName: "", mailboxId, type: "bank", currency: "VND", startDate: null,
  match: { mode: "all", conditions: [{ field: "from", op: "contains", value: "" }] },
  fields: emptyFields(), dateFormat: "DMY", numberStyle: "comma", timeZone: "Asia/Ho_Chi_Minh",
  direction: { default: "out", useSign: true, inWords: [], outWords: [] }, ownWords: [], balanceSet: null, enabled: true,
});
const fromPreset = (p: Preset, mailboxId: string): Template => {
  const b = blank(mailboxId);
  return {
    ...b, ...p, mailboxId, accountName: p.bankName ?? "", startDate: null, balanceSet: null, enabled: true,
    fields: { ...emptyFields(), ...Object.fromEntries(Object.entries(p.fields ?? {}).map(([k, v]) => [k, { before: v.before ?? "", after: v.after ?? "" }])) },
    match: { mode: p.match?.mode ?? "all", conditions: (p.match?.conditions ?? []).map((c) => ({ ...c })) },
  } as Template;
};

const btn = "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50";
const cta = "!border-primary/50 !text-primary";
const field = "h-9 min-w-0 rounded-md border bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none disabled:opacity-50";
const lbl = "text-muted-foreground text-[11px] font-medium";

const when = (iso?: string | number | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const today = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return today ? `today ${time}` : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
};
const num = (n: number | null | undefined, ccy: string) =>
  n == null ? "" : `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${ccy}`;

function Pill({ tone, text }: { tone: "ok" | "warn" | "off"; text: string }) {
  const c = tone === "warn" ? "bg-warning/15 text-warning" : tone === "ok" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground";
  const d = tone === "warn" ? "bg-warning" : tone === "ok" ? "bg-success" : "bg-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${c}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${d}`} />{text}
    </span>
  );
}

/** Google's consent in a small window, opened before any await so no pop-up blocker fires. */
function linkGmail(before: number): Promise<Status> {
  const win = window.open("about:blank", "money-gmail-link", "width=520,height=680");
  if (!win) return Promise.reject(new Error("Your browser blocked the Google window. Allow pop-ups for this site and try again."));
  return new Promise((resolve, reject) => {
    let done = false;
    let closedChecks = 0;
    const finish = (fn: () => void) => { if (done) return; done = true; clearInterval(timer); window.removeEventListener("message", onMsg); fn(); };
    const check = async () => {
      try {
        const s = await call<Status>("GET", "/status");
        if (s.mailboxes.length > before || s.mailboxes.some((m) => Date.now() - new Date(m.linkedAt).getTime() < 15_000)) { finish(() => resolve(s)); return true; }
      } catch { /* keep waiting */ }
      return false;
    };
    const onMsg = (e: MessageEvent) => { if (e.origin === window.location.origin && e.data?.type === "money-gmail-link") void check(); };
    window.addEventListener("message", onMsg);
    const timer = setInterval(async () => {
      if (await check()) return;
      if (win.closed && ++closedChecks > 2) finish(() => reject(new Error("Gmail was not linked (the Google window was closed).")));
    }, 1500);
    setTimeout(() => finish(() => reject(new Error("Linking took too long. Try again."))), 10 * 60_000);
    call<{ url: string }>("POST", "/link", {})
      .then((r) => { win.location.href = r.url; })
      .catch((err) => { try { win.close(); } catch { /* already gone */ } finish(() => reject(err)); });
  });
}

/** Words typed with commas, kept as a list. */
function WordsInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState(value.join(", "));
  useEffect(() => setDraft(value.join(", ")), [value]);
  return (
    <input value={draft} placeholder={placeholder} className={`${field} w-full`}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onChange(draft.split(",").map((w) => w.trim()).filter(Boolean))} />
  );
}

function Editor({ open, onClose, start, bankId, status, onSaved }: {
  open: boolean; onClose: () => void; start: Template; bankId: string | null; status: Status; onSaved: (s: Status) => void;
}) {
  const [t, setT] = useState<Template>(start);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  useEffect(() => { if (open) { setT(start); setPreview(null); setError(""); setShown(null); setConfirmRemove(false); } }, [open, start]);

  const set = <K extends keyof Template>(k: K, v: Template[K]) => setT((x) => ({ ...x, [k]: v }));
  const setCond = (i: number, c: Partial<Condition>) =>
    setT((x) => ({ ...x, match: { ...x.match, conditions: x.match.conditions.map((y, j) => (j === i ? { ...y, ...c } : y)) } }));
  const setField = (k: FieldKey, part: "before" | "after", v: string) =>
    setT((x) => ({ ...x, fields: { ...x.fields, [k]: { ...x.fields[k], [part]: v } } }));

  const act = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const runPreview = () => act("preview", async () => setPreview(await call<Preview>("POST", "/preview", t)));
  const save = () => act("save", async () => {
    onSaved(await call<Status>(bankId ? "PUT" : "POST", bankId ? `/banks/${bankId}` : "/banks", t));
    onClose();
  });
  const remove = () => act("remove", async () => { onSaved(await call<Status>("DELETE", `/banks/${bankId}`)); onClose(); });

  const tz = t.timeZone;
  const hasBalanceWords = !!t.fields.balance.before.trim();
  const local = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "" : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{bankId ? `Edit ${start.bankName || "bank"}` : "Add a bank by email"}</DialogTitle>
          <DialogDescription>Which emails are this bank's, and the words written just before each value.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {!bankId && status.presets.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className={lbl}>Start from</span>
              {status.presets.map((p) => (
                <button key={p.key} type="button" className={btn} onClick={() => { setT(fromPreset(p, t.mailboxId)); setPreview(null); }}>
                  {p.name}
                </button>
              ))}
            </div>
          )}

          <section className="grid gap-2 sm:grid-cols-3">
            <label className="space-y-1"><div className={lbl}>Bank</div>
              <input className={`${field} w-full`} value={t.bankName} placeholder="MB Bank" onChange={(e) => set("bankName", e.target.value)} /></label>
            <label className="space-y-1"><div className={lbl}>Account name</div>
              <input className={`${field} w-full`} value={t.accountName} placeholder="MB checking" onChange={(e) => set("accountName", e.target.value)} /></label>
            <label className="space-y-1"><div className={lbl}>Gmail</div>
              <select className={`${field} w-full`} value={t.mailboxId} onChange={(e) => set("mailboxId", e.target.value)}>
                <option value="">Choose…</option>
                {status.mailboxes.map((m) => <option key={m.id} value={m.id}>{m.email}</option>)}
              </select></label>
            <label className="space-y-1"><div className={lbl}>Type</div>
              <select className={`${field} w-full`} value={t.type} onChange={(e) => set("type", e.target.value as Template["type"])}>
                <option value="bank">Bank account</option><option value="card">Credit card</option>
              </select></label>
            <label className="space-y-1"><div className={lbl}>Currency</div>
              <input className={`${field} w-full uppercase`} value={t.currency} maxLength={3} onChange={(e) => set("currency", e.target.value.toUpperCase())} /></label>
            <label className="space-y-1"><div className={lbl}>Emails from</div>
              <input type="date" className={`${field} w-full`} value={t.startDate ?? ""} onChange={(e) => set("startDate", e.target.value || null)} /></label>
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold">Which emails</span>
              <span className="text-muted-foreground">match</span>
              <select className={`${field} h-7`} value={t.match.mode} onChange={(e) => set("match", { ...t.match, mode: e.target.value as "all" | "any" })}>
                <option value="all">all (AND)</option><option value="any">any (OR)</option>
              </select>
              <span className="text-muted-foreground">of these</span>
            </div>
            {t.match.conditions.map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 sm:grid-cols-[112px_150px_1fr_auto]">
                <select className={field} value={c.field} onChange={(e) => setCond(i, { field: e.target.value as CondField })}>
                  {COND_FIELDS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                </select>
                <select className={field} value={c.op} onChange={(e) => setCond(i, { op: e.target.value as Op })}>
                  {OPS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                </select>
                <input className={`${field} order-last col-span-3 sm:order-none sm:col-span-1`} value={c.value} placeholder={c.field === "from" ? "alerts@bank.com" : "words"}
                  onChange={(e) => setCond(i, { value: e.target.value })} />
                <button type="button" aria-label="Remove condition" className={`${btn} px-2`}
                  onClick={() => set("match", { ...t.match, conditions: t.match.conditions.filter((_, j) => j !== i) })}>
                  <Icons.Close className="size-3.5" />
                </button>
              </div>
            ))}
            <button type="button" className={btn} onClick={() => set("match", { ...t.match, conditions: [...t.match.conditions, { field: "body", op: "contains", value: "" }] })}>
              <Icons.Plus className="size-3.5" /> Condition
            </button>
          </section>

          <section className="space-y-2">
            <div className="text-xs font-semibold">What to read <span className="text-muted-foreground font-normal">· words just before the value, and optionally just after</span></div>
            {FIELD_LABELS.map(([k, name, hint]) => (
              <div key={k} className="grid grid-cols-2 items-center gap-x-2 gap-y-1 sm:grid-cols-[96px_1fr_1fr]">
                <span className="col-span-2 text-xs sm:col-span-1">{name}</span>
                <input className={field} value={t.fields[k].before} placeholder={`before, e.g. ${hint}`} onChange={(e) => setField(k, "before", e.target.value)} />
                <input className={field} value={t.fields[k].after} placeholder="after (optional)" onChange={(e) => setField(k, "after", e.target.value)} />
              </div>
            ))}
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="space-y-1"><div className={lbl}>Date written as</div>
                <select className={`${field} w-full`} value={t.dateFormat} onChange={(e) => set("dateFormat", e.target.value as Template["dateFormat"])}>
                  <option value="DMY">Day-Month-Year</option><option value="MDY">Month-Day-Year</option><option value="YMD">Year-Month-Day</option>
                </select></label>
              <label className="space-y-1"><div className={lbl}>Numbers written as</div>
                <select className={`${field} w-full`} value={t.numberStyle} onChange={(e) => set("numberStyle", e.target.value as Template["numberStyle"])}>
                  <option value="comma">1,234,567.89</option><option value="dot">1.234.567,89</option>
                </select></label>
              <label className="space-y-1"><div className={lbl}>Bank's time zone</div>
                <select className={`${field} w-full`} value={tz} onChange={(e) => set("timeZone", e.target.value)}>
                  {[...new Set([tz, ...ZONES])].map((z) => <option key={z} value={z}>{z}</option>)}
                </select></label>
            </div>
          </section>

          <section className="space-y-2">
            <div className="text-xs font-semibold">Money in or out</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1"><div className={lbl}>When nothing says</div>
                <select className={`${field} w-full`} value={t.direction.default} onChange={(e) => set("direction", { ...t.direction, default: e.target.value as "in" | "out" })}>
                  <option value="out">Money out</option><option value="in">Money in</option>
                </select></label>
              <label className="flex items-center gap-2 pt-5 text-xs">
                <Switch checked={t.direction.useSign} onCheckedChange={(v) => set("direction", { ...t.direction, useSign: v })} />
                + or - in front of the amount decides
              </label>
              <label className="space-y-1"><div className={lbl}>Money in when the email has</div>
                <WordsInput value={t.direction.inWords} placeholder="e.g. nhận tiền, credit" onChange={(v) => set("direction", { ...t.direction, inWords: v })} /></label>
              <label className="space-y-1"><div className={lbl}>Money out when the email has</div>
                <WordsInput value={t.direction.outWords} placeholder="e.g. trích nợ, debit" onChange={(v) => set("direction", { ...t.direction, outWords: v })} /></label>
              <label className="space-y-1 sm:col-span-2"><div className={lbl}>Other side is me (a move between my accounts) when it has</div>
                <WordsInput value={t.ownWords} placeholder="your name as the bank writes it" onChange={(v) => set("ownWords", v)} /></label>
            </div>
          </section>

          {!hasBalanceWords && (
            <section className="space-y-2">
              <div className="text-xs font-semibold">Balance <span className="text-muted-foreground font-normal">· these emails do not say it, so type it once</span></div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input type="number" inputMode="decimal" className={field} placeholder={`Balance in ${t.currency || "VND"}`}
                  value={t.balanceSet?.amount ?? ""}
                  onChange={(e) => set("balanceSet", e.target.value === "" ? null : { amount: Number(e.target.value), at: t.balanceSet?.at ?? new Date().toISOString() })} />
                <input type="datetime-local" className={field} disabled={!t.balanceSet}
                  value={t.balanceSet ? local(t.balanceSet.at) : ""}
                  onChange={(e) => t.balanceSet && set("balanceSet", { ...t.balanceSet, at: new Date(e.target.value).toISOString() })} />
              </div>
            </section>
          )}

          {bankId && status.banks.find((b) => b.id === bankId) && (
            <LogoRow bank={status.banks.find((b) => b.id === bankId)!} onSaved={onSaved} />
          )}

          {preview && (
            <section className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                <span className="font-semibold">{preview.rows.length ? `Newest ${preview.rows.length} matching emails` : "No email matches yet"}</span>
                {preview.balance != null && <span className="text-muted-foreground">Balance now {num(preview.balance, t.currency)}</span>}
              </div>
              {preview.rows.map((r) => (
                <div key={r.id} className="rounded-lg border">
                  <button type="button" className="flex w-full items-start gap-3 px-3 py-2 text-left" onClick={() => setShown(shown === r.id ? null : r.id)}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{r.values.description || r.subject}</div>
                      <div className="text-muted-foreground truncate text-[11px]">
                        {[`${r.values.date} ${r.values.time.slice(0, 5)}`, r.values.account, r.values.reference && `ref ${r.values.reference}`, r.values.own && "my own account"].filter(Boolean).join(" · ")}
                      </div>
                      {!r.ok && <div className="text-warning text-[11px]">{r.problems.join(". ") || "Nothing read"}</div>}
                    </div>
                    <div className={`whitespace-nowrap text-xs tabular-nums ${r.values.out ? "" : "text-success"}`}>
                      {r.values.amount != null ? `${r.values.out ? "-" : "+"}${num(r.values.amount, t.currency)}` : "?"}
                    </div>
                  </button>
                  {shown === r.id && (
                    <pre className="bg-muted/40 max-h-56 overflow-auto whitespace-pre-wrap border-t px-3 py-2 text-[11px] leading-relaxed">{r.text}</pre>
                  )}
                </div>
              ))}
              {preview.rows.length > 0 && <p className="text-muted-foreground text-[11px]">Tap an email to see its text and copy the words in front of a value.</p>}
            </section>
          )}

          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex gap-2">
            {bankId && (confirmRemove ? (
              <>
                <button type="button" className={`${btn} !border-destructive/50 !text-destructive`} disabled={!!busy} onClick={remove}>
                  {busy === "remove" ? <Icons.Spinner className="size-3.5 animate-spin" /> : <Icons.Trash className="size-3.5" />} Stop reading
                </button>
                <button type="button" className={btn} onClick={() => setConfirmRemove(false)}>Keep</button>
              </>
            ) : (
              <button type="button" className={btn} onClick={() => setConfirmRemove(true)}><Icons.Trash className="size-3.5" /> Remove</button>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" className={btn} disabled={!!busy || !t.mailboxId} onClick={runPreview}>
              {busy === "preview" ? <Icons.Spinner className="size-3.5 animate-spin" /> : <Icons.Search className="size-3.5" />} Preview
            </button>
            <button type="button" className={`${btn} ${cta}`} disabled={!!busy || !t.mailboxId || !t.bankName.trim()} onClick={save}>
              {busy === "save" ? <Icons.Spinner className="size-3.5 animate-spin" /> : <Icons.Check className="size-3.5" />} Save
            </button>
          </div>
        </DialogFooter>
        {confirmRemove && (
          <p className="text-muted-foreground text-[11px]">Stops reading this bank's emails. Its account and history stay in the money app, switched off.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function EmailBanksSection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; start: Template } | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState<string | null>(null);

  useEffect(() => { call<Status>("GET", "/status").then(setStatus).catch((e) => setError(e instanceof Error ? e.message : String(e))); }, []);

  const run = async (what: string, fn: () => Promise<Status>) => {
    setBusy(what);
    setError("");
    try { setStatus(await fn()); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  if (!status) return error ? <p className="text-destructive text-sm">{error}</p> : null;
  const mailOf = (id: string) => status.mailboxes.find((m) => m.id === id)?.email ?? "Gmail not linked";

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 className="text-muted-foreground whitespace-nowrap text-xs font-semibold uppercase tracking-[0.08em]">Email alerts</h3>
        <span className="text-muted-foreground text-xs">Banks that email each transaction</span>
      </div>

      <div className="bg-card rounded-xl border">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {/* Gmail's own logo (owner, 10-02), served from public/ like the ntfy card's. */}
            <img src="/icons/gmail.png" width={40} height={40} alt="" aria-hidden="true" className="ring-border size-10 shrink-0 rounded-lg ring-1" />
            <div className="min-w-0">
              <div className="text-sm font-semibold">Gmail</div>
              <div className="text-muted-foreground truncate text-xs">Read only<span className="hidden sm:inline">: the money app cannot send, delete or change mail</span></div>
            </div>
          </div>
          <button type="button" className={`${btn} ${cta}`} disabled={!!busy}
            onClick={() => { setBusy("link"); setError(""); linkGmail(status.mailboxes.length).then(setStatus).catch((e) => setError(e.message)).finally(() => setBusy(null)); }}>
            {busy === "link" ? <Icons.Spinner className="size-3.5 animate-spin" /> : <Icons.Plus className="size-3.5" />} Link a Gmail
          </button>
        </div>
        {status.mailboxes.length > 0 && (
          <div className="divide-y border-t">
            {status.mailboxes.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{m.email}</div>
                  {m.error && <div className="text-warning text-xs">{m.error}</div>}
                </div>
                <Pill tone={m.error ? "warn" : "ok"} text={m.error ? "Link again" : "Linked"} />
                {confirmUnlink === m.id ? (
                  <>
                    <button type="button" className={`${btn} !border-destructive/50 !text-destructive h-7`} disabled={!!busy}
                      onClick={() => run(`unlink:${m.id}`, () => call<Status>("DELETE", `/mailboxes/${m.id}`)).then(() => setConfirmUnlink(null))}>Unlink</button>
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
        )}
      </div>

      {status.banks.map((b) => {
        const imported = b.imported && !("error" in b.imported) ? b.imported : null;
        const warn = b.error || (b.problems?.length ?? 0) > 0;
        return (
          <div key={b.id} className="bg-card rounded-xl border">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              {b.hasLogo ? <RoundLogo url={logoSrc(b)} name={b.bankName} className="size-10" /> : (
                <span className="bg-muted flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full">
                  <Icons.Building className="text-primary size-5" />
                </span>
              )}
              <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-0">
                <div className="truncate text-sm font-semibold">{b.accountName || b.bankName}</div>
                <div className="text-muted-foreground truncate text-xs">
                  {[b.bankName, b.currency, mailOf(b.mailboxId), b.emails != null && `${b.emails} emails`, b.lastCheck && `checked ${when(b.lastCheck)}`].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-3">
              {b.enabled ? <Pill tone={warn ? "warn" : "ok"} text={warn ? "Needs a look" : "Reading"} /> : <Pill tone="off" text="Off" />}
              <Switch checked={b.enabled} disabled={!!busy} aria-label={`Read ${b.bankName}`}
                onCheckedChange={(v) => run(`on:${b.id}`, () => call<Status>("PUT", `/banks/${b.id}`, { ...b, enabled: v }))} />
              <button type="button" className={`${btn} h-8`} disabled={!!busy} onClick={() => setEditing({ id: b.id, start: { ...blank(), ...b } })}>
                <Icons.Pencil className="size-3.5" /> Edit
              </button>
              </div>
            </div>
            {b.error && <p className="text-warning px-4 pb-3 text-xs">{b.error}</p>}
            {!b.error && (b.problems?.length ?? 0) > 0 && (
              <p className="text-warning px-4 pb-3 text-xs">
                {b.problems!.length} matching {b.problems!.length === 1 ? "email" : "emails"} could not be read, e.g. "{b.problems![0].subject}": {b.problems![0].problems.join(". ")}
              </p>
            )}
            {imported && imported.added > 0 && !b.error && <p className="text-muted-foreground px-4 pb-3 text-xs">{imported.added} new on the last check.</p>}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">
          {status.banks.length ? (status.lastRun ? `Checked ${when(status.lastRun)}. Every 5 minutes.` : "Not checked yet.") : "No bank set up yet."}
        </span>
        <div className="flex flex-wrap gap-2">
          {status.banks.length > 0 && (
            <button type="button" className={btn} disabled={!!busy} onClick={() => run("check", () => call<Status>("POST", "/run", {}))}>
              {busy === "check" ? <Icons.Spinner className="size-3.5 animate-spin" /> : <Icons.RefreshCw className="size-3.5" />} Check now
            </button>
          )}
          <button type="button" className={`${btn} ${cta}`} disabled={!!busy || !status.mailboxes.length}
            onClick={() => setEditing({ id: null, start: blank(status.mailboxes[0]?.id ?? "") })}>
            <Icons.Plus className="size-3.5" /> Add a bank
          </button>
        </div>
      </div>
      {!status.mailboxes.length && <p className="text-muted-foreground text-xs">Link the Gmail your bank's alerts land in first.</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}

      {editing && (
        <Editor open onClose={() => setEditing(null)} start={editing.start} bankId={editing.id} status={status} onSaved={setStatus} />
      )}
    </section>
  );
}
