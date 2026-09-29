// money-hub patch: Google Drive backups, copied from Owly (web/src/components/DriveBackup.jsx
// and web/src/googlePicker.js) and drawn with Wealthfolio's own components. The work runs in
// the money-hub backup service at /drive-backup (server/drive-backup in the money-hub repo),
// which keeps the Google pass; this page only asks it to.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Alert, AlertDescription } from "@wealthfolio/ui/components/ui/alert";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Checkbox } from "@wealthfolio/ui/components/ui/checkbox";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Label } from "@wealthfolio/ui/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@wealthfolio/ui/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@wealthfolio/ui/components/ui/sheet";
import { Switch } from "@wealthfolio/ui/components/ui/switch";

const BASE = "/drive-backup/api/backup";
export const DEFAULT_FOLDER_NAME = "Money Backups";
// Radix Select items cannot have an empty value, so "top level" gets its own token.
const TOP = "__top__";
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const KEEP: [number, string][] = [[7, "Last 7"], [14, "Last 14"], [30, "Last 30"], [60, "Last 60"], [90, "Last 90"], [0, "Keep them all"]];
const TIMES = Array.from({ length: 96 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, "0");
  const m = String((i % 4) * 15).padStart(2, "0");
  return `${h}:${m}`;
});

interface RunResult {
  ok: boolean;
  at: string;
  file?: string;
  size?: number;
  accounts?: number;
  activities?: number;
  assets?: number;
  files?: number;
  error?: string;
}
interface Status {
  linked: boolean;
  email: string | null;
  linkedAt: string | null;
  needsRelink: boolean;
  linkExpiresAt: string | null;
  folderId: string | null;
  folderName: string | null;
  schedule: { auto: boolean; frequency: "daily" | "weekly"; weekday: number; time: string; keep: number };
  timezone: string;
  nextRunAt: string | null;
  lastAuto: RunResult | null;
  lastManual: RunResult | null;
  busy: string | null;
}
interface DriveFolder { id: string; name: string; parentId?: string | null; atTop?: boolean }
interface DriveFile { id: string; name: string; createdTime: string; size: number | null; auto: boolean; folderName?: string | null; picked?: boolean }

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: body instanceof FormData || body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `The backup service said ${res.status}`);
  return data as T;
}
const api = {
  get: <T,>(p: string) => call<T>("GET", p),
  post: <T,>(p: string, b?: unknown) => call<T>("POST", p, b ?? {}),
  put: <T,>(p: string, b: unknown) => call<T>("PUT", p, b),
  del: <T,>(p: string) => call<T>("DELETE", p),
  upload: <T,>(p: string, fd: FormData) => call<T>("POST", p, fd),
};

export function GoogleDriveMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 87.3 78" aria-hidden="true">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  );
}

const bytes = (n?: number | null) => {
  if (!n && n !== 0) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

/** "Sun 27 Sep, 02:00" on the app's clock, the same clock the schedule runs on. */
export const when = (iso?: string | null, zone?: string) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      timeZone: zone || undefined, weekday: "short", day: "numeric", month: "short",
      year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return new Date(iso).toLocaleString();
  }
};

/** Waits for Wealthfolio to come back on the restored data, then reloads. */
async function waitForRestart() {
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    await new Promise((r) => setTimeout(r, 1500));
    const ok = await fetch("/", { cache: "no-store" }).then((r) => r.ok).catch(() => false);
    if (ok && Date.now() - started > 4000) break;
  }
  window.location.assign("/");
}

/** Google's picker is an iframe that needs Google's cookies: Safari and iPhone block them. */
export function pickerSupported() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = /^((?!chrome|chromium|crios|fxios|edg|android).)*safari/i.test(ua);
  return !ios && !safari;
}

/** Google's picker runs in its own window (Wealthfolio's pages do not allow Google's scripts). */
function openPicker(kind: "folder" | "file", parentId?: string): Promise<{ id: string; name: string } | null> {
  const q = new URLSearchParams({ kind, ...(parentId ? { parent: parentId } : {}) });
  const win = window.open(`/drive-backup/picker?${q}`, "money-drive-picker", "width=1000,height=720");
  if (!win) return Promise.reject(new Error("Your browser blocked the Google window. Allow pop-ups for this site and try again."));
  return new Promise((resolve, reject) => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== "money-drive-pick") return;
      cleanup();
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.pick ?? null);
    };
    const timer = setInterval(() => { if (win.closed) { cleanup(); resolve(null); } }, 800);
    const cleanup = () => { clearInterval(timer); window.removeEventListener("message", onMsg); };
    window.addEventListener("message", onMsg);
  });
}
const pickFolder = () => openPicker("folder");
const pickBackupFile = (folderId?: string) => openPicker("file", folderId);

/**
 * Opens Google's consent screen in a small window and waits for the server to
 * say the link landed. Call straight from a click, so no popup blocker fires.
 */
function linkDrive(loginHint: string | undefined, before: string | null): Promise<Status> {
  const win = window.open("about:blank", "money-drive-link", "width=520,height=680");
  if (!win) return Promise.reject(new Error("Your browser blocked the Google window. Allow pop-ups for this site and try again."));
  return new Promise((resolve, reject) => {
    let done = false;
    let closedChecks = 0;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      window.removeEventListener("message", onMsg);
      fn();
    };
    const check = async () => {
      try {
        const s = await api.get<Status>("/status");
        if (s.linked && !s.needsRelink && s.linkedAt !== before) { finish(() => resolve(s)); return true; }
      } catch { /* keep waiting */ }
      return false;
    };
    const onMsg = (e: MessageEvent) => { if (e.origin === window.location.origin && e.data?.type === "money-drive-link") void check(); };
    window.addEventListener("message", onMsg);
    const timer = setInterval(async () => {
      if (await check()) return;
      if (win.closed && ++closedChecks > 2) finish(() => reject(new Error("Google Drive was not linked (the Google window was closed).")));
    }, 1500);
    setTimeout(() => finish(() => reject(new Error("Linking took too long. Try again."))), 10 * 60_000);
    api.post<{ url: string }>("/link", { loginHint })
      .then((r) => { win.location.href = r.url; })
      .catch((err) => { try { win.close(); } catch { /* already gone */ } finish(() => reject(err)); });
  });
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3 sm:px-6">
      <span className="text-muted-foreground shrink-0 text-sm">{label}</span>
      <span className="flex min-w-0 items-center gap-3 text-sm font-medium">{children}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Choice<T extends string | number>({ value, options, disabled, onChange }: {
  value: T; options: [T, string][]; disabled?: boolean; onChange: (v: T) => void;
}) {
  return (
    <Select value={String(value)} disabled={disabled} onValueChange={(v) => onChange((typeof value === "number" ? Number(v) : v) as T)}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => <SelectItem key={String(v)} value={String(v)}>{l}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function DriveBackupTab() {
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [sheet, setSheet] = useState<"folder" | "restore" | null>(null);

  const load = useCallback(() => api.get<Status>("/status").then(setSt).catch((e: Error) => setErr(e.message)), []);
  useEffect(() => { void load(); }, [load]);

  const canPick = pickerSupported();
  const useFolder = async (folder: { id: string; name: string }) => {
    setSt(await api.put<Status>("/config", { folderId: folder.id, folderName: folder.name }));
    return folder;
  };
  /** Right after linking: Google's picker where it works (closing it = "Money Backups");
   *  on iPhone, iPad and Safari straight to "Money Backups", changeable with Change. */
  const firstFolder = async () => {
    let folder: { id: string; name: string } | null = null;
    if (canPick) { try { folder = await pickFolder(); } catch { /* picker failed: default below */ } }
    return useFolder(folder || await api.post<DriveFolder>("/folders/default"));
  };

  const act = (key: string, fn: () => Promise<string | null | void>) => async () => {
    setBusy(key); setErr(""); setMsg(null);
    try {
      const out = await fn();
      if (typeof out === "string") setMsg(out);
    } catch (e) {
      setErr((e as Error).message);
      void load();
    } finally {
      setBusy("");
    }
  };

  const save = (patch: Record<string, unknown>) => act("save", async () => { setSt(await api.put<Status>("/config", patch)); })();

  // Opens Google's window itself, before any await, so it is not blocked.
  const link = act("link", async () => {
    const next = await linkDrive(st?.email || undefined, st?.linkedAt || null);
    setSt(next);
    const folder = next.folderId ? { id: next.folderId, name: next.folderName || "" } : await firstFolder();
    return `Linked. Backups go to “${folder.name}”. Turn on automatic backups below.`;
  });

  const zone = st?.timezone;
  const s = st?.schedule;
  const runs = [st?.lastAuto, st?.lastManual].filter(Boolean) as RunResult[];
  const last = runs.sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  const lastGood = runs.filter((r) => r.ok).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  const running = !!(s?.auto && st?.folderId && !st?.needsRelink);

  return (
    <Card className="overflow-hidden shadow-none">
      <CardHeader className="gap-4 space-y-0 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="text-lg leading-6">Google Drive</CardTitle>
            <CardDescription className="leading-relaxed">
              Everything the money app holds, in one file in your Google Drive: every account, entry, property,
              the Rental page and its settings, and the app's keys and login. A new server comes back from one of
              these in about a minute.
            </CardDescription>
          </div>
          {st?.linked && s ? (
            <Badge variant={running ? "default" : "secondary"} className={running ? "bg-success text-success-foreground" : ""}>
              {running ? "Automatic" : "Off"}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-0 p-0">
        {err ? (
          <div className="px-5 pb-4 sm:px-6"><Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert></div>
        ) : null}
        {msg ? (
          <div className="px-5 pb-4 sm:px-6"><Alert><AlertDescription>{msg}</AlertDescription></Alert></div>
        ) : null}

        {!st ? (
          <div className="text-muted-foreground flex items-center gap-2 px-5 pb-6 text-sm sm:px-6">
            <Icons.Spinner className="size-4 animate-spin" aria-hidden /> Loading…
          </div>
        ) : !st.linked || st.needsRelink ? (
          <div className="space-y-3 px-5 pb-6 sm:px-6">
            {st.needsRelink ? (
              <Alert variant="destructive"><AlertDescription>
                Google stopped accepting the money app’s access to {st.email || "your Drive"}, so backups have stopped. Link it again.
              </AlertDescription></Alert>
            ) : null}
            <div className="grid gap-2 md:flex md:flex-wrap">
              <Button className="h-11" disabled={!!busy} onClick={link}>
                {busy === "link" ? <Icons.Spinner className="mr-2 size-4 animate-spin" aria-hidden /> : <span className="mr-2"><GoogleDriveMark /></span>}
                {busy === "link" ? "Waiting for Google…" : "Link Google Drive"}
              </Button>
              <Button className="h-11" variant="outline" asChild>
                <a href={`${BASE}/download`}><Icons.Download className="mr-2 size-4" aria-hidden />Download a backup file</a>
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">The money app only sees the folder it makes or you choose, never the rest of your Drive.</p>
          </div>
        ) : (
          <>
            {st.linkExpiresAt ? (
              <div className="px-5 pb-4 sm:px-6">
                <Alert><AlertDescription className="space-y-3">
                  <span>Google will cut this link on {when(st.linkExpiresAt, zone)}: it was made while the Google Cloud app was still in Testing. Link again to get one that lasts.</span>
                  <Button size="sm" disabled={!!busy} onClick={link}>{busy === "link" ? "Waiting for Google…" : "Link again"}</Button>
                </AlertDescription></Alert>
              </div>
            ) : null}

            <div className="divide-y border-t">
              <Row label="Account">
                <span className="truncate">{st.email}</span>
                <Button variant="link" size="sm" className="text-destructive h-auto p-0" disabled={!!busy}
                  onClick={act("unlink", async () => {
                    if (!window.confirm("Unlink Google Drive? Automatic backups stop. Backups already in Drive stay there.")) return null;
                    setSt(await api.del<Status>("/link"));
                    return "Google Drive unlinked.";
                  })}>Unlink</Button>
              </Row>
              <Row label="Folder">
                {st.folderId ? (
                  <a className="inline-flex min-w-0 items-center gap-1.5 hover:underline" href={`https://drive.google.com/drive/folders/${st.folderId}`} target="_blank" rel="noreferrer">
                    <span className="truncate">{st.folderName}</span><Icons.ExternalLink className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                  </a>
                ) : <span>Not chosen yet</span>}
                <Button variant="link" size="sm" className="h-auto p-0" disabled={!!busy} onClick={() => setSheet("folder")}>
                  {st.folderId ? "Change" : "Choose"}
                </Button>
              </Row>
              <Row label="Last backup"><span>{lastGood ? when(lastGood.at, zone) : "None yet"}</span></Row>
              <Row label="Next backup">
                <span>{st.nextRunAt ? when(st.nextRunAt, zone) : s?.auto ? "Choose a folder first" : "Automatic backups are off"}</span>
              </Row>
            </div>

            <div className="space-y-4 border-t px-5 py-5 sm:px-6">
              {last && !last.ok ? (
                <Alert variant="destructive"><AlertDescription>
                  The {last === st.lastAuto ? "automatic" : "last"} backup on {when(last.at, zone)} failed: {last.error}
                </AlertDescription></Alert>
              ) : null}
              {lastGood ? (
                <p className="text-muted-foreground text-xs">
                  {lastGood.file} · {bytes(lastGood.size)}
                  {lastGood.activities != null && ` · ${lastGood.accounts} accounts, ${lastGood.activities} entries, ${lastGood.assets} assets, ${lastGood.files} files`}
                </p>
              ) : null}

              <label className="flex items-center gap-3 text-sm">
                <Switch checked={!!s?.auto} disabled={!!busy || !st.folderId} onCheckedChange={(v) => save({ auto: v })} />
                <span>Back up automatically <span className="text-muted-foreground">· {st.folderId ? `on ${zone} time` : "choose a folder first"}</span></span>
              </label>

              {s?.auto ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="How often">
                      <Choice value={s.frequency} disabled={!!busy} onChange={(v) => save({ frequency: v })}
                        options={[["daily", "Every day"], ["weekly", "Once a week"]]} />
                    </Field>
                    {s.frequency === "weekly" ? (
                      <Field label="On">
                        <Choice value={s.weekday} disabled={!!busy} onChange={(v) => save({ weekday: v })}
                          options={WEEKDAYS.map((d, i) => [i, d] as [number, string])} />
                      </Field>
                    ) : null}
                    <Field label="At">
                      <Choice value={s.time} disabled={!!busy} onChange={(v) => save({ time: v })}
                        options={TIMES.map((t) => [t, t] as [string, string])} />
                    </Field>
                    <Field label="Keep">
                      <Choice value={s.keep} disabled={!!busy} onChange={(v) => save({ keep: v })} options={KEEP} />
                    </Field>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Older automatic backups go to the Drive bin. Ones you make with Back up now are never removed.
                  </p>
                </>
              ) : null}

              <div className="grid gap-2 md:flex md:flex-wrap">
                <Button className="h-11" disabled={!!busy || !st.folderId}
                  onClick={act("run", async () => {
                    const next = await api.post<Status>("/run");
                    setSt(next);
                    const r = next.lastManual;
                    return `Saved ${r?.file} (${bytes(r?.size)}) to ${next.folderName}.`;
                  })}>
                  {busy === "run" ? <Icons.Spinner className="mr-2 size-4 animate-spin" aria-hidden /> : <Icons.Upload className="mr-2 size-4" aria-hidden />}
                  {busy === "run" ? "Backing up…" : "Back up now"}
                </Button>
                <Button className="h-11" variant="outline" disabled={!!busy} onClick={() => setSheet("restore")}>
                  <Icons.History className="mr-2 size-4" aria-hidden />Restore…
                </Button>
                <Button className="h-11" variant="ghost" asChild>
                  <a href={`${BASE}/download`}><Icons.Download className="mr-2 size-4" aria-hidden />Download file</a>
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>

      <FolderSheet open={sheet === "folder"} currentId={st?.folderId ?? null} canBrowse={canPick} onClose={() => setSheet(null)}
        onChosen={async (f) => {
          setSt(await api.put<Status>("/config", { folderId: f.id, folderName: f.name }));
          setSheet(null);
          setErr("");
          setMsg(`Backups go to “${f.name}”.`);
        }} />
      {st ? <RestoreSheet open={sheet === "restore"} status={st} canPick={canPick} onClose={() => setSheet(null)} /> : null}
    </Card>
  );
}

/**
 * The folders the app can see as a tree from My Drive: top-level first, each
 * folder right under the one it sits in. One whose parent it cannot see goes
 * in a second list, since where it lives is unknown.
 */
export function folderTree(folders: DriveFolder[]) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const kids = new Map<string, DriveFolder[]>();
  for (const f of folders) {
    if (!f.atTop && f.parentId && byId.has(f.parentId)) kids.set(f.parentId, [...(kids.get(f.parentId) || []), f]);
  }
  const byName = (a: DriveFolder, b: DriveFolder) => a.name.localeCompare(b.name);
  const seen = new Set<string>();
  type Line = { folder: DriveFolder; depth: number; path: string };
  const walk = (f: DriveFolder, depth: number, trail: string, out: Line[]) => {
    if (seen.has(f.id)) return;
    seen.add(f.id);
    const here = `${trail} › ${f.name}`;
    out.push({ folder: f, depth, path: here });
    for (const k of (kids.get(f.id) || []).sort(byName)) walk(k, depth + 1, here, out);
  };
  const top: Line[] = [];
  for (const f of folders.filter((x) => x.atTop).sort(byName)) walk(f, 0, "My Drive", top);
  const elsewhere: Line[] = [];
  for (const f of folders.filter((x) => !seen.has(x.id) && !(x.parentId && byId.has(x.parentId))).sort(byName)) walk(f, 0, "Another folder", elsewhere);
  for (const f of folders.filter((x) => !seen.has(x.id)).sort(byName)) walk(f, 0, "Another folder", elsewhere);
  return { top, elsewhere };
}

function FolderSheet({ open, currentId, canBrowse, onClose, onChosen }: {
  open: boolean; currentId: string | null; canBrowse: boolean; onClose: () => void; onChosen: (f: { id: string; name: string }) => Promise<void>;
}) {
  const [folders, setFolders] = useState<DriveFolder[] | null>(null);
  const [name, setName] = useState(DEFAULT_FOLDER_NAME);
  const [parent, setParent] = useState(TOP);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setFolders(null);
    api.get<DriveFolder[]>("/folders")
      .then((f) => { setFolders(f); if (f.some((x) => x.name === DEFAULT_FOLDER_NAME)) setName(""); })
      .catch((e: Error) => { setFolders([]); setErr(e.message); });
  }, [open]);

  const tree = folders ? folderTree(folders) : { top: [], elsewhere: [] };
  const rows = [...tree.top, ...tree.elsewhere];

  const choose = async (key: string, get: () => Promise<{ id: string; name: string } | null>) => {
    setBusy(key); setErr("");
    try {
      const f = await get();
      if (f) await onChosen(f);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const line = (r: { folder: DriveFolder; depth: number; path: string }) => {
    const f = r.folder;
    const inUse = f.id === currentId;
    return (
      <button key={f.id} type="button" title={r.path} disabled={!!busy || inUse}
        className="hover:bg-muted/60 flex w-full items-center gap-2 rounded-md py-2.5 pr-3 text-left text-sm disabled:opacity-100"
        style={{ paddingLeft: 12 + r.depth * 18 }}
        onClick={() => choose(f.id, async () => f)}>
        <Icons.Folder className={`size-4 shrink-0 ${inUse ? "text-primary" : "text-muted-foreground"}`} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{f.name}</span>
        {busy === f.id ? <Icons.Spinner className="size-4 animate-spin" aria-hidden />
          : inUse ? <span className="text-primary inline-flex items-center gap-1 text-xs"><Icons.Check className="size-3.5" /> In use</span>
            : <span className="text-primary text-xs">Use</span>}
      </button>
    );
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <SheetContent className="flex flex-col gap-4 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Backup folder</SheetTitle>
          <SheetDescription>Google only lets the money app see folders it made or you chose, never the rest of your Drive.</SheetDescription>
        </SheetHeader>
        {err ? <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert> : null}
        {canBrowse ? (
          <Button variant="outline" disabled={!!busy} onClick={() => choose("browse", pickFolder)}>
            {busy === "browse" ? <Icons.Spinner className="mr-2 size-4 animate-spin" aria-hidden /> : <span className="mr-2"><GoogleDriveMark size={17} /></span>}
            {busy === "browse" ? "Opening Google Drive…" : "Browse Google Drive"}
          </Button>
        ) : null}
        <div className="space-y-1">
          <h4 className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.18em]">Your folders</h4>
          {folders === null ? (
            <p className="text-muted-foreground text-sm">Looking in your Drive…</p>
          ) : (
            <>
              <div className="text-muted-foreground flex items-center gap-2 px-1 py-1 text-xs"><Icons.Cloud className="size-4" aria-hidden /> My Drive</div>
              {tree.top.length === 0 ? <p className="text-muted-foreground px-1 text-sm">No folders yet. Make one below.</p> : null}
              {tree.top.map(line)}
              {tree.elsewhere.length > 0 ? (
                <>
                  <div className="text-muted-foreground px-1 pt-3 text-xs">Inside folders the money app cannot see</div>
                  {tree.elsewhere.map(line)}
                </>
              ) : null}
            </>
          )}
        </div>
        <div className="space-y-3 border-t pt-4">
          <h4 className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.18em]">New folder</h4>
          <Field label="Make it in">
            <Choice value={parent} disabled={!!busy} onChange={setParent}
              options={[[TOP, "My Drive (top level)"], ...rows.map((r) => [r.folder.id, r.path] as [string, string])]} />
          </Field>
          <div className="flex gap-2">
            <Input value={name} maxLength={120} placeholder="Folder name" onChange={(e) => setName(e.target.value)} />
            <Button disabled={!!busy || !name.trim()}
              onClick={() => choose("new", () => api.post<DriveFolder>("/folders", { name, parentId: parent === TOP ? undefined : parent }))}>
              {busy === "new" ? <Icons.Spinner className="mr-2 size-4 animate-spin" aria-hidden /> : <Icons.Plus className="mr-2 size-4" aria-hidden />}
              Make and use
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Pick a backup (from the folder, or a file from this device), confirm, and
 * put it back. What is here now is saved to Drive first unless unticked.
 */
function RestoreSheet({ open, status, canPick, onClose }: { open: boolean; status: Status; canPick: boolean; onClose: () => void }) {
  const zone = status.timezone;
  const canDrive = !!status.linked && !status.needsRelink;
  const [files, setFiles] = useState<DriveFile[] | null>(canDrive ? null : []);
  const [pick, setPick] = useState<DriveFile | null>(null);
  const [upload, setUpload] = useState<File | null>(null);
  const [safety, setSafety] = useState(canDrive && !!status.folderId);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ createdAt: string; counts: Record<string, number>; mismatched: string[]; files: number; settings: number } | null>(null);

  useEffect(() => {
    if (!open || !canDrive) return;
    setFiles(null);
    api.get<DriveFile[]>(`/files${status.folderId ? "" : "?all=1"}`)
      .then((f) => { setFiles(f); if (f[0]) setPick(f[0]); })
      .catch((e: Error) => { setFiles([]); setErr(e.message); });
  }, [open, canDrive, status.folderId]);

  const other = async () => {
    setErr(""); setBusy("Opening Google Drive…");
    try {
      const f = await pickBackupFile(status.folderId || undefined);
      if (f) { setPick({ id: f.id, name: f.name, createdTime: "", size: null, auto: false, picked: true }); setUpload(null); setSure(false); }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const chosen = upload ? upload.name : pick ? (pick.picked ? pick.name : when(pick.createdTime, zone)) : null;

  const restore = async () => {
    setErr("");
    try {
      if (safety) {
        setBusy("Saving what is here now to Drive first…");
        await api.post("/run");
      }
      setBusy("Restoring… the money app restarts on the restored data.");
      let res;
      if (upload) {
        const fd = new FormData();
        fd.append("file", upload);
        res = await api.upload<typeof done>("/restore-file", fd);
      } else {
        res = await api.post<typeof done>("/restore", { fileId: pick?.id });
      }
      setDone(res);
      setBusy("Reloading…");
      await waitForRestart();
    } catch (e) {
      setErr((e as Error).message);
      setBusy("");
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <SheetContent className="flex flex-col gap-4 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{done ? "Restored" : "Restore a backup"}</SheetTitle>
          <SheetDescription>{done ? "The money app is back on the restored data." : "Put the money app back to how it was when a backup was made."}</SheetDescription>
        </SheetHeader>
        {done ? (
          <>
            <Alert><AlertDescription>
              Back to {when(done.createdAt, zone)}: {done.counts.accounts} accounts, {done.counts.activities} entries,
              {" "}{done.counts.assets} assets, {done.files} files and {done.settings} settings.
            </AlertDescription></Alert>
            {done.mismatched?.length ? <Alert variant="destructive"><AlertDescription>Did not match the backup: {done.mismatched.join("; ")}</AlertDescription></Alert> : null}
            <p className="text-muted-foreground flex items-center gap-2 text-sm"><Icons.Spinner className="size-4 animate-spin" aria-hidden /> {busy || "Reloading…"}</p>
          </>
        ) : (
          <>
            {err ? <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert> : null}
            {canDrive ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.18em]">
                    {status.folderName ? `In ${status.folderName}` : "In your Google Drive"}
                  </h4>
                  {canPick ? <Button variant="link" size="sm" className="h-auto p-0" disabled={!!busy} onClick={other}>Other file…</Button> : null}
                </div>
                {pick?.picked && !upload ? (
                  <div className="border-primary flex items-center gap-2 rounded-md border px-3 py-2.5 text-sm">
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{pick.name}</span><span className="text-muted-foreground text-xs">Picked from Google Drive</span></span>
                    <Icons.Check className="text-primary size-4" />
                  </div>
                ) : null}
                {files === null ? (
                  <p className="text-muted-foreground text-sm">Looking in your Drive…</p>
                ) : files.length === 0 ? (
                  !err ? <p className="text-muted-foreground text-sm">No money app backups there yet.</p> : null
                ) : (
                  <div className="max-h-64 space-y-1.5 overflow-y-auto">
                    {files.map((f) => {
                      const on = !upload && pick?.id === f.id;
                      return (
                        <button key={f.id} type="button" disabled={!!busy}
                          className={`flex w-full items-center gap-2 rounded-md border px-3 py-2.5 text-left text-sm ${on ? "border-primary" : "hover:bg-muted/60"}`}
                          onClick={() => { setPick(f); setUpload(null); setSure(false); }}>
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">{when(f.createdTime, zone)}</span>
                            <span className="text-muted-foreground text-xs">{f.auto ? "Automatic" : "Made by hand"} · {bytes(f.size)}{f.folderName ? ` · ${f.folderName}` : ""}</span>
                          </span>
                          {on ? <Icons.Check className="text-primary size-4 shrink-0" /> : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            <div className="space-y-2 border-t pt-4">
              <h4 className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.18em]">Or a file from this device</h4>
              <Input type="file" accept=".gz,.tgz,application/gzip" disabled={!!busy}
                onChange={(e) => { setUpload(e.target.files?.[0] || null); setSure(false); }} />
            </div>

            {chosen ? (
              <div className="space-y-3 border-t pt-4">
                <Alert><AlertDescription>
                  This replaces everything in the money app with the backup from {chosen}: accounts, entries,
                  properties, the Rental page and settings. Anything added since then is gone. What is here now is
                  also kept on the server, in case.
                </AlertDescription></Alert>
                {canDrive && status.folderId ? (
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox checked={safety} disabled={!!busy} onCheckedChange={(v) => setSafety(v === true)} />
                    <span>Save what is here now to Drive first <span className="text-muted-foreground">· so this can be undone</span></span>
                  </label>
                ) : null}
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={sure} disabled={!!busy} onCheckedChange={(v) => setSure(v === true)} />
                  <span>I understand this replaces what is here now</span>
                </label>
                <Button className="w-full" disabled={!sure || !!busy} onClick={restore}>
                  {busy ? <Icons.Spinner className="mr-2 size-4 animate-spin" aria-hidden /> : null}
                  {busy || "Restore this backup"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
