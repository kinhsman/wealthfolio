// money-hub patch: the window that sets an asset's or a liability's icon (owner, 10-03: "add icon
// support for Assets and liabilities and show it everywhere reference it"). A picture from a file,
// the clipboard (Ctrl+V anywhere in the window, or Paste) or a drop on the circle, or one of the
// owner's own logos (the merchants: US Bank for the mortgage). It is saved as the asset's custom
// logo (asset_logos, the same store and checks as a security's), so it needs no server change. A
// photo fills the circle by default (its ends cut evenly); "Whole picture" keeps all of it instead.
// With `onDraft` instead of an asset id (the Add window, before the asset exists) it hands the
// picture back to be saved once the asset is made.
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@wealthfolio/ui";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useEffect, useMemo, useRef, useState } from "react";

import { AltAssetIcon, useAltAssetIcon } from "@/components/alt-asset-icon";
import { RoundLogo } from "@/components/round-logo";
import { useMerchants } from "@/features/spending/lib/merchants";
import { useAssetLogoMutations } from "@/hooks/use-asset-logos";
import { useIsMobileViewport } from "@/hooks/use-platform";
import {
  LOGO_ACCEPT,
  LogoImageError,
  normalizeLogoImage,
  type LogoFit,
  type LogoImageErrorCode,
  type NormalizedLogoImage,
} from "@/lib/normalize-logo-image";
import { cn } from "@/lib/utils";

const ERRORS: Record<LogoImageErrorCode, string> = {
  unsupported_type: "That file is not a picture. Use a PNG, JPG, WebP or SVG.",
  too_large_input: "That picture is over 10 MB. Choose a smaller one.",
  decode_failed: "That picture could not be opened.",
  encode_failed: "That picture could not be prepared.",
  too_large_output: "That picture has too much detail to save. Try a simpler one.",
};

const imageFrom = (data: DataTransfer | null): File | null =>
  Array.from(data?.files ?? []).find((f) => f.type.startsWith("image/")) ??
  Array.from(data?.items ?? [])
    .find((i) => i.kind === "file" && i.type.startsWith("image/"))
    ?.getAsFile() ??
  null;

export interface AltAssetIconDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind?: string | null;
  name?: string | null;
  /** Saves straight to this asset. */
  assetId?: string | null;
  /** Or, for an asset not made yet: the picture so far, and where a new one (or none) goes. */
  draft?: NormalizedLogoImage | null;
  onDraft?: (picture: NormalizedLogoImage | null) => void;
}

export function AltAssetIconDialog({ open, onOpenChange, ...body }: AltAssetIconDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} useIsMobile={useIsMobileViewport}>
      <DialogContent
        className="sm:max-w-lg"
        mobileClassName="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0"
      >
        {/* Mounted only while open, so every open starts fresh. */}
        {open ? <IconDialogBody {...body} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

type Status = { kind: "idle" } | { kind: "working" } | { kind: "error"; text: string };

function IconDialogBody({
  kind,
  name,
  assetId,
  draft,
  onDraft,
  onClose,
}: Omit<AltAssetIconDialogProps, "open" | "onOpenChange"> & { onClose: () => void }) {
  const isMobile = useIsMobileViewport();
  const { setLogo, resetLogo } = useAssetLogoMutations({
    saved: "Icon saved.",
    reset: "Icon removed.",
  });
  const saved = useAltAssetIcon(assetId);
  const input = useRef<HTMLInputElement>(null);

  const [source, setSource] = useState<Blob | null>(null);
  const [fit, setFit] = useState<LogoFit>("cover");
  const [picture, setPicture] = useState<NormalizedLogoImage | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const [logosOpen, setLogosOpen] = useState(false);

  // Every new picture, or a change of fit, is prepared again from the original.
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    setStatus({ kind: "working" });
    normalizeLogoImage(source, fit).then(
      (next) => {
        if (cancelled) return;
        setPicture(next);
        setStatus({ kind: "idle" });
      },
      (error: unknown) => {
        if (cancelled) return;
        setPicture(null);
        const code = error instanceof LogoImageError ? error.code : "decode_failed";
        setStatus({ kind: "error", text: ERRORS[code] });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [source, fit]);

  const pick = (file: Blob | null | undefined) => {
    if (!file) return;
    setFit("cover");
    setSource(file);
  };

  // A copied picture pastes anywhere while the window is open; pasted text (the logo search) is
  // left alone.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = imageFrom(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      setFit("cover");
      setSource(file);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  const canReadClipboard = typeof navigator !== "undefined" && !!navigator.clipboard?.read;
  const pasteButton = async () => {
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) return pick(await item.getType(type));
      }
      setStatus({ kind: "error", text: "There is no picture on the clipboard. Copy one first." });
    } catch {
      setStatus({
        kind: "error",
        text: "The browser did not let the app read the clipboard. Press Ctrl+V (Cmd+V on a Mac) instead.",
      });
    }
  };

  const fromLogo = async (url: string) => {
    setLogosOpen(false);
    setStatus({ kind: "working" });
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(String(res.status));
      pick(await res.blob());
    } catch {
      setStatus({ kind: "error", text: "That logo could not be loaded. Try again." });
    }
  };

  const busy = status.kind === "working" || setLogo.isPending || resetLogo.isPending;
  const hasNow = assetId ? saved.has : !!draft;
  const wide = !!picture && Math.abs(picture.sourceWidth / picture.sourceHeight - 1) > 0.04;

  const save = () => {
    if (!picture) return;
    if (assetId) {
      setLogo.mutate({ assetId, dataBase64: picture.dataBase64 }, { onSuccess: onClose });
    } else {
      onDraft?.(picture);
      onClose();
    }
  };
  const remove = () => {
    if (assetId) {
      resetLogo.mutate(assetId, { onSuccess: onClose });
    } else {
      onDraft?.(null);
      onClose();
    }
  };

  return (
    <>
      <DialogHeader className={cn("text-left", isMobile && "border-b px-5 py-4")}>
        <DialogTitle>Icon</DialogTitle>
        <DialogDescription className="truncate">
          {name || "Shows beside it everywhere"}
        </DialogDescription>
      </DialogHeader>

      <div
        className={cn("min-w-0 space-y-4", isMobile && "min-h-0 flex-1 overflow-y-auto px-5 py-4")}
      >
        {/* p-1: room for the picked picture's ring inside the phone sheet's scroll box */}
        <div className="flex items-center gap-4 p-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(imageFrom(e.dataTransfer));
            }}
            aria-label="Choose a picture"
            className={cn(
              "focus-visible:ring-ring relative size-20 shrink-0 rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              picture && "ring-primary ring-offset-background ring-2 ring-offset-2",
              dragging && "ring-primary scale-105 ring-2",
            )}
          >
            <AltAssetIcon
              assetId={assetId}
              kind={kind}
              name={name ?? undefined}
              src={picture?.dataUri ?? (assetId ? undefined : draft?.dataUri)}
              className="size-20"
              iconSize={36}
            />
            {status.kind === "working" ? (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white">
                <Icons.Spinner className="size-5 animate-spin" />
              </span>
            ) : null}
          </button>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                <Icons.Upload className="mr-1.5 h-3.5 w-3.5" />
                {picture ? "Another" : "Choose"}
              </Button>
              {canReadClipboard ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={pasteButton}
                >
                  <Icons.Copy className="mr-1.5 h-3.5 w-3.5" />
                  Paste
                </Button>
              ) : null}
              <Button
                type="button"
                variant={logosOpen ? "secondary" : "outline"}
                size="sm"
                disabled={busy}
                onClick={() => setLogosOpen((v) => !v)}
                aria-expanded={logosOpen}
              >
                <Icons.Store className="mr-1.5 h-3.5 w-3.5" />
                Your logos
              </Button>
            </div>
            {isMobile ? null : (
              <p className="text-muted-foreground text-xs">
                A photo or a logo. Drop it on the circle, or paste one with Ctrl+V (Cmd+V on a Mac).
              </p>
            )}
          </div>
        </div>

        {wide ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Fit</span>
            <div
              className="bg-muted inline-flex rounded-full p-0.5"
              role="radiogroup"
              aria-label="Fit"
            >
              {(
                [
                  ["cover", "Fill the circle"],
                  ["contain", "Whole picture"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={fit === value}
                  disabled={busy}
                  onClick={() => setFit(value)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    fit === value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {logosOpen ? <YourLogos onPick={fromLogo} /> : null}

        {status.kind === "error" ? (
          <Alert variant="destructive">
            <Icons.AlertCircle className="size-4" />
            <AlertDescription>{status.text}</AlertDescription>
          </Alert>
        ) : null}

        <input
          ref={input}
          type="file"
          accept={LOGO_ACCEPT}
          className="hidden"
          data-testid="alt-asset-icon-file"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      <DialogFooter
        className={cn(
          isMobile ? "border-t px-5 py-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]" : "gap-2",
        )}
      >
        {hasNow && !picture ? (
          <Button
            type="button"
            variant="ghost"
            className={cn("text-muted-foreground", isMobile ? "w-full" : "sm:mr-auto")}
            disabled={busy}
            onClick={remove}
          >
            {resetLogo.isPending ? (
              <Icons.Spinner className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Icons.RotateCcw className="mr-1.5 size-4" />
            )}
            Remove icon
          </Button>
        ) : null}
        <div className={cn("flex gap-2", isMobile && "w-full flex-col-reverse")}>
          <Button
            type="button"
            variant="outline"
            className={cn(isMobile && "w-full")}
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className={cn(isMobile && "w-full")}
            disabled={!picture || busy}
            onClick={save}
          >
            {setLogo.isPending ? <Icons.Spinner className="mr-1.5 size-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

/** The owner's own logos (Settings, Spending, Merchants), searchable. Only the ones served by the
 *  money app itself: a bank's logo lives on another site, which the app may not read back. */
function YourLogos({ onPick }: { onPick: (url: string) => void }) {
  const { data, isLoading } = useMerchants();
  const [q, setQ] = useState("");
  const all = useMemo(
    () =>
      (data ?? [])
        .filter((m) => !m.source && m.logoUrl?.startsWith("/"))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data],
  );
  const needle = q.trim().toLowerCase();
  const shown = needle ? all.filter((m) => m.name.toLowerCase().includes(needle)) : all;

  return (
    <div className="space-y-2 rounded-lg border p-2">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search your logos"
        autoComplete="off"
        className="h-9"
      />
      <div className="grid max-h-56 grid-cols-2 gap-0.5 overflow-y-auto">
        {isLoading ? (
          <p className="text-muted-foreground col-span-2 px-1 py-3 text-sm">Loading your logos.</p>
        ) : shown.length === 0 ? (
          <p className="text-muted-foreground col-span-2 px-1 py-3 text-sm">
            {needle ? `No logo called "${q.trim()}".` : "No logos yet."}
          </p>
        ) : (
          shown.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onPick(m.logoUrl!)}
              className="hover:bg-muted/60 flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm"
            >
              <RoundLogo url={m.logoUrl!} name={m.name} className="h-6 w-6" />
              <span className="min-w-0 truncate">{m.name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
