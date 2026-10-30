// money-hub patch: Trips, boarding passes on a flight: each pass is a card with a real View button (a photo opens in a
// viewer, a PDF in its own tab), Save and Remove beside it, and real buttons to add one: upload a PDF or photo, choose
// it in Google Drive, or paste a Drive link. Opens inside the flight's details.
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Icons } from "@wealthfolio/ui";
import { dialogSheet, dialogTitle } from "@/features/upkeep/components/parts";

import { pickPassFromDrive, pickerSupported } from "../lib/drive-pick";
import { DRIVE_READ_KEY, driveReadApi, linkDriveRead, useDriveRead } from "../lib/drive-read";
import { BOOKINGS_KEY, passUrl, tripsApi, type Booking, type Pass } from "../lib/trips";

const size = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const isPdf = (p: Pass) => p.mime === "application/pdf";

const chip =
  "inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--m-line)] px-3 text-[12.5px] text-[var(--m-ink-2)] hover:bg-[var(--m-tile)] disabled:opacity-50";

const iconBtn = "size-10 shrink-0 border-[var(--m-line)] bg-transparent text-[var(--m-ink-2)] hover:bg-[var(--m-track)]";

function Thumb({ b, pass }: { b: Booking; pass: Pass }) {
  return isPdf(pass) ? (
    <span className="flex size-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-[var(--m-line)] bg-[var(--m-tile)] text-[var(--m-ink-2)]">
      <Icons.FileText className="size-5" aria-hidden />
      <span className="text-[10px] font-medium tracking-wide">PDF</span>
    </span>
  ) : (
    <img
      src={passUrl(b.id, pass.id)}
      alt=""
      loading="lazy"
      className="size-14 shrink-0 rounded-lg border border-[var(--m-line)] bg-[var(--m-tile)] object-cover"
    />
  );
}

function PassCard({
  b,
  pass,
  busy,
  onView,
  onRemove,
}: {
  b: Booking;
  pass: Pass;
  busy: boolean;
  onView: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex flex-col gap-2.5 rounded-xl border border-[var(--m-line)] bg-[var(--m-card,transparent)] p-2.5">
      <div className="flex items-center gap-3">
        <Thumb b={b} pass={pass} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="line-clamp-2 break-words text-[13.5px] leading-snug">{pass.name}</span>
          <span className="text-[12px] text-[var(--m-muted)]">
            {isPdf(pass) ? "PDF" : "Photo"}, {size(pass.size)}
            {pass.from === "drive" ? ", from Drive" : ""}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" className="h-10 min-w-0 flex-1 rounded-full" onClick={onView}>
          <Icons.Eye className="size-4" aria-hidden />
          View pass
        </Button>
        <Button asChild variant="outline" size="icon" className={iconBtn}>
          <a href={passUrl(b.id, pass.id, true)} aria-label={`Save ${pass.name}`} title="Save to this phone">
            <Icons.Download className="size-4" aria-hidden />
          </a>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={iconBtn}
          disabled={busy}
          onClick={onRemove}
          aria-label={`Remove ${pass.name}`}
          title="Remove"
        >
          <Icons.Trash className="size-4" aria-hidden />
        </Button>
      </div>
    </li>
  );
}

function Viewer({ b, pass, onClose }: { b: Booking; pass: Pass | null; onClose: () => void }) {
  return (
    <Dialog open={!!pass} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-3 overflow-y-auto sm:max-w-[34rem]" mobileClassName={dialogSheet}>
        <DialogHeader>
          <DialogTitle className={cn(dialogTitle, "break-words pr-6")}>{pass?.name}</DialogTitle>
        </DialogHeader>
        {pass ? (
          <>
            <div className="flex max-h-[68dvh] items-center justify-center overflow-auto rounded-lg bg-white p-1">
              <img src={passUrl(b.id, pass.id)} alt={pass.name} className="max-h-[66dvh] w-full object-contain" />
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" className="h-10 flex-1 rounded-full">
                <a href={passUrl(b.id, pass.id, true)}>
                  <Icons.Download className="size-4" aria-hidden />
                  Save
                </a>
              </Button>
              <Button asChild variant="outline" className="h-10 flex-1 rounded-full">
                <a href={passUrl(b.id, pass.id)} target="_blank" rel="noreferrer">
                  <Icons.ExternalLink className="size-4" aria-hidden />
                  Open full size
                </a>
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function PassesPanel({ b }: { b: Booking }) {
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "upload" | "drive" | "remove">(null);
  const [pasting, setPasting] = useState(false);
  const [link, setLink] = useState("");
  const read = useDriveRead();
  const [linking, setLinking] = useState(false);
  const [viewing, setViewing] = useState<Pass | null>(null);
  const passes = b.passes ?? [];

  const run = async (kind: "upload" | "drive" | "remove", job: () => Promise<unknown>, done: string) => {
    setBusy(kind);
    try {
      await job();
      await qc.invalidateQueries({ queryKey: BOOKINGS_KEY });
      toast.success(done);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const upload = async (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (file.current) file.current.value = "";
    for (const f of list) await run("upload", () => tripsApi.addPass(b.id, f), `Added ${f.name}`);
  };

  const choose = async () => {
    try {
      const pick = await pickPassFromDrive();
      if (!pick) return;
      await run("drive", () => tripsApi.addPassFromDrive(b.id, { fileId: pick.id, name: pick.name }), `Added ${pick.name}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const paste = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!link.trim()) return;
    const ok = await run("drive", () => tripsApi.addPassFromDrive(b.id, { link: link.trim() }), "Added from Google Drive");
    if (ok) {
      setLink("");
      setPasting(false);
    }
  };

  const allowReading = async () => {
    setLinking(true);
    try {
      const s = await linkDriveRead(read.data?.linkedAt ?? null);
      qc.setQueryData(DRIVE_READ_KEY, s);
      toast.success("The app can now read your Drive, read only");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLinking(false);
    }
  };

  const stopReading = async () => {
    try {
      qc.setQueryData(DRIVE_READ_KEY, await driveReadApi.unlink());
      toast.success("Drive reading turned off");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const working = busy === "upload" || busy === "drive";
  const view = (p: Pass) => {
    if (isPdf(p)) window.open(passUrl(b.id, p.id), "_blank", "noopener");
    else setViewing(p);
  };
  const ghost = "h-10 min-w-0 flex-1 rounded-full border-[var(--m-line)] bg-transparent text-[var(--m-ink)]";
  const addButtons = (primary: boolean) => (
    <div className="flex flex-col gap-2">
      <input
        ref={file}
        type="file"
        multiple
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => void upload(e.target.files)}
      />
      <Button
        type="button"
        variant={primary ? "default" : "outline"}
        className={cn("h-10 w-full rounded-full", !primary && "border-[var(--m-line)] bg-transparent text-[var(--m-ink)]")}
        disabled={working}
        onClick={() => file.current?.click()}
      >
        {busy === "upload" ? (
          <Icons.Spinner className="size-4 animate-spin" aria-hidden />
        ) : (
          <Icons.Upload className="size-4" aria-hidden />
        )}
        {primary ? "Upload boarding pass" : "Upload another"}
      </Button>
      <div className="flex items-center gap-2">
        {pickerSupported() ? (
          <Button type="button" variant="outline" className={ghost} disabled={working} onClick={() => void choose()}>
            <Icons.Cloud className="size-4" aria-hidden />
            Google Drive
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className={cn(ghost, pasting && "bg-[var(--m-track)]")}
          disabled={working}
          onClick={() => setPasting((v) => !v)}
          aria-expanded={pasting}
        >
          <Icons.Link className="size-4" aria-hidden />
          Drive link
        </Button>
      </div>
    </div>
  );
  return (
    <div className="flex flex-col gap-2.5 rounded-xl bg-[var(--m-tile)] p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium">Boarding passes</span>
        {passes.length ? <span className="text-[12px] text-[var(--m-muted)]">{passes.length}</span> : null}
      </div>
      {passes.length ? (
        <ul className="flex flex-col gap-2">
          {passes.map((p) => (
            <PassCard
              key={p.id}
              b={b}
              pass={p}
              busy={busy === "remove"}
              onView={() => view(p)}
              onRemove={() => void run("remove", () => tripsApi.removePass(b.id, p.id), "Boarding pass removed")}
            />
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-[var(--m-ink-2)]">No boarding pass yet. Add the PDF or a photo of it.</p>
      )}
      {addButtons(passes.length === 0)}
      {pasting ? (
        <form onSubmit={paste} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://drive.google.com/file/d/…"
              aria-label="Google Drive link to the boarding pass"
              className="h-10 min-w-0 flex-1 rounded-full border border-[var(--m-line)] bg-transparent px-3.5 text-[16px] md:text-[13px]"
            />
            <Button type="submit" className="h-10 rounded-full" disabled={working || !link.trim()}>
              {busy === "drive" ? <Icons.Spinner className="size-4 animate-spin" aria-hidden /> : null}
              Fetch
            </Button>
          </div>
          {read.data?.linked ? (
            <p className="text-[11.5px] text-[var(--m-muted)]">
              Reading Drive as {read.data.email}, read only, for boarding passes.{" "}
              <button type="button" onClick={() => void stopReading()} className="underline underline-offset-4">
                Turn off
              </button>
            </p>
          ) : (
            <div className="flex flex-col items-start gap-1.5">
              <p className="text-[11.5px] text-[var(--m-muted)]">
                A private file needs the app to read your Drive (read only, used only for the links you paste here).
                Or set the file to Anyone with the link.
              </p>
              <button type="button" className={chip} disabled={linking} onClick={() => void allowReading()}>
                {linking ? (
                  <Icons.Spinner className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Icons.Cloud className="size-3.5" aria-hidden />
                )}
                Allow reading my Drive
              </button>
            </div>
          )}
        </form>
      ) : null}
      <Viewer b={b} pass={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
