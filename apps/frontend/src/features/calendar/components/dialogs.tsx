// money-hub patch: the Calendar's small windows: a person with their days, one date on its own (a day that is no
// one's: "Visa renewal", "Our wedding"), and a gift given. Each is the app's Dialog: centered on a computer, a sheet
// from the bottom on a phone. A lunar date says where it lands this year before it is saved.
import { useEffect, useState } from "react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icons,
  PrivacyAmount,
  Checkbox,
} from "@wealthfolio/ui";

import {
  Field,
  dialogSheet,
  dialogShell,
  dialogTitle,
  fieldClass,
} from "@/features/upkeep/components/parts";
import { cn } from "@/lib/utils";

import { longDay } from "../lib/calendar";
import {
  KIND_WORDS,
  MONTHS,
  datesApi,
  type ChargeChoice,
  type DateInput,
  type DateKind,
  type Gender,
  type DatesView,
  type Gift,
  type GiftInput,
  type ImportantDate,
  type Occurrence,
  type PersonInput,
} from "../lib/dates";
import { lunarInYear } from "../lib/lunar";
import { Pills } from "./parts";

const SOLAR_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const pad = (n: number) => String(n).padStart(2, "0");
const digits = (s: string, n: number) => s.replace(/\D/g, "").slice(0, n);

// ------------------------------------------------------------------------------------ one date row --

interface DateDraft {
  id: string | null;
  kind: DateKind;
  title: string;
  month: string;
  day: string;
  year: string;
  lunar: boolean;
  remind: string;
  gift: boolean;
}

const draftOf = (d?: Partial<ImportantDate> & { month?: number; day?: number }): DateDraft => ({
  id: d?.id ?? null,
  kind: d?.kind ?? "birthday",
  title: d?.title ?? "",
  month: d?.month ? String(d.month) : "1",
  day: d?.day ? String(d.day) : "",
  year: d?.year ? String(d.year) : "",
  lunar: !!d?.lunar,
  remind: d?.remind != null ? String(d.remind) : "",
  gift: d?.gift ?? true,
});

const inputOf = (d: DateDraft, personId: string | null): DateInput => ({
  kind: d.kind,
  personId,
  title: d.title.trim(),
  month: Number(d.month),
  day: Number(d.day),
  year: d.year ? Number(d.year) : null,
  lunar: d.lunar,
  remind: d.remind === "" ? null : Number(d.remind),
  gift: d.gift,
});

const dayValid = (d: DateDraft) => {
  const n = Number(d.day);
  return Number.isInteger(n) && n >= 1 && n <= (d.lunar ? 30 : SOLAR_DAYS[Number(d.month) - 1]);
};

/** Where a lunar date lands this year (and next, once this year's has passed). */
function lunarLanding(d: DateDraft, today: string): string | null {
  if (!d.lunar || !dayValid(d)) return null;
  const y = Number(today.slice(0, 4));
  for (const year of [y, y + 1]) {
    const s = lunarInYear(Number(d.day), Number(d.month), year);
    if (!s) continue;
    const iso = `${s.year}-${pad(s.month)}-${pad(s.day)}`;
    if (iso >= today) return `Lands on ${longDay(iso, today)}`;
  }
  return null;
}

function DateFields({
  draft,
  onChange,
  today,
  withTitle,
  kinds,
}: {
  draft: DateDraft;
  onChange: (d: DateDraft) => void;
  today: string;
  withTitle: boolean;
  kinds: DateKind[];
}) {
  const set = (p: Partial<DateDraft>) => onChange({ ...draft, ...p });
  const landing = lunarLanding(draft, today);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-2">
        <Field label="What">
          <select
            value={draft.kind}
            onChange={(e) => {
              const kind = e.target.value as DateKind;
              set({ kind, gift: kind === "birthday" || kind === "anniversary" });
            }}
            className={fieldClass}
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {KIND_WORDS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Calendar">
          <select
            value={draft.lunar ? "lunar" : "solar"}
            onChange={(e) => set({ lunar: e.target.value === "lunar" })}
            className={fieldClass}
          >
            <option value="solar">Regular</option>
            <option value="lunar">Lunar (âm lịch)</option>
          </select>
        </Field>
        {withTitle || draft.kind === "other" ? (
          <Field label="Name" className="col-span-2">
            <input
              type="text"
              value={draft.title}
              maxLength={80}
              onChange={(e) => set({ title: e.target.value })}
              placeholder={withTitle ? "Our wedding, Visa renewal…" : "Graduation, name day…"}
              className={fieldClass}
            />
          </Field>
        ) : null}
        <Field label="Month">
          <select
            value={draft.month}
            onChange={(e) => set({ month: e.target.value })}
            className={fieldClass}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {draft.lunar
                  ? `Month ${i + 1}${i === 0 ? " (Giêng)" : i === 11 ? " (Chạp)" : ""}`
                  : m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Day">
          <input
            type="text"
            inputMode="numeric"
            value={draft.day}
            onChange={(e) => set({ day: digits(e.target.value, 2) })}
            placeholder={draft.lunar ? "15" : "3"}
            className={cn(fieldClass, draft.day && !dayValid(draft) && "border-[var(--m-bad)]")}
          />
        </Field>
        <Field label={draft.kind === "birthday" ? "Year born (optional)" : "Since (optional)"}>
          <input
            type="text"
            inputMode="numeric"
            value={draft.year}
            onChange={(e) => set({ year: digits(e.target.value, 4) })}
            placeholder="1990"
            className={fieldClass}
          />
        </Field>
        <Field label="Heads-up (days before)">
          <input
            type="text"
            inputMode="numeric"
            value={draft.remind}
            onChange={(e) => set({ remind: digits(e.target.value, 2) })}
            placeholder="Default"
            className={fieldClass}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex min-h-[32px] cursor-pointer items-center gap-2 text-[13px]">
          <Checkbox checked={draft.gift} onCheckedChange={(v) => set({ gift: v === true })} />
          Plan a gift
        </label>
        {landing ? <span className="text-[12px] text-[var(--m-muted)]">{landing}</span> : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------ a person --

export interface PersonStart {
  /** The person being changed; null = a new one. */
  personId: string | null;
}

function PersonForm({
  view,
  start,
  onClose,
  onSave,
  onRemove,
}: {
  view: DatesView;
  start: PersonStart;
  onClose: () => void;
  onSave: (fn: () => Promise<DatesView>, done: string) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}) {
  const person = start.personId ? view.people.find((p) => p.id === start.personId) : undefined;
  const had = person ? view.dates.filter((d) => d.personId === person.id) : [];
  const [name, setName] = useState(person?.name ?? "");
  const [relation, setRelation] = useState(person?.relation ?? "");
  const [gender, setGender] = useState<Gender | "">(person?.gender ?? "");
  const [likes, setLikes] = useState(person?.likes ?? "");
  const [budget, setBudget] = useState(person?.budget != null ? String(person.budget) : "");
  const [note, setNote] = useState(person?.note ?? "");
  const [rows, setRows] = useState<DateDraft[]>(
    had.length ? had.map((d) => draftOf(d)) : [draftOf()],
  );
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const filled = rows.filter((r) => r.day !== "");
  const valid =
    name.trim() !== "" &&
    filled.every(dayValid) &&
    filled.every((r) => r.kind !== "other" || r.title.trim());

  const save = async () => {
    setBusy(true);
    const info: PersonInput = {
      name: name.trim(),
      relation: relation.trim(),
      gender,
      likes: likes.trim(),
      budget: budget === "" ? null : budget,
      note,
    };
    const ok = await onSave(
      async () => {
        if (!person)
          return datesApi.addPerson({ ...info, dates: filled.map((r) => inputOf(r, null)) });
        let v = await datesApi.updatePerson(person.id, info);
        const keep = new Set(filled.map((r) => r.id).filter(Boolean));
        for (const d of had) if (!keep.has(d.id)) v = await datesApi.removeDate(d.id);
        for (const r of filled)
          v = r.id
            ? await datesApi.updateDate(r.id, inputOf(r, person.id))
            : await datesApi.addDate(inputOf(r, person.id));
        return v;
      },
      person ? "Saved" : `${name.trim()} added`,
    );
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <>
      <DialogHeader className="text-left">
        <DialogTitle className={dialogTitle}>
          {person ? `Change ${person.name}` : "Add a person"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Their name, their days, what they like and a gift budget.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-2">
        <Field label="Name">
          <input
            type="text"
            value={name}
            maxLength={80}
            autoFocus={!person}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mom, Linh…"
            className={fieldClass}
          />
        </Field>
        <Field label="Who (optional)">
          <input
            type="text"
            value={relation}
            maxLength={40}
            onChange={(e) => setRelation(e.target.value)}
            placeholder="Mother, friend…"
            className={fieldClass}
          />
        </Field>
        <Field label="Gender (optional)">
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as Gender | "")}
            className={fieldClass}
          >
            <option value="">Not said</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Gift budget (optional)">
          <input
            type="text"
            inputMode="decimal"
            value={budget}
            onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="100"
            className={fieldClass}
          />
        </Field>
        <Field label="Likes (optional)" className="col-span-2">
          <input
            type="text"
            value={likes}
            maxLength={300}
            onChange={(e) => setLikes(e.target.value)}
            placeholder="Jasmine tea, gardening, size M, Apple…"
            className={fieldClass}
          />
        </Field>
        <Field label="Note (optional)" className="col-span-2">
          <input
            type="text"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything else worth knowing"
            className={fieldClass}
          />
        </Field>
      </div>
      <div className="flex flex-col gap-2.5">
        {rows.map((r, i) => (
          <div key={i} className="relative rounded-[14px] border border-[var(--m-line)] p-2.5">
            {rows.length > 1 ? (
              <button
                type="button"
                aria-label="Take this date off"
                onClick={() => setRows(rows.filter((_, k) => k !== i))}
                className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full text-[var(--m-muted)] hover:bg-[var(--m-tile)]"
              >
                <Icons.Close className="size-3.5" />
              </button>
            ) : null}
            <DateFields
              draft={r}
              onChange={(d) => setRows(rows.map((x, k) => (k === i ? d : x)))}
              today={view.today}
              withTitle={false}
              kinds={["birthday", "anniversary", "memorial", "other"]}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRows([...rows, draftOf({ kind: "anniversary", gift: true })])}
          className="flex h-8 items-center gap-1.5 self-start text-[12.5px] text-[var(--m-ink-2)] hover:text-[var(--m-ink)]"
        >
          <Icons.Plus className="size-3.5" aria-hidden />
          Another date
        </button>
      </div>
      <p className="text-[12px] text-[var(--m-muted)]">
        Heads-up left blank = {view.remindDays} days before (Settings, Alerts). A giỗ is kept in the
        lunar calendar.
      </p>
      <DialogFooter className="items-center gap-2 sm:justify-between">
        {person ? (
          asking ? (
            <span className="flex items-center gap-2 text-[13px]">
              Delete {person.name}?
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => void onRemove(person.id).then((ok) => ok && onClose())}
              >
                Yes, delete
              </Button>
            </span>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-[var(--m-bad)]"
              onClick={() => setAsking(true)}
            >
              Delete person
            </Button>
          )
        ) : (
          <span />
        )}
        <span className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={busy || !valid} onClick={() => void save()}>
            {person ? "Save" : "Add person"}
          </Button>
        </span>
      </DialogFooter>
    </>
  );
}

export function PersonDialog(props: {
  view: DatesView | undefined;
  start: PersonStart | null;
  onClose: () => void;
  onSave: (fn: () => Promise<DatesView>, done: string) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}) {
  const { start, view, ...rest } = props;
  return (
    <Dialog open={!!start} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className={cn(dialogShell, "sm:max-w-[32rem]")} mobileClassName={dialogSheet}>
        {start && view ? (
          <PersonForm key={start.personId ?? "new"} view={view} start={start} {...rest} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------ one date --

export interface DateStart {
  /** The date being changed; null = a new one. */
  dateId: string | null;
  /** A new one's day, from the picked day on the calendar. */
  on?: string;
}

function DateForm({
  view,
  start,
  onClose,
  onSave,
}: {
  view: DatesView;
  start: DateStart;
  onClose: () => void;
  onSave: (fn: () => Promise<DatesView>, done: string) => Promise<boolean>;
}) {
  const date = start.dateId ? view.dates.find((d) => d.id === start.dateId) : undefined;
  const [personId, setPersonId] = useState<string>(date?.personId ?? "");
  const [draft, setDraft] = useState<DateDraft>(() =>
    date
      ? draftOf(date)
      : draftOf({
          kind: "other",
          gift: false,
          month: start.on ? Number(start.on.slice(5, 7)) : 1,
          day: start.on ? Number(start.on.slice(8)) : undefined,
        }),
  );
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const valid = dayValid(draft) && (personId !== "" || draft.title.trim() !== "");
  const save = async () => {
    setBusy(true);
    const input = inputOf(draft, personId || null);
    const ok = await onSave(
      () => (date ? datesApi.updateDate(date.id, input) : datesApi.addDate(input)),
      date ? "Saved" : "Date added",
    );
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <>
      <DialogHeader className="text-left">
        <DialogTitle className={dialogTitle}>
          {date ? "Change this date" : "Add a date"}
        </DialogTitle>
        <DialogDescription className="sr-only">A day that comes back every year.</DialogDescription>
      </DialogHeader>
      <Field label="Whose (optional)">
        <select
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          className={fieldClass}
        >
          <option value="">No one, just a day</option>
          {view.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <DateFields
        draft={draft}
        onChange={setDraft}
        today={view.today}
        withTitle={!personId}
        kinds={["birthday", "anniversary", "memorial", "other"]}
      />
      <DialogFooter className="items-center gap-2 sm:justify-between">
        {date ? (
          asking ? (
            <span className="flex items-center gap-2 text-[13px]">
              Delete it?
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void onSave(() => datesApi.removeDate(date.id), "Date deleted").then(
                    (ok) => ok && onClose(),
                  )
                }
              >
                Yes, delete
              </Button>
            </span>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-[var(--m-bad)]"
              onClick={() => setAsking(true)}
            >
              Delete date
            </Button>
          )
        ) : (
          <span />
        )}
        <span className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={busy || !valid} onClick={() => void save()}>
            {date ? "Save" : "Add date"}
          </Button>
        </span>
      </DialogFooter>
    </>
  );
}

export function DateDialog(props: {
  view: DatesView | undefined;
  start: DateStart | null;
  onClose: () => void;
  onSave: (fn: () => Promise<DatesView>, done: string) => Promise<boolean>;
}) {
  const { start, view, ...rest } = props;
  return (
    <Dialog open={!!start} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className={dialogShell} mobileClassName={dialogSheet}>
        {start && view ? (
          <DateForm
            key={`${start.dateId ?? "new"}:${start.on ?? ""}`}
            view={view}
            start={start}
            {...rest}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------ a gift --

export interface GiftStart {
  /** The day the gift is for (a new one), or the gift being changed. */
  occ?: Occurrence;
  gift?: Gift;
}

function GiftForm({
  view,
  start,
  currency,
  onClose,
  onSave,
}: {
  view: DatesView;
  start: GiftStart;
  currency: string;
  onClose: () => void;
  onSave: (fn: () => Promise<DatesView>, done: string) => Promise<boolean>;
}) {
  const gift = start.gift;
  const occ = start.occ;
  const [what, setWhat] = useState(gift?.what ?? "");
  const [amount, setAmount] = useState(gift?.amount != null ? String(gift.amount) : "");
  const [date, setDate] = useState(
    gift?.date ?? (occ && occ.date < view.today ? occ.date : view.today),
  );
  const [personId, setPersonId] = useState(gift?.personId ?? occ?.personId ?? "");
  const [charge, setCharge] = useState(gift?.charge ?? null);
  const [how, setHow] = useState<"typed" | "bank">(gift?.charge ? "bank" : "typed");
  const [q, setQ] = useState("");
  const [choices, setChoices] = useState<ChargeChoice[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const holiday =
    (occ?.source ?? (gift?.occasion.startsWith("hol:") ? "holiday" : "date")) === "holiday";

  useEffect(() => {
    if (how !== "bank") return;
    let gone = false;
    const t = setTimeout(
      () => {
        datesApi
          .charges(q.trim())
          .then((c) => !gone && setChoices(c))
          .catch(() => !gone && setChoices([]));
      },
      q ? 300 : 0,
    );
    return () => {
      gone = true;
      clearTimeout(t);
    };
  }, [how, q]);

  const valid = what.trim() !== "" && (how === "typed" || !!charge);
  const save = async () => {
    setBusy(true);
    const input: GiftInput = {
      what: what.trim(),
      amount:
        how === "bank" && charge && amount === "" ? charge.amount : amount === "" ? null : amount,
      date,
      charge: how === "bank" ? charge : null,
      ...(holiday ? { personId: personId || null } : {}),
      ...(gift ? {} : { occasion: occ?.key }),
    };
    const ok = await onSave(
      () => (gift ? datesApi.updateGift(gift.id, input) : datesApi.addGift(input)),
      gift ? "Saved" : "Gift logged",
    );
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <>
      <DialogHeader className="text-left">
        <DialogTitle className={dialogTitle}>
          {gift ? "Change this gift" : "Log a gift"}
        </DialogTitle>
        <DialogDescription className="text-[12.5px]">
          {gift ? gift.title : occ ? `${occ.title}, ${longDay(occ.date, view.today)}` : ""}
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-2">
        <Field label="What" className="col-span-2">
          <input
            type="text"
            value={what}
            maxLength={120}
            autoFocus={!gift}
            onChange={(e) => setWhat(e.target.value)}
            placeholder="Tea set, flowers, lì xì…"
            className={fieldClass}
          />
        </Field>
        {holiday ? (
          <Field label="For (optional)" className="col-span-2">
            <select
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              className={fieldClass}
            >
              <option value="">Not one person</option>
              {view.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>
      <Pills
        label="How it was paid"
        value={how}
        onChange={setHow}
        options={[
          { value: "typed", label: "Type the amount" },
          { value: "bank", label: "Match a bank charge" },
        ]}
      />
      {how === "typed" ? (
        <div className="grid grid-cols-2 gap-x-2.5 gap-y-2">
          <Field label="Amount (optional)">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="80"
              className={fieldClass}
            />
          </Field>
          <Field label="Bought on">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={fieldClass}
            />
          </Field>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a store, last 30 days…"
            className={fieldClass}
          />
          <ul className="max-h-56 overflow-y-auto rounded-[12px] border border-[var(--m-line)]">
            {choices === null ? (
              <li className="px-3 py-2.5 text-[13px] text-[var(--m-muted)]">Looking…</li>
            ) : choices.length ? (
              choices.map((c) => {
                const on = charge?.id === c.id;
                const taken = c.used && gift?.charge?.id !== c.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={taken}
                      onClick={() => {
                        setCharge(
                          on
                            ? null
                            : { id: c.id, merchant: c.merchant, amount: c.amount, date: c.date },
                        );
                        if (!on && c.date) setDate(c.date.slice(0, 10));
                      }}
                      className={cn(
                        "flex min-h-[40px] w-full items-center gap-2 border-b border-[var(--m-line)] px-3 py-1.5 text-left text-[13px] last:border-b-0",
                        on ? "bg-[var(--m-tile)]" : "hover:bg-[var(--m-tile)]",
                        taken && "opacity-45",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-full border",
                          on
                            ? "border-[var(--m-forest)] bg-[var(--m-forest)] text-[var(--m-on-forest)]"
                            : "border-[var(--m-line)]",
                        )}
                      >
                        {on ? <Icons.Check className="size-3" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{c.merchant}</span>
                        <span className="block truncate text-[11.5px] text-[var(--m-muted)]">
                          {c.date ? longDay(c.date.slice(0, 10), view.today) : ""}
                          {c.looksRight ? " · filed as Gifts" : ""}
                          {taken ? " · on another gift" : ""}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        <PrivacyAmount value={c.amount} currency={c.currency ?? currency} />
                      </span>
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="px-3 py-2.5 text-[13px] text-[var(--m-muted)]">
                No money out {q ? `matching "${q}"` : "in the last 30 days"}.
              </li>
            )}
          </ul>
        </div>
      )}
      <DialogFooter className="items-center gap-2 sm:justify-between">
        {gift ? (
          asking ? (
            <span className="flex items-center gap-2 text-[13px]">
              Take it off?
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void onSave(() => datesApi.removeGift(gift.id), "Gift taken off").then(
                    (ok) => ok && onClose(),
                  )
                }
              >
                Yes
              </Button>
            </span>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-[var(--m-bad)]"
              onClick={() => setAsking(true)}
            >
              Take off
            </Button>
          )
        ) : (
          <span />
        )}
        <span className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={busy || !valid} onClick={() => void save()}>
            {gift ? "Save" : "Log gift"}
          </Button>
        </span>
      </DialogFooter>
    </>
  );
}

export function GiftDialog(props: {
  view: DatesView | undefined;
  start: GiftStart | null;
  currency: string;
  onClose: () => void;
  onSave: (fn: () => Promise<DatesView>, done: string) => Promise<boolean>;
}) {
  const { start, view, ...rest } = props;
  return (
    <Dialog open={!!start} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className={dialogShell} mobileClassName={dialogSheet}>
        {start && view ? (
          <GiftForm
            key={start.gift?.id ?? start.occ?.key ?? "new"}
            view={view}
            start={start}
            {...rest}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
