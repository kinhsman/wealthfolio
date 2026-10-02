// money-hub patch: Taxes, three plain cards. Worth a look: what needs the owner, in words. Paid: the
// payments to the IRS and the state found in the banks, each with the tax year it counts for (one tap
// to change: April's payment is last year's bill). Dates: the year's due dates and what was sent by each.
import { Link } from "react-router-dom";

import { DashboardCard } from "@/components/dashboard-card";
import { PhoneFold } from "@/features/spending/components/phone-fold";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { cn } from "@/lib/utils";
import { PrivacyAmount } from "@wealthfolio/ui";

import {
  inDays,
  shortDay,
  taxesApi,
  yearChoices,
  type TaxDate,
  type TaxLook,
  type TaxPayment,
  type TaxesView,
} from "../lib/taxes";
import { Amount, Chip, PickChip, Row, useTaxAct } from "./parts";

function Notice({ look, currency }: { look: TaxLook; currency: string }) {
  const warn = look.tone === "warn";
  return (
    <div
      data-m={warn ? "notice" : undefined}
      className={cn(
        "flex flex-col gap-1 rounded-[14px] px-3.5 py-3 max-md:px-3 max-md:py-2.5",
        warn
          ? "border border-[var(--m-warn-panel-line)] bg-[var(--m-warn-panel)]"
          : "bg-[var(--m-tile)]",
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-baseline justify-between gap-x-3",
          warn && "text-[var(--m-warn)]",
        )}
      >
        <h3 className="text-[13.5px] font-medium">{look.title}</h3>
        {look.amount != null ? (
          <span className="whitespace-nowrap text-[13.5px] tabular-nums">
            <PrivacyAmount value={look.amount} currency={currency} />
          </span>
        ) : null}
      </div>
      <p className="max-w-[64ch] text-[12.5px] text-[var(--m-ink-2)]">{look.text}</p>
    </div>
  );
}

export function LooksCard({ view }: { view: TaxesView }) {
  if (!view.looks.length) return null;
  const [first, ...rest] = view.looks;
  return (
    <DashboardCard title="Worth a look">
      <div className="flex flex-col gap-2">
        <Notice look={first} currency={view.currency} />
        {rest.length ? (
          <PhoneFold
            id="taxes-looks"
            closedLabel={`${rest.length} more`}
            openLabel="Hide them"
            className="mt-0"
          >
            {rest.map((l) => (
              <Notice key={l.key} look={l} currency={view.currency} />
            ))}
          </PhoneFold>
        ) : null}
      </div>
    </DashboardCard>
  );
}

function PaymentRow({
  p,
  view,
  busy,
  onPick,
}: {
  p: TaxPayment;
  view: TaxesView;
  busy: boolean;
  onPick: (y: number) => void;
}) {
  const back = p.amount < 0;
  return (
    <Row>
      <span className="w-[52px] shrink-0 text-xs text-[var(--m-muted)]">{shortDay(p.date)}</span>
      <span className="min-w-0 truncate">
        {p.name}
        {back ? ", money back" : ""}
      </span>
      <PickChip<number>
        tone={p.sure ? "plain" : "ask"}
        label={`for ${p.taxYear}${p.sure ? "" : "?"}`}
        value={p.taxYear}
        options={yearChoices(p).map((y) => ({
          value: y,
          label: `For ${y}`,
          hint:
            y === Number(p.date.slice(0, 4))
              ? "A payment toward that year"
              : "The bill for the year before",
        }))}
        disabled={busy}
        ariaLabel={`Counted for ${p.taxYear}. Change the tax year`}
        onPick={onPick}
      />
      <Amount
        value={Math.abs(p.amount)}
        currency={view.currency}
        className={back ? "text-[var(--m-muted)]" : undefined}
      />
    </Row>
  );
}

export function PaidCard({ view }: { view: TaxesView }) {
  const { busy, run } = useTaxAct();
  const rows = view.paid.rows;
  const parts = [
    view.paid.federal ? { name: "IRS", value: view.paid.federal } : null,
    view.paid.state ? { name: "state", value: view.paid.state } : null,
  ].filter((x): x is { name: string; value: number } => !!x);
  return (
    <DashboardCard title="Paid" subtitle={`for ${view.year}, found in your bank`}>
      {rows.length === 0 ? (
        <p className="text-[13px] text-[var(--m-muted)]">
          No tax payment for {view.year} in your bank records.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2.5 pb-1">
            <span
              data-m-num
              className="text-2xl font-medium tabular-nums tracking-[-0.02em] max-md:text-[22px]"
            >
              <PrivacyAmount value={view.paid.total} currency={view.currency} />
            </span>
            {parts.length > 1 ? (
              <span className="text-[12.5px] text-[var(--m-muted)]">
                {parts.map((x, i) => (
                  <span key={x.name}>
                    {i ? ", " : ""}
                    {x.name} <PrivacyAmount value={x.value} currency={view.currency} />
                  </span>
                ))}
              </span>
            ) : null}
          </div>
          <PhoneFold
            id="taxes-paid"
            closedLabel={`${rows.length} ${rows.length === 1 ? "payment" : "payments"}`}
            openLabel="Hide them"
          >
            <ul className="flex flex-col border-t border-[var(--m-line-soft)]">
              {rows.map((p) => (
                <PaymentRow
                  key={p.id}
                  p={p}
                  view={view}
                  busy={!!busy}
                  onPick={(taxYear) =>
                    run(`payment-${p.id}`, () => taxesApi.setPayment(view.year, p.id, taxYear))
                  }
                />
              ))}
            </ul>
          </PhoneFold>
        </>
      )}
      <p className="pt-2 text-xs text-[var(--m-muted)]">
        Tax taken out of your paychecks is not counted here yet.
      </p>
    </DashboardCard>
  );
}

function DateRow({ d, next, currency }: { d: TaxDate; next: boolean; currency: string }) {
  const money = d.sent != null && d.sent > 0;
  return (
    <Row muted={d.past}>
      <span className="w-[52px] shrink-0 text-xs text-[var(--m-muted)]">{shortDay(d.date)}</span>
      <span className="min-w-0 flex-1">{d.label}</span>
      {next ? (
        <Chip tone="taxed" className="max-md:hidden">
          next
        </Chip>
      ) : null}
      <span className="shrink-0 whitespace-nowrap text-xs text-[var(--m-muted)]">
        {money ? (
          <>
            sent <PrivacyAmount value={d.sent ?? 0} currency={currency} />
          </>
        ) : d.past ? (
          d.sent != null ? (
            "nothing sent"
          ) : (
            ""
          )
        ) : (
          inDays(d.days)
        )}
      </span>
    </Row>
  );
}

export function DatesCard({ view }: { view: TaxesView }) {
  const phone = useIsMobileViewport();
  const past = view.dates.filter((d) => d.past);
  const ahead = view.dates.filter((d) => !d.past);
  const rows = (list: TaxDate[], markNext: boolean) =>
    list.map((d, i) => (
      <DateRow key={d.key} d={d} next={markNext && i === 0} currency={view.currency} />
    ));
  return (
    <DashboardCard
      title="Dates"
      subtitle={`${view.year}`}
      action={
        <Link
          to="/settings/alerts"
          className="text-xs text-[var(--m-muted)] underline-offset-4 hover:underline"
        >
          Alerts a week before
        </Link>
      }
    >
      {phone ? (
        // On a phone what is coming shows first; the dates gone by fold under it.
        <>
          <ul className="flex flex-col">{rows(ahead, true)}</ul>
          {past.length ? (
            <PhoneFold
              id="taxes-dates"
              closedLabel={`${past.length} earlier ${past.length === 1 ? "date" : "dates"}`}
              openLabel="Hide the earlier dates"
            >
              <ul
                className={cn(
                  "flex flex-col",
                  ahead.length > 0 && "border-t border-[var(--m-line-soft)]",
                )}
              >
                {rows(past, false)}
              </ul>
            </PhoneFold>
          ) : null}
        </>
      ) : (
        <ul className="flex flex-col">
          {rows(past, false)}
          {rows(ahead, true)}
        </ul>
      )}
    </DashboardCard>
  );
}
