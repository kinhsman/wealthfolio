// money-hub patch: Taxes, the April number (owner, 10-02: "build step 2"). What to set aside for
// April, whether enough is being paid in to stay clear of the underpayment penalty, and the fix in
// dollars per paycheck. The service works it out (server/drive-backup/lib/taxEstimate.js) from a
// filing status and a pay stub's year-to-date figures the owner types here; "How it adds up" shows
// every line of the sum, and a switch holds the amount back in Cash & cards.
import { useState, type FormEvent, type ReactNode } from "react";

import { DashboardCard } from "@/components/dashboard-card";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { cn } from "@/lib/utils";
import { Icons, PrivacyAmount, useAmountFormatting, useBalancePrivacy } from "@wealthfolio/ui";
import { Switch } from "@wealthfolio/ui/components/ui/switch";

import {
  STATUS_LABELS,
  fixWords,
  shortDay,
  sumLines,
  taxesApi,
  typedAmount,
  type FilingStatus,
  type TaxesView,
} from "../lib/taxes";
import { Chip, FIELD, PillButton, TextButton, useTaxAct } from "./parts";

const STATUSES = Object.keys(STATUS_LABELS) as FilingStatus[];
const num = (v: number | null | undefined) => (v == null ? "" : String(v));

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-xs text-[var(--m-ink-2)]">{label}</span>
      {children}
      {hint ? <span className="text-[11px] leading-snug text-[var(--m-muted)]">{hint}</span> : null}
    </label>
  );
}

function Money({
  value,
  onChange,
  label,
  placeholder = "0.00",
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
}) {
  return (
    <input
      inputMode="decimal"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(FIELD, "w-full flex-none tabular-nums")}
    />
  );
}

/** The owner's answers: filing status, a pay stub, and (optional) last year's return and the rental's extras. */
function SetupForm({
  view,
  busy,
  onSave,
  onCancel,
}: {
  view: TaxesView;
  busy: boolean;
  onSave: (patch: Parameters<typeof taxesApi.setSetup>[1]) => void;
  onCancel?: () => void;
}) {
  const s = view.setup;
  const [status, setStatus] = useState<FilingStatus>(s.status ?? "single");
  const [date, setDate] = useState(s.stub?.date ?? "");
  const [wages, setWages] = useState(num(s.stub?.wages));
  const [federal, setFederal] = useState(num(s.stub?.federal));
  const [state, setState] = useState(num(s.stub?.state));
  const [lastTax, setLastTax] = useState(num(s.last?.tax));
  const [lastAgi, setLastAgi] = useState(num(s.last?.agi));
  const [joint, setJoint] = useState(s.last?.joint ?? false);
  const [share, setShare] = useState(num(s.last?.share));
  const [extra, setExtra] = useState(num(s.rentalExtra || null));
  const [more, setMore] = useState(!!s.full);
  const [fullWages, setFullWages] = useState(num(s.full?.wages));
  const [fullFederal, setFullFederal] = useState(num(s.full?.federal));
  const [fullState, setFullState] = useState(num(s.full?.state));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = typedAmount;
    onSave({
      status,
      stub: { date, wages: t(wages), federal: t(federal), state: t(state) },
      last: t(lastTax)
        ? {
            tax: t(lastTax),
            agi: t(lastAgi) || null,
            joint,
            share: joint ? t(share) || null : null,
          }
        : null,
      full: more
        ? {
            wages: t(fullWages) || null,
            federal: t(fullFederal) || null,
            state: t(fullState) || null,
          }
        : null,
      ...(s.hasRental ? { rentalExtra: t(extra) || null } : {}),
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field
        label={`Filing for ${view.year} as`}
        hint="What you are on Dec 31 counts for the whole year."
      >
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as FilingStatus)}
          className={cn(FIELD, "w-full flex-none")}
        >
          {STATUSES.map((k) => (
            <option key={k} value={k}>
              {STATUS_LABELS[k]}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex flex-col gap-2">
        <span className="text-[12.5px] font-medium">Your latest pay stub, year to date</span>
        <div className="grid grid-cols-2 gap-x-2.5 gap-y-2">
          <Field label="Pay date">
            <input
              type="date"
              aria-label="The pay stub's date"
              value={date}
              max={view.today}
              min={`${view.year}-01-01`}
              onChange={(e) => setDate(e.target.value)}
              className={cn(FIELD, "w-full flex-none")}
            />
          </Field>
          <Field label="Taxable pay so far">
            <Money value={wages} onChange={setWages} label="Taxable pay so far" />
          </Field>
          <Field label="Federal tax so far">
            <Money value={federal} onChange={setFederal} label="Federal tax taken out so far" />
          </Field>
          <Field label="Illinois tax so far">
            <Money value={state} onChange={setState} label="State tax taken out so far" />
          </Field>
        </div>
        <span className="text-[11px] leading-snug text-[var(--m-muted)]">
          On the stub these are the year-to-date lines: federal taxable wages, federal withholding,
          state withholding.
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[12.5px] font-medium">
          Last year&apos;s return <span className="text-[var(--m-muted)]">(optional)</span>
        </span>
        <div className="grid grid-cols-2 gap-x-2.5 gap-y-2">
          <Field label="Total tax">
            <Money
              value={lastTax}
              onChange={setLastTax}
              label="Last year's total tax"
              placeholder="Form 1040, line 24"
            />
          </Field>
          <Field label="Income">
            <Money
              value={lastAgi}
              onChange={setLastAgi}
              label="Last year's adjusted gross income"
              placeholder="Form 1040, line 11"
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--m-ink-2)]">
          <input
            type="checkbox"
            checked={joint}
            onChange={(e) => setJoint(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--m-forest)]"
          />
          It was a joint return
        </label>
        {joint ? (
          <Field
            label="Your share of that tax"
            hint="Left empty, the whole amount is used, which is the safer reading."
          >
            <Money value={share} onChange={setShare} label="Your share of last year's tax" />
          </Field>
        ) : null}
        <span className="text-[11px] leading-snug text-[var(--m-muted)]">
          Paying in as much as last year&apos;s tax also keeps the penalty away. Without it the page
          uses 90% of this year&apos;s.
        </span>
      </div>

      {s.hasRental ? (
        <Field
          label={`Rental: depreciation and other costs for ${view.year} (optional)`}
          hint="Rent, the mortgage and the Housing bills linked to the rental come from the Rental page. Type depreciation (last year's Schedule E) and costs paid outside the app."
        >
          <Money
            value={extra}
            onChange={setExtra}
            label="The rental's depreciation and other costs"
          />
        </Field>
      ) : null}

      {more ? (
        <div className="flex flex-col gap-2">
          <span className="text-[12.5px] font-medium">Your own full-year figures</span>
          <div className="grid grid-cols-3 gap-x-2.5 gap-y-2 max-md:grid-cols-1">
            <Field label="Taxable pay">
              <Money
                value={fullWages}
                onChange={setFullWages}
                label="Taxable pay for the whole year"
              />
            </Field>
            <Field label="Federal tax">
              <Money
                value={fullFederal}
                onChange={setFullFederal}
                label="Federal tax taken out for the whole year"
              />
            </Field>
            <Field label="Illinois tax">
              <Money
                value={fullState}
                onChange={setFullState}
                label="State tax taken out for the whole year"
              />
            </Field>
          </div>
          <span className="text-[11px] leading-snug text-[var(--m-muted)]">
            Each one you fill in replaces the stub carried to the end of the year. Useful when a
            bonus or stock is still to come.
          </span>
        </div>
      ) : (
        <TextButton onClick={() => setMore(true)} className="self-start">
          I know the full-year figures
        </TextButton>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <PillButton type="submit" filled disabled={busy || !date || !typedAmount(wages)}>
          {busy ? "Working it out" : "Work it out"}
        </PillButton>
        {onCancel ? (
          <PillButton onClick={onCancel} disabled={busy}>
            Cancel
          </PillButton>
        ) : null}
      </div>
    </form>
  );
}

export function SetAsideCard({ view }: { view: TaxesView }) {
  const { busy, run } = useTaxAct();
  const { isBalanceHidden } = useBalancePrivacy();
  const { formatAmount } = useAmountFormatting();
  const phone = useIsMobileViewport();
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  if (view.needs.includes("table")) return null;

  const e = view.estimate;
  const money = (n: number) => (isBalanceHidden ? "••••" : formatAmount(n, view.currency));
  const save = async (patch: Parameters<typeof taxesApi.setSetup>[1]) => {
    if (await run("setup", () => taxesApi.setSetup(view.year, patch))) setEditing(false);
  };

  if (!e || editing) {
    return (
      <DashboardCard
        title="Set aside for April"
        action={e ? undefined : <Chip tone="ask">a pay stub needed</Chip>}
      >
        {e ? null : (
          <p className="pb-3 text-[13px] text-[var(--m-ink-2)]">
            Three numbers from your latest pay stub, and this card says what to set aside, whether
            you are safe from the underpayment penalty, and the fix per paycheck if not.
          </p>
        )}
        <SetupForm
          view={view}
          busy={!!busy}
          onSave={save}
          onCancel={e ? () => setEditing(false) : undefined}
        />
      </DashboardCard>
    );
  }

  const owed = e.balance.total > 0;
  const lines = sumLines(e, view.year, view.setup);
  return (
    <DashboardCard
      title="Set aside for April"
      action={
        e.safe.ok ? (
          <Chip tone="taxed">penalty-safe</Chip>
        ) : (
          <Chip tone="ask">not penalty-safe yet</Chip>
        )
      }
    >
      <div className="flex flex-col gap-2.5 max-md:gap-2">
        <div className="flex min-w-0 flex-col">
          <span
            data-m-num
            className="text-[30px] font-medium tabular-nums leading-[1.1] tracking-[-0.02em] max-md:text-[26px]"
          >
            <PrivacyAmount
              value={owed ? e.balance.total : e.balance.back}
              currency={view.currency}
            />
          </span>
          <span className="text-[12.5px] text-[var(--m-muted)]">
            {owed ? (
              <>
                {e.dueBy && !phone ? `by ${shortDay(e.dueBy, true)}: ` : ""}federal{" "}
                {money(Math.max(0, e.balance.federal))}, Illinois{" "}
                {money(Math.max(0, e.balance.state))}
              </>
            ) : (
              "coming back to you, nothing to set aside"
            )}
          </span>
        </div>

        {e.safe.ok ? null : (
          <div
            data-m="notice"
            className="rounded-[14px] border border-[var(--m-warn-panel-line)] bg-[var(--m-warn-panel)] px-3.5 py-2.5 text-[12.5px] text-[var(--m-ink-2)] max-md:px-3"
          >
            <span className="text-[var(--m-warn)]">To be penalty-safe: </span>
            {fixWords(e.safe, money, phone)}.
            {e.safe.perPaycheck && !phone ? " Payroll can take the extra out with a new W-4." : ""}
          </div>
        )}

        <label className="flex items-center justify-between gap-3 text-[12.5px] text-[var(--m-ink-2)]">
          <span>Hold it back in Cash &amp; cards</span>
          <Switch
            aria-label="Hold the set-aside back in Cash & cards"
            checked={view.setup.hold}
            disabled={!!busy}
            onCheckedChange={(on) => run("hold", () => taxesApi.setSetup(view.year, { hold: on }))}
          />
        </label>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-h-[34px] items-center justify-between gap-2 border-t border-[var(--m-line-soft)] pt-1 text-left text-[12.5px] text-[var(--m-ink-2)]"
        >
          <span>{open ? "Hide the sum" : "How it adds up"}</span>
          {open ? (
            <Icons.ChevronUp className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Icons.ChevronDown className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
        {open ? (
          <ul className="flex flex-col text-[12.5px]">
            {lines.map((l) => (
              <li
                key={l.label}
                className={cn(
                  "flex items-baseline justify-between gap-3 py-1",
                  l.total && "border-t border-[var(--m-line-soft)] font-medium",
                )}
              >
                <span className="min-w-0">
                  {l.label}
                  {l.hint ? (
                    <span className="block text-[11px] font-normal text-[var(--m-muted)]">
                      {l.hint}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 whitespace-nowrap tabular-nums">
                  {l.value < 0 ? "−" : ""}
                  {money(Math.abs(l.value))}
                </span>
              </li>
            ))}
            <li className="flex items-baseline justify-between gap-3 border-t border-[var(--m-line)] py-1.5 font-medium">
              <span>{owed ? "Left to set aside" : "Coming back"}</span>
              <span className="shrink-0 whitespace-nowrap tabular-nums">
                {money(owed ? e.balance.total : e.balance.back)}
              </span>
            </li>
            <li className="pt-1 text-[11px] leading-snug text-[var(--m-muted)]">
              Left out: tax credits, the extra Medicare tax on high pay, wash sales, and anything
              not in your accounts.
              {e.tradingMissing
                ? " WheelTradr was not answering, so trading profit is not in it."
                : ""}
              {e.safe.priorJointGuess
                ? " Last year's joint tax is used whole, the safer reading."
                : ""}
            </li>
          </ul>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-[var(--m-muted)]">
          <span>
            {STATUS_LABELS[e.status]}, pay stub of {shortDay(e.stubDate)}
            {e.stubAge > 45 ? (
              <span className="text-[var(--m-warn)]"> ({e.stubAge} days old)</span>
            ) : null}
          </span>
          <TextButton onClick={() => setEditing(true)} disabled={!!busy}>
            Update
          </TextButton>
        </div>
      </div>
    </DashboardCard>
  );
}
