// money-hub patch: Trips, add or change a booking by hand: the kind, the name, when it starts and ends, the
// confirmation, how many people, what it cost, whether it is paid, the bank charge that paid it and a note.
// A centered window on a computer, a sheet from the bottom on a phone (the app's Dialog does both).
import { useState } from "react";

import { useMoney } from "@/features/meadow-dash/parts";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@wealthfolio/ui";

import {
  CHECKIN_CHOICES,
  KIND_LABEL,
  shortDay,
  type Booking,
  type BookingInput,
  type Kind,
  type Paid,
  type TripCharge,
} from "../lib/trips";
import { Field, dialogSheet, dialogShell, dialogTitle, fieldClass } from "./parts";

const KINDS = Object.keys(KIND_LABEL) as Kind[];

const split = (stamp: string | null) => ({
  day: stamp ? stamp.slice(0, 10) : "",
  time: stamp?.slice(11, 16) ?? "",
});
const join = (day: string, time: string) => (day ? (time ? `${day}T${time}` : day) : null);

export interface BookingStart {
  /** The booking being changed; none = a new one. */
  booking: Booking | null;
}

function Form({
  booking,
  charges,
  onSave,
  onClose,
}: {
  booking: Booking | null;
  charges: TripCharge[];
  onSave: (input: BookingInput) => Promise<boolean>;
  onClose: () => void;
}) {
  const money = useMoney("USD");
  const [kind, setKind] = useState<Kind>(booking?.kind ?? "stay");
  const [title, setTitle] = useState(booking?.title ?? "");
  const [sub, setSub] = useState(booking?.sub ?? "");
  const [s, setS] = useState(split(booking?.start ?? null));
  const [e, setE] = useState(split(booking?.end ?? null));
  const [confirmation, setConfirmation] = useState(booking?.confirmation ?? "");
  const [party, setParty] = useState(booking?.party ? String(booking.party) : "");
  const [total, setTotal] = useState(booking?.total != null ? String(booking.total) : "");
  const [paid, setPaid] = useState<Paid>(booking?.paid ?? "unknown");
  const [activityId, setActivityId] = useState(booking?.activityId ?? "");
  const [note, setNote] = useState(booking?.note ?? "");
  const [checkin, setCheckin] = useState(booking?.checkinHours ? String(booking.checkinHours) : "");
  const [busy, setBusy] = useState(false);
  const bad = !title.trim() || (s.day && e.day && e.day < s.day);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (bad) return;
    setBusy(true);
    const ok = await onSave({
      kind,
      title: title.trim(),
      sub: sub.trim(),
      start: join(s.day, s.time),
      end: join(e.day, e.time),
      confirmation: confirmation.trim() || null,
      party: party ? Number(party) : null,
      total: total.trim() ? Number(total) : null,
      paid,
      checkinHours: kind === "flight" && checkin ? Number(checkin) : null,
      activityId: activityId || null,
      note: note.trim(),
    });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <form onSubmit={(ev) => void submit(ev)} className="flex flex-col gap-3">
      <DialogHeader className="text-left">
        <DialogTitle className={dialogTitle}>
          {booking ? "Edit booking" : "Add a booking"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          The name, the dates, the confirmation and what it cost.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kind">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={`h-8 rounded-full border px-3 text-[12.5px] ${
              kind === k
                ? "bg-primary text-primary-foreground border-transparent"
                : "border-border text-foreground/80 hover:bg-muted"
            }`}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <Field label="Name">
        <input
          className={fieldClass}
          value={title}
          onChange={(x) => setTitle(x.target.value)}
          placeholder="Hotel in Dallas"
          autoFocus
          maxLength={120}
        />
      </Field>
      <Field label="Details">
        <input
          className={fieldClass}
          value={sub}
          onChange={(x) => setSub(x.target.value)}
          placeholder="2 nights, king room"
          maxLength={120}
        />
      </Field>
      <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
        <Field label="Starts">
          <input
            type="date"
            className={fieldClass}
            value={s.day}
            onChange={(x) => setS({ ...s, day: x.target.value })}
          />
        </Field>
        <Field label="Time">
          <input
            type="time"
            className={fieldClass}
            value={s.time}
            onChange={(x) => setS({ ...s, time: x.target.value })}
          />
        </Field>
        <Field label="Ends">
          <input
            type="date"
            className={fieldClass}
            value={e.day}
            onChange={(x) => setE({ ...e, day: x.target.value })}
          />
        </Field>
        <Field label="Time">
          <input
            type="time"
            className={fieldClass}
            value={e.time}
            onChange={(x) => setE({ ...e, time: x.target.value })}
          />
        </Field>
      </div>
      {s.day && e.day && e.day < s.day ? (
        <p className="text-destructive text-[12px]">The end is before the start.</p>
      ) : null}
      <div className="grid grid-cols-3 gap-2">
        <Field label="Confirmation">
          <input
            className={fieldClass}
            value={confirmation}
            onChange={(x) => setConfirmation(x.target.value)}
            maxLength={40}
          />
        </Field>
        <Field label="People">
          <input
            className={fieldClass}
            inputMode="numeric"
            value={party}
            onChange={(x) => setParty(x.target.value.replace(/\D/g, "").slice(0, 2))}
          />
        </Field>
        <Field label="Total">
          <input
            className={fieldClass}
            inputMode="decimal"
            value={total}
            onChange={(x) => setTotal(x.target.value.replace(/[^\d.]/g, ""))}
            placeholder="0.00"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
        <Field label="Paid">
          <select
            className={fieldClass}
            value={paid}
            onChange={(x) => setPaid(x.target.value as Paid)}
          >
            <option value="unknown">Not sure</option>
            <option value="now">Paid on the card</option>
            <option value="later">Pay later or at the door</option>
          </select>
        </Field>
        <Field label="Bank charge">
          <select
            className={fieldClass}
            value={activityId}
            onChange={(x) => setActivityId(x.target.value)}
          >
            <option value="">Not tied to one</option>
            {charges.map((c) => (
              <option key={c.id} value={c.id}>
                {shortDay(c.date)}, {c.label}, {money.cents(c.amount)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {kind === "flight" ? (
        <Field label="Check-in reminder">
          <select
            className={fieldClass}
            value={checkin}
            onChange={(x) => setCheckin(x.target.value)}
          >
            <option value="">Same as Settings, Alerts</option>
            {CHECKIN_CHOICES.map((h) => (
              <option key={h} value={h}>{`${h} hours before it leaves`}</option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="Note">
        <input
          className={fieldClass}
          value={note}
          onChange={(x) => setNote(x.target.value)}
          maxLength={300}
        />
      </Field>
      <DialogFooter className="gap-2 max-sm:flex-col-reverse">
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-full sm:h-9"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button type="submit" className="h-10 rounded-full sm:h-9" disabled={!!bad || busy}>
          {busy ? "Saving" : booking ? "Save" : "Add booking"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function BookingDialog({
  start,
  charges,
  onSave,
  onClose,
}: {
  start: BookingStart | null;
  charges: TripCharge[];
  onSave: (id: string | null, input: BookingInput) => Promise<boolean>;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!start} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={dialogShell} mobileClassName={dialogSheet}>
        {start ? (
          <Form
            key={start.booking?.id ?? "new"}
            booking={start.booking}
            charges={charges}
            onSave={(input) => onSave(start.booking?.id ?? null, input)}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
