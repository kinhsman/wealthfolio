// money-hub patch: Trips, boarding passes on a flight: the list (open, save, remove) and the three ways to add one,
// upload a PDF or photo, choose it in Google Drive, or paste a Drive link. Opens inside the flight's details.
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Icons } from "@wealthfolio/ui";

import { pickPassFromDrive, pickerSupported } from "../lib/drive-pick";
import { DRIVE_READ_KEY, driveReadApi, linkDriveRead, useDriveRead } from "../lib/drive-read";
import { BOOKINGS_KEY, passUrl, tripsApi, type Booking, type Pass } from "../lib/trips";

const size = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const chip =
  "inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--m-line)] px-3 text-[12.5px] text-[var(--m-ink-2)] hover:bg-[var(--m-tile)] disabled:opacity-50";

function PassRow({ b, pass, onRemove, busy }: { b: Booking; pass: Pass; onRemove: () => void; busy: boolean }) {
  const pdf = pass.mime === "application/pdf";
  return (
    <li className="flex min-h-9 items-center gap-2 rounded-lg px-1 text-[12.5px]">
      {pdf ? (
        <Icons.FileText className="size-4 shrink-0 text-[var(--m-muted)]" aria-hidden />
      ) : (
        <Icons.ImageUp className="size-4 shrink-0 text-[var(--m-muted)]" aria-hidden />
      )}
      <a
        href={passUrl(b.id, pass.id)}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 flex-1 truncate underline-offset-4 hover:underline"
        title={`Open ${pass.name}`}
      >
        {pass.name}
      </a>
      <span className="hidden shrink-0 text-[11.5px] text-[var(--m-muted)] sm:inline">
        {size(pass.size)}
        {pass.from === "drive" ? ", from Drive" : ""}
      </span>
      <a
        href={passUrl(b.id, pass.id, true)}
        aria-label={`Save ${pass.name}`}
        title="Save"
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--m-muted)] hover:bg-[var(--m-track)] hover:text-[var(--m-ink)]"
      >
        <Icons.Download className="size-4" aria-hidden />
      </a>
      <button
        type="button"
        disabled={busy}
        onClick={onRemove}
        aria-label={`Remove ${pass.name}`}
        title="Remove"
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--m-muted)] hover:bg-[var(--m-track)] hover:text-[var(--m-ink)] disabled:opacity-50"
      >
        <Icons.Trash className="size-4" aria-hidden />
      </button>
    </li>
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
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-[var(--m-tile)] px-2.5 py-2">
      <div className="text-[11px] text-[var(--m-muted)]">Boarding passes</div>
      {passes.length ? (
        <ul className="flex flex-col">
          {passes.map((p) => (
            <PassRow
              key={p.id}
              b={b}
              pass={p}
              busy={busy === "remove"}
              onRemove={() => void run("remove", () => tripsApi.removePass(b.id, p.id), "Boarding pass removed")}
            />
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-[var(--m-ink-2)]">
          None yet. Add the PDF or a photo, or fetch it from Google Drive.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          ref={file}
          type="file"
          multiple
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => void upload(e.target.files)}
        />
        <button type="button" className={chip} disabled={working} onClick={() => file.current?.click()}>
          {busy === "upload" ? (
            <Icons.Spinner className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Icons.Upload className="size-3.5" aria-hidden />
          )}
          Upload PDF or photo
        </button>
        {pickerSupported() ? (
          <button type="button" className={chip} disabled={working} onClick={() => void choose()}>
            <Icons.Cloud className="size-3.5" aria-hidden />
            Choose from Google Drive
          </button>
        ) : null}
        <button
          type="button"
          className={cn(chip, pasting && "bg-[var(--m-tile)]")}
          disabled={working}
          onClick={() => setPasting((v) => !v)}
          aria-expanded={pasting}
        >
          <Icons.Link className="size-3.5" aria-hidden />
          Paste a Drive link
        </button>
      </div>
      {pasting ? (
        <form onSubmit={paste} className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://drive.google.com/file/d/…"
              aria-label="Google Drive link to the boarding pass"
              className="h-8 min-w-0 flex-1 rounded-md border border-[var(--m-line)] bg-transparent px-2 text-[16px] md:text-[12.5px]"
            />
            <button type="submit" className={chip} disabled={working || !link.trim()}>
              {busy === "drive" ? <Icons.Spinner className="size-3.5 animate-spin" aria-hidden /> : null}
              Fetch
            </button>
          </div>
          {read.data?.linked ? (
            <p className="text-[11.5px] text-[var(--m-muted)]">
              Reading Drive as {read.data.email}, read only, for boarding passes.{" "}
              <button type="button" onClick={() => void stopReading()} className="underline underline-offset-4">
                Turn off
              </button>
            </p>
          ) : (
            <div className="flex flex-col items-start gap-1">
              <p className="text-[11.5px] text-[var(--m-muted)]">
                A private file needs the app to read your Drive (read only, used only for the links you paste here).
                Or set the file to Anyone with the link.
              </p>
              <button type="button" className={chip} disabled={linking} onClick={() => void allowReading()}>
                {linking ? <Icons.Spinner className="size-3.5 animate-spin" aria-hidden /> : <Icons.Cloud className="size-3.5" aria-hidden />}
                Allow reading my Drive
              </button>
            </div>
          )}
        </form>
      ) : null}
    </div>
  );
}
