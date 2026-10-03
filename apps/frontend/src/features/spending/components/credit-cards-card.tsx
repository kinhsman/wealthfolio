// money-hub patch: the Spending dashboard's Credit cards card (lib/credit-cards.ts): what is owed on
// the cards now, how much of each limit it uses, and what is still pending. Each card opens its
// transactions. Shown only when a card is linked (Settings, Banks).
import type React from "react";
import { Link } from "react-router-dom";

import { DashboardCard } from "@/components/dashboard-card";
import { useAccounts } from "@/hooks/use-accounts";
import { accountLogoUrl } from "@/lib/account-logo";
import { PrivacyAmount, useAmountFormatting, useBalancePrivacy } from "@wealthfolio/ui";

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
import { MerchantLogo } from "./merchant-logo";

// Inline colours: the dark theme turns the amber utilities white.
const AMBER = "#d97706";

export function CreditCardsCard({
  currency = "USD",
  color = "currentColor",
  darkColor,
  className,
}: {
  currency?: string;
  /** The bar's colour (the Spending theme's), and a lighter one for the dark theme. */
  color?: string;
  darkColor?: string;
  className?: string;
}) {
  const { data, isLoading, isError } = useCreditCards();
  const { accounts } = useAccounts({ filterActive: false });
  if (!isLoading && !isError && (!data || data.totals.count === 0)) return null;
  const note = (text: string) => (
    <div className="text-muted-foreground px-4 py-6 text-center text-xs md:px-5">{text}</div>
  );
  const asOf = asOfLabel(data?.asOf ?? null);
  const t = data?.totals;

  return (
    <div className={className}>
      <DashboardCard
        title="Credit cards"
        subtitle={t ? `${t.count} ${t.count === 1 ? "card" : "cards"}` : undefined}
        padded={false}
        action={
          asOf ? <span className="text-muted-foreground/70 text-xs">as of {asOf}</span> : undefined
        }
      >
        {isLoading ? (
          note("Reading your cards.")
        ) : isError || !data || !t ? (
          note("The money app helper did not answer.")
        ) : (
          <>
            <div className="flex items-end justify-between gap-3 px-4 pb-3 pt-3 md:px-5">
              <div className="min-w-0">
                <div className="text-2xl font-semibold tabular-nums">
                  <PrivacyAmount value={t.owed} currency={currency} />
                </div>
                <div className="text-muted-foreground text-xs">owed now</div>
                {t.pending > 0 ? (
                  <div className="text-muted-foreground text-xs tabular-nums">
                    + <PrivacyAmount value={t.pending} currency={currency} /> pending
                  </div>
                ) : null}
              </div>
              <div className="text-muted-foreground shrink-0 space-y-0.5 text-right text-xs tabular-nums">
                {t.usedPct != null ? (
                  <div style={t.usedPct >= HIGH_USE ? { color: AMBER } : undefined}>
                    {pctLabel(t.usedPct)} of limits used
                  </div>
                ) : null}
                {t.available != null ? (
                  <div>
                    <WholeAmount value={t.available} currency={currency} /> available
                  </div>
                ) : null}
              </div>
            </div>
            <div className="border-border/60 border-t px-2 py-2 md:px-3">
              {data.cards.map((c) => {
                const account = accounts?.find((a) => a.id === c.wfAccountId);
                return (
                  <CardRow
                    key={c.id}
                    c={c}
                    name={cardName(c, account?.name)}
                    logo={accountLogoUrl(account) ?? c.bankLogo}
                    currency={currency}
                    color={color}
                    darkColor={darkColor ?? color}
                  />
                );
              })}
            </div>
          </>
        )}
      </DashboardCard>
    </div>
  );
}

function CardRow({
  c,
  name,
  logo,
  currency,
  color,
  darkColor,
}: {
  c: CreditCard;
  name: string;
  logo: string | null;
  currency: string;
  color: string;
  darkColor: string;
}) {
  const share = usedShare(c);
  const high = share != null && share >= HIGH_USE;
  const credit = c.owed < 0;
  return (
    <Link
      to={cardTransactionsHref(c)}
      className="hover:bg-muted/40 flex items-center gap-3 rounded-md px-2 py-2 transition-colors"
    >
      <MerchantLogo url={logo} name={c.bank} whole className="h-8 w-8" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-foreground/90 truncate text-xs font-medium">{name}</span>
          <span className="shrink-0 text-xs font-medium tabular-nums">
            <PrivacyAmount value={credit ? -c.owed : c.owed} currency={currency} />
          </span>
        </div>
        {c.limit != null ? (
          <UsageBar c={c} color={high ? AMBER : color} darkColor={high ? AMBER : darkColor} />
        ) : null}
        <div className="text-muted-foreground mt-1 flex items-baseline justify-between gap-2 text-[11px] tabular-nums">
          <span className="min-w-0 truncate">
            {c.needsLogin ? (
              <span style={{ color: AMBER }}>Sign in again</span>
            ) : credit ? (
              "credit on the card"
            ) : share != null ? (
              <span style={high ? { color: AMBER } : undefined}>{pctLabel(share)} used</span>
            ) : (
              "owed"
            )}
          </span>
          {c.limit != null ? (
            <span className="shrink-0">
              of <WholeAmount value={c.limit} currency={currency} />
            </span>
          ) : null}
        </div>
        {c.pending !== 0 ? (
          <div className="text-muted-foreground text-[11px] tabular-nums">
            {c.pending > 0 ? "+ " : "- "}
            <PrivacyAmount value={Math.abs(c.pending)} currency={currency} />
            {c.pending > 0 ? " pending" : " pending refund"}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

/** The limit as a track: the posted balance solid, pending charges after it lighter. */
function UsageBar({ c, color, darkColor }: { c: CreditCard; color: string; darkColor: string }) {
  const limit = c.limit ?? 0;
  const pct = (x: number) => (limit > 0 ? Math.min(100, Math.max(0, (x / limit) * 100)) : 0);
  const owed = pct(c.owed);
  const pending = Math.min(100 - owed, pct(c.pending));
  const fill = "bg-[var(--bar)] dark:bg-[var(--bar-dark)]";
  return (
    <div
      className="bg-muted mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full"
      style={{ "--bar": color, "--bar-dark": darkColor } as React.CSSProperties}
      aria-hidden
    >
      <div className={fill} style={{ width: `${owed}%`, minWidth: c.owed > 0 ? 3 : 0 }} />
      {pending > 0 ? (
        <div className={fill} style={{ width: `${pending}%`, minWidth: 2, opacity: 0.35 }} />
      ) : null}
    </div>
  );
}

/** A limit or what is left of it, in whole dollars ("$22,500"). */
function WholeAmount({ value, currency }: { value: number; currency: string }) {
  const { isBalanceHidden } = useBalancePrivacy();
  const { formatRoundedAmount } = useAmountFormatting();
  if (isBalanceHidden) return <span>••••</span>;
  return <span>{formatRoundedAmount(value, currency)}</span>;
}
