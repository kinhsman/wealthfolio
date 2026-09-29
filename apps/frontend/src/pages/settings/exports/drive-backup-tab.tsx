// money-hub patch: backups to Google Drive and to this device, laid out like WheelTradr's
// Settings, Data & Backup (DataBackupSettings.tsx, DriveFolderChooser.tsx,
// RestoreBackupModal.tsx) in Wealthfolio's colours and components. The work runs in the
// money-hub backup service at /drive-backup (Owly's backup code, server/drive-backup in the
// money-hub repo), which keeps the Google pass and runs the schedule with the browser shut.
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@wealthfolio/ui/components/ui/dialog";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Switch } from "@wealthfolio/ui/components/ui/switch";

const BASE = "/drive-backup/api/backup";
const DEFAULT_FOLDER_NAME = "Money Backups";

// ---------- the service (same endpoints as Owly's /api/backup) ----------
interface RunResult { ok: boolean; at: string; file?: string; size?: number; trimmed?: number; accounts?: number; activities?: number; assets?: number; files?: number; error?: string }
interface Schedule { auto: boolean; frequency: "daily" | "weekly"; weekday: number; time: string; keep: number }
interface Status {
  linked: boolean; email: string | null; linkedAt: string | null; needsRelink: boolean; linkExpiresAt: string | null;
  folderId: string | null; folderName: string | null; schedule: Schedule; timezone: string; nextRunAt: string | null;
  lastAuto: RunResult | null; lastManual: RunResult | null; busy: string | null;
}
interface DriveFolder { id: string; name: string; parentId?: string | null; atTop?: boolean }
interface DriveFile { id: string; name: string; createdTime: string; size: number | null; auto: boolean; folderName?: string | null }
interface Manifest { createdAt: string; counts: { accounts: number; activities: number; assets: number; quotes: number }; data: { files: number; bytes: number }; env: string[]; helper?: string[] }
interface RestoreDone { createdAt: string; counts: Manifest["counts"]; mismatched: string[]; files: number; settings: number }

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: isForm || body === undefined ? undefined : { "Content-Type": "application/json" },
    body: isForm ? (body as FormData) : body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `The backup service said ${res.status}`);
  return data as T;
}
const api = {
  status: () => call<Status>("GET", "/status"),
  saveConfig: (patch: Record<string, unknown>) => call<Status>("PUT", "/config", patch),
  backupNow: () => call<Status>("POST", "/run", {}),
  unlink: () => call<Status>("DELETE", "/link"),
  listFolders: () => call<DriveFolder[]>("GET", "/folders"),
  createFolder: (name: string, parentId?: string) => call<DriveFolder>("POST", "/folders", { name, parentId }),
  ensureDefaultFolder: () => call<DriveFolder>("POST", "/folders/default", {}),
  listBackups: (folderId: string | null) => call<DriveFile[]>("GET", `/files${folderId ? "" : "?all=1"}`),
  inspect: (fileId: string) => call<Manifest>("POST", "/inspect", { fileId }),
  restoreDrive: (fileId: string) => call<RestoreDone>("POST", "/restore", { fileId }),
  restoreFile: (file: File) => { const fd = new FormData(); fd.append("file", file); return call<RestoreDone>("POST", "/restore-file", fd); },
};

/** Google's picker needs Google's cookies: Safari and iPhone block them (WheelTradr, Owly). */
function pickerSupported() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = /^((?!chrome|chromium|crios|fxios|edg|android).)*safari/i.test(ua);
  return !ios && !safari;
}

/** Google's picker runs in its own window: Wealthfolio's pages do not allow Google's scripts. */
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

/** Google's consent in a small window; opened before any await so no pop-up blocker fires. */
function linkDrive(loginHint: string | undefined, before: string | null): Promise<Status> {
  const win = window.open("about:blank", "money-drive-link", "width=520,height=680");
  if (!win) return Promise.reject(new Error("Your browser blocked the Google window. Allow pop-ups for this site and try again."));
  return new Promise((resolve, reject) => {
    let done = false;
    let closedChecks = 0;
    const finish = (fn: () => void) => { if (done) return; done = true; clearInterval(timer); window.removeEventListener("message", onMsg); fn(); };
    const check = async () => {
      try {
        const s = await api.status();
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
    call<{ url: string }>("POST", "/link", { loginHint })
      .then((r) => { win.location.href = r.url; })
      .catch((err) => { try { win.close(); } catch { /* already gone */ } finish(() => reject(err)); });
  });
}

/** manifest.json out of a local .tar.gz, in the browser, so a file shows what it holds before anything changes. */
async function readLocalManifest(file: File): Promise<Manifest> {
  const stream = file.stream().pipeThrough(new DecompressionStream("gzip"));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  const dec = new TextDecoder();
  for (let off = 0; off + 512 <= buf.length;) {
    const name = dec.decode(buf.subarray(off, off + 100)).replace(/\0.*$/s, "").replace(/^\.\//, "");
    if (!name) break;
    const size = parseInt(dec.decode(buf.subarray(off + 124, off + 136)).replace(/\0.*$/s, "").trim() || "0", 8);
    if (name === "manifest.json") return JSON.parse(dec.decode(buf.subarray(off + 512, off + 512 + size))) as Manifest;
    off += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error("That file is not a money app backup (no manifest inside).");
}

// ---------- small pieces (WheelTradr's, in Wealthfolio's colours) ----------
export function DriveLogo({ size = 20 }: { size?: number }) {
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

// Green = linked / running; amber only when it needs a look.
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

/** "Cloud" / "Local" over each box, so both sections read in the same two columns. */
function Col({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="text-muted-foreground px-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]">{label}</div>
      {children}
    </div>
  );
}

const when = (iso?: string | null, tz?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const thisYear = new Date().getFullYear() === d.getFullYear();
  return d.toLocaleString(undefined, { timeZone: tz, month: "short", day: "numeric", ...(thisYear ? {} : { year: "numeric" }), hour: "numeric", minute: "2-digit" });
};
const mb = (bytes?: number | null) => (bytes == null ? "" : bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1000))} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`);
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]; // server weekday: Monday = 0
const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
const KEEPS = [7, 14, 30, 60, 90, 0];
const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const scheduleText = (s: Schedule) => (s.frequency === "weekly" ? `${DAYS[s.weekday]}s at ${clock(s.time)}` : `Every day at ${clock(s.time)}`);
const zoneShort = (tz?: string) => {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? tz ?? "";
  } catch {
    return tz ?? "";
  }
};

type Note = { tone: "ok" | "bad" | "info" | "warn"; text: string };
type RestoreSource = { kind: "drive"; file: DriveFile | { id: string; name: string; createdTime?: string }; manifest: Manifest } | { kind: "file"; file: File; manifest: Manifest };

const btn = "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50";
const cta = "!border-primary/50 !text-primary";
const field = "h-9 rounded-md border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none disabled:opacity-50";

export function DriveBackupTab() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<null | "link" | "backup" | "folder" | "list" | "open" | "pick" | "save">(null);
  const [note, setNote] = useState<Note | null>(null);
  const [openDrive, setOpenDrive] = useState(false);
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [restore, setRestore] = useState<RestoreSource | null>(null);
  const [showFolders, setShowFolders] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { api.status().then(setStatus).catch(() => setStatus(null)); }, []);

  // Tiles side by side only when each has the room (measured on the box, as WheelTradr does).
  const gridRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setBoxWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const wide = boxWidth >= 2 * 240 + 14;
  const stack = !wide && boxWidth > 0 && boxWidth < 440;

  const tz = status?.timezone;
  const signedIn = !!status?.linked && !status.needsRelink;
  const linked = signedIn && !!status?.folderId;
  const sched = status?.schedule;
  const canPick = pickerSupported();
  const fail = (e: unknown) => setNote({ tone: "bad", text: (e as Error)?.message || String(e) });
  const run = (kind: NonNullable<typeof busy>, work: () => Promise<void>) => {
    setBusy(kind); setNote(null);
    work().catch(fail).finally(() => setBusy(null));
  };
  const loadFiles = async (folderId: string) => { setFiles(await api.listBackups(folderId)); };

  const useFolder = async (folder: { id: string; name: string }) => {
    setStatus(await api.saveConfig({ folderId: folder.id, folderName: folder.name }));
    await loadFiles(folder.id).catch(() => setFiles([]));
    return folder;
  };
  /** Right after linking: Google's picker where it works (closing it = "Money Backups");
   *  on iPhone, iPad and Safari straight to "Money Backups", changeable from the gear. */
  const firstFolder = async () => {
    let folder: { id: string; name: string } | null = null;
    if (canPick) { try { folder = await openPicker("folder"); } catch { /* picker failed: default below */ } }
    return useFolder(folder || await api.ensureDefaultFolder());
  };

  const link = () => {
    setBusy("link"); setNote(null);
    linkDrive(status?.email || undefined, status?.linkedAt || null)
      .then(async (s) => {
        setStatus(s);
        const folder = s.folderId ? { id: s.folderId, name: s.folderName || "" } : await firstFolder();
        setNote({ tone: "ok", text: `Linked. Backups go to "${folder?.name}". Turn on automatic backups with the gear.` });
      })
      .catch(fail)
      .finally(() => setBusy(null));
  };

  const onFolderChosen = async (folder: { id: string; name: string }) => {
    await useFolder(folder);
    setShowFolders(false);
    setNote({ tone: "ok", text: `Backups will now go to "${folder.name}".` });
  };

  const backupNow = () => run("backup", async () => {
    const next = await api.backupNow();
    setStatus(next);
    const r = next.lastManual;
    if (next.folderId) loadFiles(next.folderId).catch(() => { /* list is optional */ });
    setNote({ tone: "ok", text: `Backed up ${r?.accounts ?? 0} account${r?.accounts === 1 ? "" : "s"}, ${(r?.activities ?? 0).toLocaleString()} entries and ${r?.assets ?? 0} assets to "${next.folderName}" (${mb(r?.size)}).` });
  });

  const saveSchedule = (patch: Partial<Schedule>) => {
    if (!status) return;
    setStatus({ ...status, schedule: { ...status.schedule, ...patch } }); // feel instant
    run("save", async () => { setStatus(await api.saveConfig(patch)); });
  };

  const showDriveBackups = () => run("list", async () => { if (status?.folderId) await loadFiles(status.folderId); });

  const restoreFromDrive = (f: DriveFile | { id: string; name: string }) => {
    setOpeningId(f.id);
    run("open", async () => {
      try {
        setRestore({ kind: "drive", file: f, manifest: await api.inspect(f.id) });
      } finally { setOpeningId(null); }
    });
  };
  const pickFromDrive = () => run("pick", async () => {
    const f = await openPicker("file", status?.folderId || undefined);
    if (f) setRestore({ kind: "drive", file: f, manifest: await api.inspect(f.id) });
  });

  const unlink = () => run("save", async () => {
    if (!window.confirm("Unlink Google Drive? Automatic backups stop. Backups already in your Drive stay there.")) return;
    setStatus(await api.unlink());
    setFiles(null); setOpenDrive(false);
    setNote({ tone: "info", text: "Google Drive unlinked and automatic backups stopped. Backups already in your Drive stay there." });
  });

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setNote(null);
    readLocalManifest(file).then((manifest) => setRestore({ kind: "file", file, manifest })).catch(fail);
  };

  const driveSub = !status ? "Saved to a folder you choose"
    : status.needsRelink ? "Google stopped accepting the link. Link it again."
      : !signedIn ? "Saved to a folder you choose"
        : !status.folderId ? "Choose a folder to finish"
          : sched?.auto ? scheduleText(sched)
            : status.lastManual?.ok ? `Last backup ${when(status.lastManual.at, tz)}` : `Folder: ${status.folderName}`;
  const pill = status?.needsRelink ? { on: false, text: "Link again", warn: true }
    : linked && sched?.auto ? { on: true, text: sched.frequency === "weekly" ? "Auto weekly" : "Auto daily" }
      : linked ? { on: true, text: "Linked" } : { on: false, text: "Not linked" };
  const lastAuto = status?.lastAuto;

  const tile = (on: boolean) => `min-w-0 rounded-lg border bg-card transition-colors ${wide ? "flex flex-col gap-3.5 p-4" : `flex items-center gap-3 p-3 ${stack || on ? "flex-wrap" : ""}`} ${on ? "border-primary/60 ring-2 ring-primary/20" : ""}`;
  const actions = wide ? "mt-auto flex gap-2" : stack ? "flex basis-full gap-2" : "flex shrink-0 gap-2";
  const grow = wide || stack ? "flex-1" : "";
  const iconBox = "flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]";

  return (
    <div className="space-y-7">
      {/* 1. Back up */}
      <section className="space-y-3.5">
        <SectionTitle title="1. Back up" hint="Every account, entry, property and setting" />
        <div ref={gridRef} className={`grid ${wide ? "grid-cols-2 gap-3.5" : "grid-cols-1 gap-2.5"} ${openDrive ? "items-start" : ""}`}>
          {/* Google Drive */}
          <Col label="Cloud">
            <div className={`${tile(openDrive)} flex-1`}>
              <div className={`flex shrink-0 items-center ${wide ? "justify-between gap-2" : ""}`}>
                <span className={`${iconBox} bg-background border`}><DriveLogo /></span>
                {wide ? <StatusPill {...pill} /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`${wide ? "text-[15px]" : "text-sm"} truncate font-semibold`}>Google Drive</div>
                <div className={`mt-0.5 truncate text-xs ${status?.needsRelink ? "text-warning" : "text-muted-foreground"}`} title={status?.folderName || undefined}>
                  {wide || linked || status?.needsRelink ? driveSub : "Not linked"}
                </div>
                {signedIn && status?.email && !openDrive ? (
                  <div className="mt-1 flex min-w-0 items-center gap-1.5" title="Google account linked">
                    <Icons.CheckCircle className="text-success size-[13px] shrink-0" />
                    <span className="text-muted-foreground truncate font-mono text-xs">{status.email}</span>
                  </div>
                ) : null}
              </div>
              <div className={actions}>
                {linked ? (
                  <>
                    <button type="button" onClick={backupNow} disabled={busy !== null} className={`${btn} ${cta} min-w-0 ${grow}`}>
                      {busy === "backup" ? <Icons.RefreshCw className="size-3 shrink-0 animate-spin" /> : <Icons.Upload className="size-[13px] shrink-0" />}
                      <span className="truncate">{busy === "backup" ? "Backing up…" : "Back up now"}</span>
                    </button>
                    <button type="button" onClick={() => setOpenDrive((o) => !o)} aria-expanded={openDrive} aria-label="Google Drive settings" title="Google Drive settings"
                      className={`${btn} w-9 shrink-0 !px-0 ${openDrive ? "!border-primary/50 !bg-primary/10 !text-primary" : ""}`}>
                      <Icons.Settings className={`size-4 transition-transform duration-300 ${openDrive ? "rotate-90" : ""}`} />
                    </button>
                  </>
                ) : signedIn ? (
                  <button type="button" onClick={() => setShowFolders(true)} disabled={busy !== null} className={`${btn} ${cta} min-w-0 ${grow}`}>
                    <Icons.FolderOpen className="size-[13px] shrink-0" /><span className="truncate">Choose folder</span>
                  </button>
                ) : (
                  <button type="button" onClick={link} disabled={busy !== null} className={`${btn} ${cta} min-w-0 ${grow}`}>
                    {busy === "link" ? <Icons.RefreshCw className="size-3 shrink-0 animate-spin" /> : null}
                    <span className="truncate">{busy === "link" ? "Waiting for Google…" : status?.needsRelink ? "Link again" : "Link Google Drive"}</span>
                  </button>
                )}
              </div>
              {openDrive && linked && status ? (
                <div className={`w-full ${wide ? "" : "basis-full"} space-y-4 border-t pt-4`}>
                  <div className="divide-y overflow-hidden rounded-lg border">
                    <div className="bg-background flex items-center gap-3 px-3.5 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-muted-foreground text-xs">Google account</div>
                        <div className="flex min-w-0 items-center gap-1.5"><Icons.CheckCircle className="text-success size-[13px] shrink-0" /><span className="truncate text-sm">{status.email || "Linked"}</span></div>
                      </div>
                      <button type="button" onClick={unlink} disabled={busy !== null} className={`${btn} hover:!text-destructive`}>Unlink</button>
                    </div>
                    <div className="bg-background flex items-center gap-3 px-3.5 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-muted-foreground text-xs">Backup folder</div>
                        <a href={`https://drive.google.com/drive/folders/${status.folderId}`} target="_blank" rel="noopener noreferrer" className="hover:text-primary inline-flex max-w-full items-center gap-1 text-sm">
                          <span className="truncate">{status.folderName}</span><Icons.ExternalLink className="text-muted-foreground size-3 shrink-0" />
                        </a>
                      </div>
                      <button type="button" onClick={() => setShowFolders(true)} disabled={busy !== null} className={btn}>
                        <Icons.FolderOpen className="size-[13px]" />Change folder
                      </button>
                    </div>
                  </div>
                  {sched ? (
                    <div className="bg-background overflow-hidden rounded-lg border">
                      <div className="flex items-center gap-3 px-3.5 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">Automatic backups</div>
                          <div className="text-muted-foreground mt-0.5 text-xs">
                            {sched.auto && status.nextRunAt
                              ? `Next one ${when(status.nextRunAt, tz)} ${zoneShort(tz)}. Runs even with the money app closed.`
                              : "Saved on a schedule, even with the money app closed."}
                          </div>
                        </div>
                        <Switch checked={sched.auto} onCheckedChange={() => saveSchedule({ auto: !sched.auto })} aria-label="Automatic backups" />
                      </div>
                      {sched.auto ? (
                        <div className="grid grid-cols-2 gap-3 border-t px-3.5 py-3">
                          <label className="text-muted-foreground flex flex-col gap-1.5 text-[11px] font-medium">How often
                            <div className="bg-muted flex h-9 rounded-md border p-0.5">
                              {(["daily", "weekly"] as const).map((f) => (
                                <button key={f} type="button" onClick={() => saveSchedule({ frequency: f })}
                                  className={`flex-1 rounded-[6px] text-xs font-medium ${sched.frequency === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                                  {f === "daily" ? "Daily" : "Weekly"}
                                </button>
                              ))}
                            </div>
                          </label>
                          <label className="text-muted-foreground flex flex-col gap-1.5 text-[11px] font-medium">Day
                            <select className={field} value={sched.weekday} disabled={sched.frequency !== "weekly"} onChange={(e) => saveSchedule({ weekday: Number(e.target.value) })}>
                              {sched.frequency !== "weekly" ? <option value={sched.weekday}>Every day</option> : DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                            </select>
                          </label>
                          <label className="text-muted-foreground flex flex-col gap-1.5 text-[11px] font-medium">Time ({zoneShort(tz)})
                            <select className={field} value={sched.time} onChange={(e) => saveSchedule({ time: e.target.value })}>
                              {!TIMES.includes(sched.time) ? <option value={sched.time}>{clock(sched.time)}</option> : null}
                              {TIMES.map((t) => <option key={t} value={t}>{clock(t)}</option>)}
                            </select>
                          </label>
                          <label className="text-muted-foreground flex flex-col gap-1.5 text-[11px] font-medium">Keep
                            <select className={field} value={sched.keep} onChange={(e) => saveSchedule({ keep: Number(e.target.value) })}>
                              {KEEPS.map((k) => <option key={k} value={k}>{k ? `Last ${k}` : "All of them"}</option>)}
                            </select>
                          </label>
                        </div>
                      ) : null}
                      {sched.auto && lastAuto ? (
                        <div className={`flex items-start gap-2 border-t px-3.5 py-2.5 text-xs ${lastAuto.ok ? "text-muted-foreground" : "text-warning"}`}>
                          {lastAuto.ok ? <Icons.Check className="text-success mt-px size-[13px] shrink-0" /> : <Icons.AlertTriangle className="mt-px size-[13px] shrink-0" />}
                          <span>{lastAuto.ok
                            ? `Last automatic backup ${when(lastAuto.at, tz)}: ${(lastAuto.activities ?? 0).toLocaleString()} entries, ${mb(lastAuto.size)}${lastAuto.trimmed ? `, ${lastAuto.trimmed} old one${lastAuto.trimmed === 1 ? "" : "s"} moved to the Drive bin` : ""}.`
                            : `Last automatic backup failed ${when(lastAuto.at, tz)}: ${lastAuto.error}`}</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    The money app can only see the folder you chose and the backups it saved there, nothing else in your Drive.
                    Keep only ever clears automatic backups, into your Drive bin (30 days to get one back). Back up now copies are never removed.
                  </p>
                </div>
              ) : null}
            </div>
          </Col>

          {/* This device */}
          <Col label="Local">
            <div className={`${tile(false)} flex-1`}>
              <div className={`flex shrink-0 items-center ${wide ? "justify-between gap-2" : ""}`}>
                <span className={`${iconBox} bg-muted`}><Icons.Laptop className="text-primary size-5" /></span>
                {wide ? <StatusPill on text="Ready" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`${wide ? "text-[15px]" : "text-sm"} truncate font-semibold`}>This device</div>
                <div className="text-muted-foreground mt-0.5 text-xs">{wide || !stack ? "Download a backup file to keep anywhere" : "Download a file"}</div>
              </div>
              <div className={actions}>
                <a href={`${BASE}/download`} className={`${btn} min-w-0 ${grow}`}>
                  <Icons.Download className="size-[13px] shrink-0" /><span className="truncate">Download</span>
                </a>
              </div>
            </div>
          </Col>
        </div>

        {note ? (
          <div className={`flex items-start gap-2 text-xs ${note.tone === "bad" ? "text-destructive" : note.tone === "warn" ? "text-warning" : note.tone === "ok" ? "text-success" : "text-muted-foreground"}`}>
            {note.tone === "bad" || note.tone === "warn" ? <Icons.AlertTriangle className="mt-px size-3.5 shrink-0" /> : <Icons.Check className="mt-px size-3.5 shrink-0" />}
            <span>{note.text}</span>
          </div>
        ) : null}
      </section>

      {/* 2. Restore */}
      <section className="space-y-3.5">
        <SectionTitle title="2. Restore" hint="You see what comes back before anything changes" />
        <div className={`grid items-start ${wide ? "grid-cols-2 gap-3.5" : "grid-cols-1 gap-2.5"}`}>
          <Col label="Cloud">
            <div className="bg-card overflow-hidden rounded-lg border">
              {linked && status ? (
                <div>
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="bg-background flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border"><DriveLogo size={16} /></span>
                    <div className="min-w-[150px] flex-1">
                      <div className="text-sm font-medium">From Google Drive</div>
                      <div className="text-muted-foreground truncate text-xs">{status.folderName}</div>
                    </div>
                    {files === null ? (
                      <button type="button" onClick={showDriveBackups} disabled={busy !== null} className={btn}>
                        {busy === "list" ? <Icons.RefreshCw className="size-3 animate-spin" /> : null}Show backups
                      </button>
                    ) : canPick ? (
                      <button type="button" onClick={pickFromDrive} disabled={busy !== null} className={btn} title="Pick a backup anywhere in your Drive">
                        {busy === "pick" ? <Icons.RefreshCw className="size-3 animate-spin" /> : null}Other file…
                      </button>
                    ) : null}
                  </div>
                  {files !== null ? (
                    files.length === 0 ? (
                      <div className="text-muted-foreground pb-3 pl-4 pr-4 text-xs sm:pl-[60px]">No backups in this folder yet. Press Back up now to make the first one.</div>
                    ) : (
                      <div className="pb-1.5">
                        {files.slice(0, 8).map((f, i) => (
                          <div key={f.id} className={`flex items-center gap-3 py-2 pl-4 pr-4 sm:pl-[60px] ${i % 2 === 0 ? "bg-muted/40" : ""}`}>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm tabular-nums">{when(f.createdTime, tz)}</div>
                              <div className="text-muted-foreground truncate text-[11px]" title={f.name}>{mb(f.size)} · {f.auto ? "automatic" : "Back up now"}{i === 0 ? " · newest" : ""}</div>
                            </div>
                            <button type="button" onClick={() => restoreFromDrive(f)} disabled={busy !== null} className={`${btn} h-8`}>
                              {openingId === f.id ? <Icons.RefreshCw className="size-3 animate-spin" /> : <Icons.RotateCcw className="size-3" />}Restore
                            </button>
                          </div>
                        ))}
                      </div>
                    )
                  ) : null}
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="bg-background flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border"><DriveLogo size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">From Google Drive</div>
                    <div className="text-muted-foreground text-xs">Link Google Drive above to restore straight from it.</div>
                  </div>
                </div>
              )}
            </div>
          </Col>
          <Col label="Local">
            <div className="bg-card flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3">
              <span className="bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]"><Icons.Upload className="text-primary size-[15px]" /></span>
              <div className="min-w-[150px] flex-1">
                <div className="text-sm font-medium">From a file</div>
                <div className="text-muted-foreground text-xs">A backup you downloaded before (.tar.gz)</div>
              </div>
              <input ref={fileRef} type="file" accept=".gz,.tgz,application/gzip" onChange={onFile} className="hidden" />
              <button type="button" onClick={() => fileRef.current?.click()} className={btn}>Choose file</button>
            </div>
          </Col>
        </div>
      </section>

      {showFolders ? <DriveFolderChooser currentId={status?.folderId} canBrowse={canPick} onClose={() => setShowFolders(false)} onChosen={onFolderChosen} /> : null}
      {restore && status ? <RestoreBackupModal source={restore} status={status} onClose={() => setRestore(null)} /> : null}
    </div>
  );
}

// ---------- DriveFolderChooser (WheelTradr's) ----------
interface FolderRow { folder: DriveFolder; depth: number; path: string }
function folderTree(folders: DriveFolder[]) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const kids = new Map<string, DriveFolder[]>();
  for (const f of folders) if (!f.atTop && f.parentId && byId.has(f.parentId)) kids.set(f.parentId, [...(kids.get(f.parentId) || []), f]);
  const byName = (a: DriveFolder, b: DriveFolder) => a.name.localeCompare(b.name);
  const seen = new Set<string>();
  const walk = (f: DriveFolder, depth: number, trail: string, out: FolderRow[]) => {
    if (seen.has(f.id)) return;
    seen.add(f.id);
    const here = `${trail} › ${f.name}`;
    out.push({ folder: f, depth, path: here });
    for (const k of (kids.get(f.id) || []).sort(byName)) walk(k, depth + 1, here, out);
  };
  const top: FolderRow[] = [];
  for (const f of folders.filter((x) => x.atTop).sort(byName)) walk(f, 0, "My Drive", top);
  const elsewhere: FolderRow[] = [];
  for (const f of folders.filter((x) => !seen.has(x.id)).sort(byName)) walk(f, 0, "Another folder", elsewhere);
  return { top, elsewhere };
}

function DriveFolderChooser({ currentId, canBrowse, onClose, onChosen }: {
  currentId?: string | null; canBrowse: boolean; onClose: () => void; onChosen: (f: { id: string; name: string }) => Promise<void>;
}) {
  const [folders, setFolders] = useState<DriveFolder[] | null>(null);
  const [name, setName] = useState(DEFAULT_FOLDER_NAME);
  const [parent, setParent] = useState(""); // "" = directly in My Drive
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const tree = folders ? folderTree(folders) : { top: [], elsewhere: [] };
  const rows = [...tree.top, ...tree.elsewhere];

  useEffect(() => {
    api.listFolders()
      .then((f) => { setFolders(f); if (f.some((x) => x.name === DEFAULT_FOLDER_NAME)) setName(""); if (!f.length) setShowNew(true); })
      .catch((e: Error) => { setFolders([]); setError(e.message); });
  }, []);

  const choose = async (key: string, get: () => Promise<{ id: string; name: string } | null>) => {
    setBusy(key); setError("");
    try {
      const f = await get();
      if (f) await onChosen(f);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(null); }
  };

  const row = (r: FolderRow) => {
    const f = r.folder;
    const inUse = f.id === currentId;
    return (
      <button key={f.id} type="button" disabled={!!busy || inUse} title={r.path} onClick={() => choose(f.id, async () => f)}
        style={{ paddingLeft: 14 + 22 + r.depth * 18 }}
        className={`flex w-full items-center gap-3 py-2.5 pr-3.5 text-left transition-colors disabled:cursor-default ${inUse ? "bg-primary/10" : "bg-background hover:bg-muted/60"}`}>
        <Icons.Folder className={`size-[15px] shrink-0 ${inUse ? "text-primary" : "text-muted-foreground"}`} />
        <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
        {busy === f.id ? <Icons.RefreshCw className="text-muted-foreground size-3 animate-spin" />
          : inUse ? <span className="text-primary inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold"><Icons.Check className="size-3" /> In use</span>
            : <span className="text-primary shrink-0 text-xs">Use</span>}
      </button>
    );
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="flex max-h-[90dvh] w-full max-w-md flex-col gap-0 overflow-hidden p-0">
        <div className="flex shrink-0 items-center gap-3 border-b p-4">
          <span className="bg-primary/10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"><Icons.Folder className="text-primary size-4" /></span>
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold">Backup folder</DialogTitle>
            <div className="text-muted-foreground text-xs">Where your Google Drive backups go</div>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="space-y-2">
            <h4 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.06em]">Your folders</h4>
            {folders === null ? (
              <div className="text-muted-foreground flex items-center gap-2 px-1 py-2 text-xs"><Icons.RefreshCw className="size-3 animate-spin" /> Looking in your Drive…</div>
            ) : (
              <div className="divide-y overflow-hidden rounded-lg border">
                <div className="bg-muted/40 text-muted-foreground flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold">
                  <Icons.Cloud className="size-3.5" /> My Drive
                </div>
                {tree.top.length === 0 ? <div className="bg-background text-muted-foreground px-3.5 py-2.5 pl-10 text-xs">No folders here yet. Make one below.</div> : null}
                {tree.top.map((r) => row(r))}
                {tree.elsewhere.length > 0 ? (
                  <>
                    <div className="bg-muted/40 text-muted-foreground px-3.5 py-2.5 text-xs font-semibold">Inside folders the money app cannot see</div>
                    {tree.elsewhere.map((r) => row(r))}
                  </>
                ) : null}
              </div>
            )}
            <p className="text-muted-foreground px-1 text-[11px] leading-relaxed">
              Google only lets the money app see folders it made or you chose before, never the rest of your Drive, so other folders are not listed here.
            </p>
          </div>

          {!showNew ? (
            <button type="button" disabled={!!busy || folders === null} onClick={() => setShowNew(true)}
              className="text-primary hover:border-primary/60 hover:bg-primary/5 inline-flex h-10 w-full min-w-0 items-center justify-center gap-2 rounded-lg border border-dashed px-3 text-sm font-medium transition-colors disabled:opacity-40">
              <Icons.Plus className="size-[15px] shrink-0" /><span className="truncate">Create a new folder for backups</span>
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <h4 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.06em]">New folder</h4>
                {folders?.length ? <button type="button" onClick={() => setShowNew(false)} disabled={!!busy} className="text-muted-foreground hover:text-foreground text-xs">Cancel</button> : null}
              </div>
              <label className="text-muted-foreground flex flex-col gap-1.5 text-[11px] font-medium">Make it in
                <select value={parent} onChange={(e) => setParent(e.target.value)} disabled={!!busy} className={`${field} w-full`}>
                  <option value="">My Drive (top level)</option>
                  {rows.map((r) => <option key={r.folder.id} value={r.folder.id}>{r.path}</option>)}
                </select>
              </label>
              <div className="flex gap-2">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Folder name" maxLength={120} autoFocus
                  className="bg-background placeholder:text-muted-foreground focus:border-primary h-9 min-w-0 flex-1 rounded-md border px-3 text-sm focus:outline-none" />
                <button type="button" disabled={!!busy || !name.trim()} onClick={() => choose("new", () => api.createFolder(name, parent || undefined))}
                  className="border-primary/40 bg-primary/10 text-primary hover:border-primary inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-xs font-semibold disabled:opacity-40">
                  {busy === "new" ? <Icons.RefreshCw className="size-3 animate-spin" /> : <Icons.Plus className="size-[13px]" />}Make and use
                </button>
              </div>
              <p className="text-muted-foreground px-1 text-[11px]">
                It will be made in {parent ? rows.find((r) => r.folder.id === parent)?.path : "My Drive, at the top level"}. You can move it in Drive later; backups follow it.
              </p>
            </div>
          )}

          {error ? (
            <div className="bg-destructive/10 border-destructive/30 text-destructive flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-xs leading-relaxed">
              <Icons.AlertTriangle className="mt-0.5 size-[15px] shrink-0" /><span>{error}</span>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          {canBrowse ? (
            <button type="button" disabled={!!busy} onClick={() => choose("browse", () => openPicker("folder"))} className={`${btn} min-w-0 gap-2 px-3.5`}>
              {busy === "browse" ? <Icons.RefreshCw className="size-3.5 shrink-0 animate-spin" /> : <DriveLogo size={16} />}
              <span className="truncate">{busy === "browse" ? "Opening Google Drive…" : "Browse Google Drive"}</span>
            </button>
          ) : <span />}
          <button type="button" onClick={onClose} disabled={!!busy} className={`${btn} px-4`}>Close</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- RestoreBackupModal (WheelTradr's layout; the whole app comes back) ----------
function RestoreBackupModal({ source, status, onClose }: { source: RestoreSource; status: Status; onClose: () => void }) {
  const m = source.manifest;
  const tz = status.timezone;
  const canSave = !!status.linked && !status.needsRelink && !!status.folderId;
  const [safety, setSafety] = useState(canSave);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<RestoreDone | null>(null);
  const fileName = source.kind === "file" ? source.file.name : source.file.name;
  const n = (x: number) => x.toLocaleString();
  const parts: { label: string; hint: string; count: string }[] = [
    { label: "Accounts", hint: "including each rental's own account", count: n(m.counts.accounts) },
    { label: "Entries", hint: "trades, rent, mortgage payments, costs", count: n(m.counts.activities) },
    { label: "Assets and liabilities", hint: "the house, the mortgage, anything in Holdings", count: n(m.counts.assets) },
    { label: "Value history", hint: "prices and property and loan values", count: n(m.counts.quotes) },
    { label: "Rental page and add-on settings", hint: "", count: `${n(m.data.files)} files` },
    { label: "App keys and login", hint: "encryption key, password, server job settings", count: `${m.env.length + (m.helper?.length ?? 0)}` },
  ];

  const run = async () => {
    setError("");
    try {
      if (safety) {
        setBusy("Saving what is here now to Drive first…");
        await api.backupNow();
      }
      setBusy("Restoring… the money app restarts on the restored data.");
      const res = source.kind === "file" ? await api.restoreFile(source.file) : await api.restoreDrive(source.file.id);
      setDone(res);
      setBusy("Reloading…");
      const started = Date.now();
      while (Date.now() - started < 90_000) {
        await new Promise((r) => setTimeout(r, 1500));
        if (await fetch("/", { cache: "no-store" }).then((r) => r.ok).catch(() => false)) break;
      }
      window.location.assign("/");
    } catch (e) {
      setError(`The restore did not finish: ${(e as Error).message}. Nothing was changed; what was here before is back in place.`);
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="flex max-h-[90dvh] w-full max-w-lg flex-col gap-0 overflow-hidden p-0">
        <div className="flex shrink-0 items-center gap-3 border-b p-4">
          <span className="bg-primary/10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"><Icons.RotateCcw className="text-primary size-4" /></span>
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold">{done ? "Restored" : "Restore a backup"}</DialogTitle>
            <div className="text-muted-foreground truncate text-xs" title={fileName}>
              {source.kind === "drive" ? "From Google Drive" : "From a file"}{m.createdAt ? ` · made ${when(m.createdAt, tz)}` : ""}
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {done ? (
            <>
              <div className="bg-success/10 border-success/30 text-success flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-xs leading-relaxed">
                <Icons.CheckCircle className="mt-0.5 size-[15px] shrink-0" />
                <span>Back to {when(done.createdAt, tz)}: {n(done.counts.accounts)} accounts, {n(done.counts.activities)} entries, {n(done.counts.assets)} assets, {n(done.files)} files and {done.settings} settings.</span>
              </div>
              {done.mismatched?.length ? (
                <div className="bg-warning/10 border-warning/30 flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-xs leading-relaxed">
                  <Icons.AlertTriangle className="text-warning mt-0.5 size-[15px] shrink-0" /><span>Did not match the backup: {done.mismatched.join("; ")}</span>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="space-y-2">
                <h4 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.06em]">What comes back</h4>
                <div className="divide-y overflow-hidden rounded-lg border">
                  {parts.map((p) => (
                    <div key={p.label} className="bg-background flex items-center gap-3 px-3.5 py-2.5">
                      <span className="bg-primary border-primary flex h-4 w-4 shrink-0 items-center justify-center rounded border"><Icons.Check className="text-primary-foreground size-[11px]" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">{p.label}</span>
                        {p.hint ? <span className="text-muted-foreground block truncate text-xs">{p.hint}</span> : null}
                      </span>
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{p.count}</span>
                    </div>
                  ))}
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  The whole money app goes back to this backup. Anything added since {when(m.createdAt, tz)} is gone.
                </p>
              </div>

              {canSave ? (
                <label className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 transition-colors ${safety ? "bg-background" : "bg-card opacity-60"} hover:bg-muted/60`}>
                  <input type="checkbox" className="sr-only" checked={safety} disabled={!!busy} onChange={() => setSafety((s) => !s)} />
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${safety ? "bg-primary border-primary" : "bg-card"}`}>
                    {safety ? <Icons.Check className="text-primary-foreground size-[11px]" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">Save what is here now to Google Drive first</span>
                    <span className="text-muted-foreground block text-xs">so this can be undone from Drive</span>
                  </span>
                </label>
              ) : null}

              <div className="bg-background text-muted-foreground flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-xs leading-relaxed">
                <Icons.ShieldCheck className="text-success mt-0.5 size-[15px] shrink-0" />
                <span>What is here now is also kept on the server before anything changes, and put straight back if the restore fails.</span>
              </div>

              {error ? (
                <div className="bg-destructive/10 border-destructive/30 text-destructive flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-xs leading-relaxed">
                  <Icons.AlertTriangle className="mt-0.5 size-[15px] shrink-0" /><span>{error}</span>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <span className="text-muted-foreground min-w-0 text-xs">
            {busy ?? `${n(m.counts.accounts)} accounts, ${n(m.counts.activities)} entries, ${n(m.counts.assets)} assets`}
          </span>
          {!done ? (
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={onClose} disabled={!!busy} className={`${btn} px-4`}>Cancel</button>
              <button type="button" onClick={run} disabled={!!busy}
                className="bg-destructive/10 text-destructive border-destructive/40 hover:border-destructive inline-flex h-9 items-center gap-1.5 rounded-md border px-4 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40">
                {busy ? <Icons.RefreshCw className="size-3 animate-spin" /> : null}
                {busy ? "Restoring…" : "Replace"}
              </button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
