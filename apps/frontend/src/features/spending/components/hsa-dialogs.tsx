// money-hub patch: the HSA page's small windows (lib/hsa.ts): Paste details (typed receipt details), the gear
// (the Patients list and the Drive copy switch, nothing else) and the Export menu (a packet or a sheet for a
// year, a person and a status). The windows are the app's Dialog: a centered window on a computer, a sheet from
// the bottom on a phone, both portalled to <body> so no bar paints over them.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icons,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
  Textarea,
} from "@wealthfolio/ui";

import {
  NO_PATIENT,
  STATUS_LABEL,
  exportUrl,
  hsaApi,
  parsePatients,
  patientsText,
  type ExportChoice,
  type HsaSettings,
  type HsaStatus,
  type HsaTotals,
  HSA_KEY,
} from "../lib/hsa";
import { Field, fieldClass } from "./hsa-parts";

const errorText = (e: unknown) => (e as Error)?.message ?? String(e);
const shell = "max-h-[90dvh] gap-3 overflow-y-auto sm:max-w-[28rem]";
const sheet = "h-auto max-h-[90dvh] overflow-y-auto";
const title = "text-base font-medium";

// ----------------------------------------------------------------------------- Paste details --

/** Typed details: provider, amount, currency, date. The AI reads them like a photo (and checks for a twin). */
export function PasteDetailsDialog({
  open,
  onOpenChange,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={shell} mobileClassName={sheet}>
        <DialogHeader className="text-left">
          <DialogTitle className={title}>Paste details</DialogTitle>
          <DialogDescription>Provider, amount, currency and date.</DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          autoFocus
          placeholder="Ocean Clinic, 45, USD, 2026-09-19"
          aria-label="Receipt details"
          className="text-base sm:text-sm"
        />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!text.trim()}
            onClick={() => {
              onSend(text.trim());
              setText("");
              onOpenChange(false);
            }}
          >
            Add receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------------- the gear --

function SettingsForm({ settings, onDone }: { settings: HsaSettings; onDone: () => void }) {
  const qc = useQueryClient();
  const [patients, setPatients] = useState(patientsText(settings.patients));
  const [mirror, setMirror] = useState(settings.mirror);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      qc.setQueryData(
        HSA_KEY,
        await hsaApi.saveSettings({ patients: parsePatients(patients), mirror }),
      );
      toast.success("HSA settings saved");
      onDone();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <DialogHeader className="text-left">
        <DialogTitle className={title}>HSA settings</DialogTitle>
        <DialogDescription className="sr-only">
          The patients list and the Drive copy.
        </DialogDescription>
      </DialogHeader>
      <Field label="Patients, one per line">
        <Textarea
          value={patients}
          onChange={(e) => setPatients(e.target.value)}
          rows={4}
          placeholder={"Mira Stone\nJon Reed"}
          className="text-base sm:text-sm"
        />
      </Field>
      <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
        <label htmlFor="hsa-mirror" className="min-w-0 text-sm">
          Copy to Google Drive
          <span className="text-muted-foreground block text-xs">
            Pictures, and the list as a Sheet
          </span>
        </label>
        <Switch id="hsa-mirror" checked={mirror} onCheckedChange={setMirror} />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void save()} disabled={busy}>
          {busy ? <Icons.Spinner className="size-4 animate-spin" /> : null}
          Save
        </Button>
      </DialogFooter>
    </>
  );
}

export function HsaSettingsDialog({
  open,
  onOpenChange,
  settings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: HsaSettings;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={shell} mobileClassName={sheet} onOpenAutoFocus={(e) => e.preventDefault()}>
        <SettingsForm settings={settings} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------------------ Export menu --

const EXPORT_STATUSES: HsaStatus[] = ["unreimbursed", "review", "reimbursed"];

/** Export: the packet (a zip with the pictures by year and person) or the list sheet (CSV); everything but Junk by default. */
export function ExportMenu({
  totals,
  labelled,
  className,
}: {
  totals: HsaTotals | undefined;
  labelled: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<ExportChoice>({ year: null, patient: null, status: null });
  const link = (kind: "zip" | "csv") => exportUrl(kind, choice);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          title="Export"
          aria-label="Export"
          className={className}
        >
          <Icons.Download className={labelled ? "mr-1.5 size-4" : "size-4"} />
          {labelled ? "Export" : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 space-y-2.5 p-3 max-sm:w-[min(18rem,calc(100vw-1.5rem))]"
      >
        <Field label="Year">
          <select
            value={choice.year ?? ""}
            onChange={(e) => setChoice({ ...choice, year: e.target.value || null })}
            className={fieldClass}
          >
            <option value="">All years</option>
            {(totals?.byYear ?? []).map((y) => (
              <option key={y.year} value={y.year}>
                {y.year}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Person">
          <select
            value={choice.patient ?? ""}
            onChange={(e) => setChoice({ ...choice, patient: e.target.value || null })}
            className={fieldClass}
          >
            <option value="">Everyone</option>
            {(totals?.byPatient ?? []).map((p) => (
              <option key={p.patient ?? NO_PATIENT} value={p.patient ?? NO_PATIENT}>
                {p.patient ?? "No patient"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            value={choice.status ?? ""}
            onChange={(e) =>
              setChoice({ ...choice, status: (e.target.value || null) as HsaStatus | null })
            }
            className={fieldClass}
          >
            <option value="">Everything except junk</option>
            {EXPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <Button asChild size="sm" variant="outline" className="min-w-0">
            <a href={link("zip")} download onClick={() => setOpen(false)}>
              <Icons.FileArchive className="size-4" />
              Packet (zip)
            </a>
          </Button>
          <Button asChild size="sm" variant="outline" className="min-w-0">
            <a href={link("csv")} download onClick={() => setOpen(false)}>
              <Icons.FileSpreadsheet className="size-4" />
              Sheet (CSV)
            </a>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
