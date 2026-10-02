// money-hub patch: Taxes, the papers. The forms the year should bring, worked out from the accounts
// (a W-2 per employer, a 1098 per mortgage, a 1099 per taxed brokerage account ...), each ticked off
// when it is in, with the web address of its file (the owner's Drive). A form the accounts cannot
// know about is added by hand.
import { useState, type FormEvent } from "react";

import { DashboardCard } from "@/components/dashboard-card";
import { PhoneFold } from "@/features/spending/components/phone-fold";
import { cn } from "@/lib/utils";
import { Icons } from "@wealthfolio/ui";

import { shortDay, taxesApi, type TaxPaper, type TaxesView } from "../lib/taxes";
import { Chip, FIELD, PillButton, Row, TextButton, useTaxAct } from "./parts";

/** How many rows a phone shows before the fold. */
const SHOWN = 3;

function Tick({
  on,
  label,
  disabled,
  onChange,
}: {
  on: boolean;
  label: string;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border disabled:opacity-50",
        on
          ? "border-[var(--m-forest)] bg-[var(--m-forest)] text-[var(--m-on-forest)]"
          : "border-[var(--m-line)] bg-[var(--m-surface)] hover:border-[var(--m-forest)]",
      )}
    >
      {on ? <Icons.Check className="h-3 w-3" aria-hidden /> : null}
    </button>
  );
}

function LinkForm({
  start,
  busy,
  onSave,
  onCancel,
}: {
  start: string;
  busy: boolean;
  onSave: (url: string) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState(start);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave(url.trim());
  };
  return (
    <form onSubmit={submit} className="flex w-full min-w-0 flex-wrap items-center gap-2 pb-1.5">
      <input
        autoFocus
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste the file's link from Drive"
        aria-label="The file's web address"
        className={FIELD}
      />
      <PillButton type="submit" filled disabled={busy}>
        Save
      </PillButton>
      <PillButton onClick={onCancel} disabled={busy}>
        Cancel
      </PillButton>
    </form>
  );
}

function PaperRow({
  p,
  busy,
  editing,
  onTick,
  onEdit,
  onLink,
  onRemove,
}: {
  p: TaxPaper;
  busy: boolean;
  editing: boolean;
  onTick: (got: boolean) => void;
  onEdit: (on: boolean) => void;
  onLink: (url: string) => void;
  onRemove: () => void;
}) {
  return (
    <>
      <Row className={editing ? "border-b-0" : undefined}>
        <Tick
          on={p.got}
          label={`${p.form}, ${p.from}: ${p.got ? "in" : "not in yet"}`}
          disabled={busy}
          onChange={onTick}
        />
        <span className={cn("shrink-0", p.got && "text-[var(--m-muted)]")}>{p.form}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-[var(--m-muted)]">{p.from}</span>
        {p.late ? <Chip tone="ask">late</Chip> : null}
        {p.link ? (
          <a
            href={p.link}
            target="_blank"
            rel="noreferrer"
            className="flex shrink-0 items-center gap-1 text-xs text-[var(--m-ink-2)] underline underline-offset-4 hover:no-underline"
          >
            Open
            <Icons.ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : null}
        {!editing ? (
          <button
            type="button"
            onClick={() => onEdit(true)}
            disabled={busy}
            aria-label={p.link ? `Change the link of ${p.form}` : `Add a link to ${p.form}`}
            className="flex h-6 shrink-0 items-center gap-1 rounded-full px-1.5 text-xs text-[var(--m-muted)] hover:bg-[var(--m-tile)] hover:text-[var(--m-ink-2)] disabled:opacity-50"
          >
            {p.link ? (
              <Icons.Pencil className="h-3 w-3" aria-hidden />
            ) : (
              <Icons.Link className="h-3 w-3" aria-hidden />
            )}
            {p.link ? null : <span className="max-md:hidden">link</span>}
          </button>
        ) : null}
        {p.own ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            aria-label={`Remove ${p.form}`}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--m-muted)] hover:bg-[var(--m-tile)] disabled:opacity-50"
          >
            <Icons.X className="h-3 w-3" aria-hidden />
          </button>
        ) : null}
      </Row>
      {editing ? (
        <li className="list-none">
          <LinkForm
            start={p.link ?? ""}
            busy={busy}
            onSave={onLink}
            onCancel={() => onEdit(false)}
          />
        </li>
      ) : null}
    </>
  );
}

export function PapersCard({ view }: { view: TaxesView }) {
  const { busy, run } = useTaxAct();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [folder, setFolder] = useState(false);
  const [form, setForm] = useState("");
  const [from, setFrom] = useState("");
  const { rows, got, count } = view.papers;
  const year = view.year;
  // The next arrival date still ahead; a year already past its dates says nothing here.
  const arrive = rows
    .filter((r) => !r.fill && !r.got && r.expected >= view.today)
    .map((r) => r.expected)
    .sort()[0];

  const row = (p: TaxPaper) => (
    <PaperRow
      key={p.key}
      p={p}
      busy={!!busy}
      editing={editing === p.key}
      onTick={(on) => run(`tick-${p.key}`, () => taxesApi.setPaper(year, p.key, { got: on }))}
      onEdit={(on) => setEditing(on ? p.key : null)}
      onLink={async (url) => {
        if (await run(`link-${p.key}`, () => taxesApi.setPaper(year, p.key, { link: url || null })))
          setEditing(null);
      }}
      onRemove={() => run(`remove-${p.key}`, () => taxesApi.removePaper(year, p.key))}
    />
  );
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (
      await run("add-paper", () =>
        taxesApi.addPaper(year, { form: form.trim(), from: from.trim() }),
      )
    ) {
      setForm("");
      setFrom("");
      setAdding(false);
    }
  };

  return (
    <DashboardCard
      title="Papers"
      subtitle={
        count
          ? `${got} of ${count} in${arrive && got < count ? `, next due ${shortDay(arrive)}` : ""}`
          : `${year}`
      }
      action={
        view.driveFolder ? (
          <a
            href={view.driveFolder}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-[var(--m-muted)] underline-offset-4 hover:underline"
          >
            Drive folder
            <Icons.ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : undefined
      }
    >
      {count ? (
        <div
          className="mb-1 h-1.5 overflow-hidden rounded-full bg-[var(--m-track)]"
          role="img"
          aria-label={`${got} of ${count} papers in`}
        >
          <div
            className="h-full rounded-full bg-[var(--m-forest)]"
            style={{ width: `${(got / count) * 100}%` }}
          />
        </div>
      ) : (
        <p className="text-[13px] text-[var(--m-muted)]">No papers expected for {year} yet.</p>
      )}
      <ul className="flex flex-col">{rows.slice(0, SHOWN).map(row)}</ul>
      {rows.length > SHOWN ? (
        <PhoneFold
          id="taxes-papers"
          closedLabel={`${rows.length - SHOWN} more`}
          openLabel="Hide them"
        >
          <ul className="flex flex-col border-t border-[var(--m-line-soft)]">
            {rows.slice(SHOWN).map(row)}
          </ul>
        </PhoneFold>
      ) : null}

      {adding ? (
        <form
          onSubmit={add}
          className="flex flex-wrap items-center gap-2 border-t border-[var(--m-line-soft)] pt-2.5"
        >
          <input
            autoFocus
            value={form}
            onChange={(e) => setForm(e.target.value)}
            placeholder="Form, like K-1"
            aria-label="The form's name"
            className={cn(FIELD, "max-w-[9.5rem]")}
          />
          <input
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="Who sends it"
            aria-label="Who sends it"
            className={FIELD}
          />
          <PillButton type="submit" filled disabled={!!busy || !form.trim()}>
            Add
          </PillButton>
          <PillButton onClick={() => setAdding(false)} disabled={!!busy}>
            Cancel
          </PillButton>
        </form>
      ) : folder ? (
        <div className="border-t border-[var(--m-line-soft)] pt-2.5">
          <LinkForm
            start={view.driveFolder ?? ""}
            busy={!!busy}
            onSave={async (url) => {
              if (await run("folder", () => taxesApi.setDriveFolder(year, url))) setFolder(false);
            }}
            onCancel={() => setFolder(false)}
          />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--m-line-soft)] pt-2.5">
          <TextButton onClick={() => setAdding(true)}>Add a paper</TextButton>
          <TextButton onClick={() => setFolder(true)}>
            {view.driveFolder ? "Change the Drive folder" : "Link your Drive folder"}
          </TextButton>
        </div>
      )}
    </DashboardCard>
  );
}
