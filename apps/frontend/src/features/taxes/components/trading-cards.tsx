// money-hub patch: Taxes, the trading part. The hero says how much of the year's trading profit is
// taxed (the split bar: held under a year, over a year, dividends and interest, and what sits in
// accounts that are not taxed), and the list under it says which account is which. WheelTradr's own
// numbers; an account's label is read from its name until the owner picks one.
import { Link } from "react-router-dom";

import { DashboardCard } from "@/components/dashboard-card";
import { PhoneFold } from "@/features/spending/components/phone-fold";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { cn } from "@/lib/utils";
import { PrivacyAmount } from "@wealthfolio/ui";

import {
  TREATMENT_HINTS,
  TREATMENT_LABELS,
  barParts,
  listed,
  taxesApi,
  type TaxAccount,
  type TaxesView,
  type Treatment,
} from "../lib/taxes";
import { Amount, PickChip, Row, useTaxAct, type ChipTone } from "./parts";

const TONE: Record<Treatment, ChipTone> = { taxed: "taxed", not_taxed: "free", not_mine: "plain" };
const OPTIONS = (Object.keys(TREATMENT_LABELS) as Treatment[]).map((value) => ({
  value,
  label: TREATMENT_LABELS[value][0].toUpperCase() + TREATMENT_LABELS[value].slice(1),
  hint: TREATMENT_HINTS[value],
}));

function LegendItem({
  color,
  label,
  value,
  currency,
}: {
  color: string;
  label: string;
  value: number;
  currency: string;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--m-mint-muted)]">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-[3px] max-md:h-2 max-md:w-2 max-md:rounded-[2px]"
          style={{ background: color }}
          aria-hidden
        />
        <span className="min-w-0 truncate">{label}</span>
      </span>
      <span className="whitespace-nowrap pl-4 text-[15px] font-medium tabular-nums max-md:pl-0 max-md:text-sm">
        <PrivacyAmount value={value} currency={currency} />
      </span>
    </div>
  );
}

export function TaxesHero({ view }: { view: TaxesView }) {
  const phone = useIsMobileViewport();
  const t = view.trading;
  const thisYear = view.year === Number(view.today.slice(0, 4));
  const head = (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-medium">Trading</h2>
      <span className="text-[12.5px] text-[var(--m-mint-muted)]">from WheelTradr</span>
    </div>
  );
  const shell =
    "flex flex-col gap-3 rounded-[20px] bg-[var(--m-mint)] px-5 py-4 text-[var(--m-mint-ink)] max-md:gap-1.5 max-md:px-3 max-md:py-2.5";

  if (t.error) {
    return (
      <section data-m="hero" className={shell}>
        {head}
        <p className="text-[13.5px] text-[var(--m-mint-muted)]">
          {t.error === "not-connected" ? (
            <>
              Connect WheelTradr to see the trading profit that is taxed.{" "}
              <Link
                to="/settings/wheeltradr"
                className="underline underline-offset-4 hover:no-underline"
              >
                Settings, WheelTradr
              </Link>
            </>
          ) : (
            "WheelTradr's yearly numbers are not answering right now. The rest of the page still works."
          )}
        </p>
      </section>
    );
  }

  const loss = t.taxed < 0;
  const left = t.accounts.filter((a) => a.treatment === "not_mine").map((a) => a.name);
  const parts = barParts(t);
  const total = parts.reduce((s, p) => s + p.value, 0);
  const legend = [
    {
      color: "var(--m-forest)",
      label: phone ? "Under a year" : "Held under a year",
      value: t.shortTerm,
      show: true,
    },
    {
      color: "var(--m-forest-today)",
      label: phone ? "Over a year" : "Held over a year",
      value: t.longTerm,
      show: t.longTerm !== 0,
    },
    {
      color: "var(--m-forest-soft)",
      label: phone ? "Dividends" : "Dividends, interest",
      value: t.other,
      show: t.other !== 0,
    },
    { color: "var(--m-bills)", label: "Not taxed", value: t.notTaxed, show: t.notTaxed !== 0 },
  ].filter((l) => l.show);

  return (
    <section data-m="hero" className={shell}>
      {head}
      {t.accounts.length === 0 ? (
        <p className="text-[13.5px] text-[var(--m-mint-muted)]">
          Nothing was closed in {view.year}.
        </p>
      ) : (
        <>
          <div className="flex min-w-0 flex-col">
            <span className="text-[12.5px] text-[var(--m-mint-muted)]">
              {loss ? "Taxed trading loss" : "Taxed trading profit"}, {view.year}
              {thisYear ? " so far" : ""}
            </span>
            <span
              data-m-num="hero"
              className={cn(
                "text-[38px] font-medium leading-[1.1] tracking-[-0.03em] max-md:text-[30px]",
                loss && "text-[var(--m-bad)]",
              )}
            >
              <PrivacyAmount value={Math.abs(t.taxed)} currency={view.currency} />
            </span>
            <span className="text-[12.5px] text-[var(--m-mint-muted)]">
              of <PrivacyAmount value={t.taxed + t.notTaxed} currency={view.currency} />{" "}
              {phone ? "in your accounts" : "taken in your accounts"}
              {left.length && !phone ? `, ${listed(left)} left out` : ""}
            </span>
          </div>
          {total > 0 ? (
            <div
              role="img"
              aria-label="The year's profit split into what is taxed and what is not"
              className="flex h-4 gap-[3px] max-md:h-2.5"
            >
              {parts.map((p) => (
                <div
                  key={p.key}
                  className="h-full min-w-1 rounded-md max-md:rounded-[5px]"
                  style={{ flex: `${p.value} 1 0%`, background: p.color }}
                />
              ))}
            </div>
          ) : null}
          <div
            className="grid gap-x-3.5 gap-y-2 [grid-template-columns:repeat(auto-fit,minmax(118px,1fr))] max-md:gap-x-2 max-md:pb-2"
            style={
              phone
                ? {
                    gridTemplateColumns: `repeat(${legend.length > 3 ? 2 : legend.length}, minmax(0, 1fr))`,
                  }
                : undefined
            }
          >
            {legend.map((l) => (
              <LegendItem
                key={l.label}
                color={l.color}
                label={l.label}
                value={l.value}
                currency={view.currency}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function AccountRow({
  a,
  view,
  busy,
  onPick,
}: {
  a: TaxAccount;
  view: TaxesView;
  busy: boolean;
  onPick: (t: Treatment) => void;
}) {
  return (
    <Row muted={a.treatment === "not_mine"}>
      {a.logoUrl ? (
        <img
          src={a.logoUrl}
          alt=""
          className="h-5 w-5 shrink-0 rounded-[6px] object-cover"
          onError={(e) => {
            e.currentTarget.style.visibility = "hidden";
          }}
        />
      ) : (
        <span className="h-5 w-5 shrink-0 rounded-[6px] bg-[var(--m-tile)]" aria-hidden />
      )}
      <span className="min-w-0 truncate">{a.name}</span>
      <PickChip<Treatment>
        tone={TONE[a.treatment]}
        label={TREATMENT_LABELS[a.treatment]}
        value={a.treatment}
        options={OPTIONS}
        disabled={busy}
        ariaLabel={`${a.name}: ${TREATMENT_LABELS[a.treatment]}. Change`}
        onPick={onPick}
      />
      <Amount value={a.realized} currency={view.currency} signed />
    </Row>
  );
}

export function AccountsCard({ view }: { view: TaxesView }) {
  const { busy, run } = useTaxAct();
  const t = view.trading;
  if (t.error || t.accounts.length === 0) return null;
  const taxed = t.accounts.filter((a) => a.treatment === "taxed");
  const rest = t.accounts.filter((a) => a.treatment !== "taxed");
  const count = (k: Treatment) => rest.filter((a) => a.treatment === k).length;
  const folded = [
    count("not_taxed") ? `${count("not_taxed")} not taxed` : null,
    count("not_mine") ? `${count("not_mine")} not mine` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const row = (a: TaxAccount) => (
    <AccountRow
      key={a.id}
      a={a}
      view={view}
      busy={!!busy}
      onPick={(treatment) =>
        run(`account-${a.id}`, () => taxesApi.setAccount(view.year, a.id, treatment))
      }
    />
  );
  return (
    <DashboardCard title="Profit by account" subtitle={`${view.year}`}>
      <ul className="flex flex-col">{taxed.map(row)}</ul>
      {rest.length ? (
        <PhoneFold id="taxes-accounts" closedLabel={folded} openLabel="Hide them">
          <ul
            className={cn(
              "flex flex-col",
              taxed.length > 0 && "border-t border-[var(--m-line-soft)]",
            )}
          >
            {rest.map(row)}
          </ul>
        </PhoneFold>
      ) : null}
      {t.accounts.some((a) => a.guessed) ? (
        <p className="pt-2 text-xs text-[var(--m-muted)] max-md:hidden">
          Read from the account names. Tap a label to change it.
        </p>
      ) : null}
    </DashboardCard>
  );
}
