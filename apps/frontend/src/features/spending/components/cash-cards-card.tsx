// money-hub patch: Cash & cards, one card for the cash and the cards it pays (owner, 10-02: "combine the
// cash and the card balance into a single widget ... they are related"; design A, the split bar). It
// reads the same two views as the Free cash and Credit cards cards (lib/free-cash.ts, lib/credit-cards.ts):
// Free cash = your cash less what is already promised (card balance, the bills due soon, your cushion).
// The bills themselves are listed once, in Subscriptions & bills (Next due); here only their total.
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { useAccounts } from "@/hooks/use-accounts";
import { accountLogoUrl } from "@/lib/account-logo";
import { cn } from "@/lib/utils";
import { Icons, PrivacyAmount, Skeleton, useBalancePrivacy } from "@wealthfolio/ui";

import {
  HIGH_USE,
  asOfLabel,
  cardName,
  cardTransactionsHref,
  pctLabel,
  usedShare,
  useCreditCards,
  type CreditCard,
} from "../lib/credit-cards";
import { shortDate, useFreeCash } from "../lib/free-cash";
import { MerchantLogo } from "./merchant-logo";

export function CashCardsCard({
  currency = "USD",
  className,
  onShowBills,
}: {
  currency?: string;
  className?: string;
  /** Takes the reader to the bills (Next due in Subscriptions & bills). */
  onShowBills?: () => void;
}) {
  const cash = useFreeCash();
  const cards = useCreditCards();
  const { accounts } = useAccounts({ filterActive: false });
  const fc = cash.data;
  const cc = cards.data;
  const hasCash = !!fc && fc.accounts.length > 0;
  const hasCards = !!cc && cc.totals.count > 0;
  const asOf = asOfLabel(fc?.asOf ?? cc?.asOf ?? null);

  if (!cash.isLoading && !cards.isLoading && !hasCash && !hasCards && !cash.isError) return null;

  const head = (
    <div className="flex items-baseline justify-between gap-3">
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 className="text-sm font-medium">Cash &amp; cards</h2>
        {asOf ? (
          <span className="text-[12.5px] text-[var(--m-mint-muted)]">as of {asOf}</span>
        ) : null}
      </div>
      <Link
        to="/settings/accounts"
        className="shrink-0 text-[12.5px] underline underline-offset-4 hover:no-underline"
      >
        Choose accounts
      </Link>
    </div>
  );

  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-[20px] bg-[var(--m-mint)] px-5 py-4 text-[var(--m-mint-ink)]",
        className,
      )}
    >
      {head}
      {cash.isLoading || cards.isLoading ? (
        <div className="space-y-3" aria-busy>
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : cash.isError && !hasCards ? (
        <p className="py-4 text-center text-xs text-[var(--m-mint-muted)]">
          The money app helper did not answer.
        </p>
      ) : (
        <div className="flex flex-wrap items-stretch gap-[18px]">
          <div className="flex min-w-0 flex-[1.3_1_360px] flex-col gap-2.5">
            {hasCash && fc ? (
              <Summary view={fc} currency={currency} onShowBills={onShowBills} />
            ) : (
              <p className="text-[13px] text-[var(--m-mint-muted)]">
                No account counts as free cash yet. Switch one on in Settings, Accounts.
              </p>
            )}
          </div>
          <div className="grid min-w-0 flex-[1.7_1_520px] content-start gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
            {hasCash && fc ? (
              <List
                title={`Cash · ${fc.accounts.length} ${fc.accounts.length === 1 ? "account" : "accounts"}`}
              >
                {fc.accounts.map((a) => {
                  const account = accounts?.find((x) => x.id === a.id);
                  const logo = accountLogoUrl(account);
                  return (
                    <div
                      key={a.id}
                      className="flex items-center gap-2.5 rounded-xl bg-[var(--m-mint-tile)] px-2.5 py-2"
                    >
                      <Logo url={logo} name={account?.name ?? a.name} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px]">{account?.name ?? a.name}</div>
                        {!a.known ? (
                          <div className="text-[11.5px] text-[var(--m-mint-muted)]">
                            no balance yet
                          </div>
                        ) : a.pending !== 0 ? (
                          <div className="text-[11.5px] text-[var(--m-mint-muted)]">
                            {a.pending < 0 ? "- " : "+ "}
                            <PrivacyAmount value={Math.abs(a.pending)} currency={currency} />{" "}
                            pending
                          </div>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-[13.5px] font-medium">
                        <PrivacyAmount value={a.cash} currency={currency} />
                      </span>
                    </div>
                  );
                })}
              </List>
            ) : null}
            {hasCards && cc ? (
              <List
                title={
                  cc.totals.usedPct != null ? (
                    <>
                      Cards ·{" "}
                      <span
                        className={
                          cc.totals.usedPct >= HIGH_USE ? "text-[var(--m-warn)]" : undefined
                        }
                      >
                        {pctLabel(cc.totals.usedPct)} of limits used
                      </span>
                    </>
                  ) : (
                    `Cards · ${cc.totals.count}`
                  )
                }
              >
                <FoldedCards
                  cards={cc.cards}
                  keep={Math.max(3, hasCash && fc ? fc.accounts.length : 0)}
                  render={(c) => {
                    const account = accounts?.find((a) => a.id === c.wfAccountId);
                    return (
                      <CardRow
                        key={c.id}
                        c={c}
                        name={cardName(c, account?.name)}
                        logo={accountLogoUrl(account) ?? c.bankLogo}
                        currency={currency}
                      />
                    );
                  }}
                />
              </List>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function Summary({
  view,
  currency,
  onShowBills,
}: {
  view: NonNullable<ReturnType<typeof useFreeCash>["data"]>;
  currency: string;
  onShowBills?: () => void;
}) {
  const t = view.totals;
  const promised = t.cards + t.bills + t.cushion;
  // Not short: the bar is your cash, cut into what it already pays and what is free. Short: the bar is
  // what is promised, and the verdict says by how much the cash falls short.
  const whole = view.short ? promised : t.cash;
  const share = (x: number) => (whole > 0 ? Math.max(0, (x / whole) * 100) : 0);
  const parts = [
    { key: "cards", value: t.cards, color: "var(--m-forest)" },
    { key: "bills", value: t.bills, color: "var(--m-bills)" },
    { key: "cushion", value: t.cushion, color: "var(--m-cat-other)" },
    ...(view.short ? [] : [{ key: "free", value: t.left, color: "var(--m-forest-soft)" }]),
  ].filter((p) => p.value > 0);

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5 text-[12.5px] text-[var(--m-mint-muted)]">
            {view.short ? null : (
              <span className="h-2.5 w-2.5 rounded-[3px] bg-[var(--m-forest-soft)]" aria-hidden />
            )}
            {view.short ? "Short by" : "Free cash"}
          </span>
          <span
            className={cn(
              "text-[38px] font-medium leading-[1.1] tracking-[-0.03em]",
              view.short && "text-[var(--m-bad)]",
            )}
          >
            <PrivacyAmount value={Math.abs(t.left)} currency={currency} />
          </span>
          <span className="text-[12.5px] text-[var(--m-mint-muted)]">
            {view.short ? "to pay" : "once"} the card balance, the bills
            {t.cushion > 0 ? " and your cushion" : ""}
            {view.short ? "" : " are paid"}
          </span>
        </div>
        {view.short ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--m-warn-soft)] px-3 py-1 text-[12.5px] text-[var(--m-bad)]">
            <Icons.AlertTriangle className="h-3.5 w-3.5" />
            Short
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--m-forest)] px-3 py-1 text-[12.5px] text-[var(--m-on-forest)]">
            <Icons.Check className="h-3.5 w-3.5" />
            Covered
          </span>
        )}
      </div>

      <div className="flex justify-between gap-3 text-xs text-[var(--m-mint-muted)]">
        <span>
          Your cash, <PrivacyAmount value={t.cash} currency={currency} />
        </span>
        <span>
          Already promised, <PrivacyAmount value={promised} currency={currency} />
        </span>
      </div>
      <div
        role="img"
        aria-label="Your cash split into card balance, bills, cushion and free cash"
        className="-mt-1 flex h-4 gap-[3px]"
      >
        {parts.map((p) => (
          <div
            key={p.key}
            className="h-4 flex-none rounded-md"
            style={{ width: `calc(${share(p.value)}% - 3px)`, background: p.color }}
          />
        ))}
      </div>

      <div className="grid gap-x-3.5 gap-y-2 [grid-template-columns:repeat(auto-fit,minmax(118px,1fr))]">
        <Legend color="var(--m-forest)" label="Card balance" value={t.cards} currency={currency} />
        <Legend
          color="var(--m-bills)"
          label={`Bills by ${shortDate(view.bills.until)}`}
          value={t.bills}
          currency={currency}
          onClick={onShowBills}
        />
        {t.cushion > 0 ? (
          <Legend
            color="var(--m-cat-other)"
            label="Your cushion"
            value={t.cushion}
            currency={currency}
            to="/settings/alerts"
          />
        ) : null}
      </div>
    </>
  );
}

function Legend({
  color,
  label,
  value,
  currency,
  onClick,
  to,
}: {
  color: string;
  label: string;
  value: number;
  currency: string;
  onClick?: () => void;
  to?: string;
}) {
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--m-mint-muted)]">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
          style={{ background: color }}
          aria-hidden
        />
        <span className="min-w-0 truncate">{label}</span>
        {onClick ? <Icons.ArrowRight className="h-3 w-3 shrink-0" aria-hidden /> : null}
      </span>
      <span className="pl-4 text-[15px] font-medium">
        <PrivacyAmount value={value} currency={currency} />
      </span>
    </>
  );
  if (onClick)
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-col text-left hover:opacity-80"
      >
        {body}
      </button>
    );
  if (to)
    return (
      <Link to={to} className="flex min-w-0 flex-col hover:opacity-80">
        {body}
      </Link>
    );
  return <div className="flex min-w-0 flex-col">{body}</div>;
}

// money-hub patch: the Cards list shows as many cards as the Cash list has accounts (at least 3) so the
// two columns end level, and folds the rest behind a Show more row (owner, 10-02). A card that needs a
// sign-in or is heavily used always stays in view, so a warning never hides behind the fold.
function FoldedCards({
  cards,
  keep,
  render,
}: {
  cards: CreditCard[];
  keep: number;
  render: (c: CreditCard) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const needsLook = (c: CreditCard) => {
    const share = usedShare(c);
    return c.needsLogin || (share != null && share >= HIGH_USE);
  };
  const shown = cards.filter((c, i) => i < keep || needsLook(c));
  const folded = cards.filter((c) => !shown.includes(c));
  return (
    <>
      {(open ? cards : shown).map(render)}
      {folded.length > 0 ? (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-h-9 items-center justify-between gap-2 rounded-xl px-2.5 text-left text-[12.5px] text-[var(--m-mint-ink)] hover:bg-[var(--m-mint-tile)]"
        >
          <span>
            {open
              ? "Show less"
              : `Show ${folded.length} more ${folded.length === 1 ? "card" : "cards"}`}
          </span>
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--m-mint-tile)]"
          >
            {open ? (
              <Icons.ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <Icons.ChevronDown className="h-3.5 w-3.5" />
            )}
          </span>
        </button>
      ) : null}
    </>
  );
}

function List({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs text-[var(--m-mint-muted)]">{title}</span>
      {children}
    </div>
  );
}

function Logo({
  url,
  name,
  square,
  className,
}: {
  url: string | null | undefined;
  name: string;
  square?: boolean;
  className?: string;
}) {
  if (url)
    return (
      <MerchantLogo
        url={url}
        name={name}
        whole
        className={cn("h-7 w-7", square && "rounded-lg", className)}
      />
    );
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center bg-[var(--m-mint-tile)] text-[10.5px] font-medium",
        square ? "rounded-lg" : "rounded-full",
        className,
      )}
    >
      {name.trim().slice(0, 2).toUpperCase()}
    </span>
  );
}

function CardRow({
  c,
  name,
  logo,
  currency,
}: {
  c: CreditCard;
  name: string;
  logo: string | null;
  currency: string;
}) {
  const { isBalanceHidden } = useBalancePrivacy();
  const share = usedShare(c);
  const high = share != null && share >= HIGH_USE;
  const credit = c.owed < 0;
  const limit = c.limit ?? 0;
  const pct = (x: number) => (limit > 0 ? Math.min(100, Math.max(0, (x / limit) * 100)) : 0);
  const owedW = pct(c.owed);
  const pendingW = Math.min(100 - owedW, pct(c.pending));
  const whole = (v: number) =>
    isBalanceHidden
      ? "••••"
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency,
          maximumFractionDigits: 0,
        }).format(v);
  const cents = (v: number) =>
    isBalanceHidden
      ? "••••"
      : new Intl.NumberFormat("en-US", { style: "currency", currency }).format(v);
  // The full words: "8.6% of $22,500, + $568.43 pending". Shown on a phone, and as the row's tooltip on
  // desktop, where the row keeps to one line.
  const detail = [
    c.needsLogin
      ? "Sign in again"
      : credit
        ? "credit on the card"
        : share != null
          ? `${pctLabel(share)}${c.limit != null ? ` of ${whole(c.limit)}` : ""}`
          : "owed",
    c.pending !== 0
      ? `${c.pending > 0 ? "+ " : "- "}${cents(Math.abs(c.pending))}${c.pending > 0 ? " pending" : " pending refund"}`
      : null,
  ]
    .filter(Boolean)
    .join(", ");
  // money-hub patch: on desktop a card row is ONE line (logo, name, how much of the limit is used, the
  // amount); on a phone it is two (name over the full words). The usage bar is a thin line along the
  // row's foot (owner, 10-02).
  return (
    <Link
      to={cardTransactionsHref(c)}
      title={`${name}: ${detail}`}
      className="relative flex items-center gap-2.5 rounded-xl bg-[var(--m-mint-tile)] px-2.5 pb-2.5 pt-2 hover:opacity-90 md:pb-2 md:pt-1.5"
    >
      <Logo url={logo} name={c.bank} square className="md:h-[22px] md:w-[22px]" />
      {c.limit != null ? (
        <div
          className="absolute bottom-[5px] left-12 right-2.5 flex h-[3px] overflow-hidden rounded-full bg-[var(--m-track)] md:bottom-1 md:left-[42px]"
          aria-hidden
        >
          <div
            style={{
              width: `${owedW}%`,
              minWidth: c.owed > 0 ? 3 : 0,
              background: high ? "var(--m-warn-line)" : "var(--m-forest)",
            }}
          />
          {pendingW > 0 ? (
            <div
              style={{ width: `${pendingW}%`, minWidth: 2, background: "var(--m-forest-soft)" }}
            />
          ) : null}
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px]">{name}</div>
        <div
          className={cn(
            "truncate text-[11.5px] text-[var(--m-mint-muted)] md:hidden",
            (c.needsLogin || high) && "text-[var(--m-warn)]",
          )}
        >
          {detail}
        </div>
      </div>
      <span
        className={cn(
          "hidden shrink-0 text-[11.5px] text-[var(--m-mint-muted)] md:inline",
          (c.needsLogin || high) && "text-[var(--m-warn)]",
        )}
      >
        {c.needsLogin
          ? "Sign in again"
          : credit
            ? "credit"
            : share != null
              ? pctLabel(share)
              : null}
      </span>
      <span className="shrink-0 text-[13.5px] font-medium">
        <PrivacyAmount value={credit ? -c.owed : c.owed} currency={currency} />
      </span>
    </Link>
  );
}
