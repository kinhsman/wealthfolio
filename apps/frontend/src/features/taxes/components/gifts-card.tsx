// money-hub patch: Taxes, gifts both ways (owner, 10-02: "i also sent wire out as gift ... probly 2
// separate forms"). In: the wires from abroad, which need Form 3520 past $100,000 in a year. Out: each
// wire is a gift to someone or the owner's own money moving; past the yearly limit to one person it
// needs Form 709. A wire that landed in an account marked not mine comes with that person's name
// already on it; the rest are sorted with one tap each.
import { useState, type FormEvent } from "react";

import { DashboardCard } from "@/components/dashboard-card";
import { PhoneFold } from "@/features/spending/components/phone-fold";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { cn } from "@/lib/utils";
import { Icons, PrivacyAmount } from "@wealthfolio/ui";
import { useUsdWhole } from "@/lib/app-currency";

import {
  knownPeople,
  shortDay,
  taxesApi,
  type GiftIn,
  type GiftOut,
  type TaxesView,
} from "../lib/taxes";
import { Amount, Chip, FIELD, PillButton, Row, TextButton, useTaxAct } from "./parts";

/** How many wires to sort show before "Show all". */
const SORT_SHOWN = 5;

function BlockHead({
  label,
  total,
  currency,
  chip,
}: {
  label: string;
  total: number;
  currency: string;
  chip: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <div className="flex min-w-0 flex-col">
        <span className="text-xs text-[var(--m-muted)]">{label}</span>
        <span
          data-m-num
          className="text-2xl font-medium tabular-nums tracking-[-0.02em] max-md:text-[22px]"
        >
          <PrivacyAmount value={total} currency={currency} />
        </span>
      </div>
      <span className="ml-auto">{chip}</span>
    </div>
  );
}

function InRow({
  r,
  busy,
  currency,
  onCount,
}: {
  r: GiftIn;
  busy: boolean;
  currency: string;
  onCount: (on: boolean) => void;
}) {
  return (
    <Row muted={!r.counted}>
      <button
        type="button"
        role="checkbox"
        aria-checked={r.counted}
        aria-label={`${shortDay(r.date)}: counted as a gift from abroad`}
        disabled={busy}
        onClick={() => onCount(!r.counted)}
        className={cn(
          "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border disabled:opacity-50",
          r.counted
            ? "border-[var(--m-forest)] bg-[var(--m-forest)] text-[var(--m-on-forest)]"
            : "border-[var(--m-line)] bg-[var(--m-surface)]",
        )}
      >
        {r.counted ? <Icons.Check className="h-3 w-3" aria-hidden /> : null}
      </button>
      <span className="w-[52px] shrink-0 text-xs text-[var(--m-muted)]">{shortDay(r.date)}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-[var(--m-muted)]">
        {r.from || r.account || ""}
      </span>
      <Amount value={r.amount} currency={currency} />
    </Row>
  );
}

/** A wire out waiting for the owner's word: a name that fits, someone else, or their own move. */
function SortRow({
  r,
  people,
  busy,
  currency,
  onGift,
  onMine,
  onClose,
}: {
  r: GiftOut;
  people: string[];
  busy: boolean;
  currency: string;
  onGift: (to: string) => void;
  onMine: () => void;
  onClose?: () => void;
}) {
  const phone = useIsMobileViewport();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const quick = [...new Set([r.offered, ...people].filter(Boolean))].slice(0, 3);
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) onGift(name.trim());
  };
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-[var(--m-line-soft)] py-2 text-[13.5px] first:border-t-0 max-md:text-[13px]">
      <span className="w-[52px] shrink-0 text-xs text-[var(--m-muted)]">{shortDay(r.date)}</span>
      <span className="shrink-0 whitespace-nowrap tabular-nums">
        <PrivacyAmount value={r.amount} currency={currency} />
      </span>
      {naming ? (
        <form
          onSubmit={save}
          className="flex min-w-0 flex-1 basis-full items-center gap-2 md:basis-0"
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Who got it"
            aria-label="Who got this gift"
            className={FIELD}
          />
          <PillButton type="submit" filled disabled={busy || !name.trim()}>
            Save
          </PillButton>
          <PillButton onClick={() => setNaming(false)} disabled={busy}>
            Cancel
          </PillButton>
        </form>
      ) : (
        <span className="flex min-w-0 flex-1 basis-full flex-wrap items-center gap-1.5 md:basis-0 md:justify-end">
          {quick.map((p) => (
            <PillButton key={p} onClick={() => onGift(p)} disabled={busy}>
              {phone ? p : `Gift to ${p}`}
            </PillButton>
          ))}
          <PillButton onClick={() => setNaming(true)} disabled={busy}>
            {quick.length ? (phone ? "Other" : "Someone else") : "A gift"}
          </PillButton>
          <PillButton onClick={onMine} disabled={busy}>
            {phone ? "Mine" : "My own money"}
          </PillButton>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Leave it as it is"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--m-muted)] hover:bg-[var(--m-tile)]"
            >
              <Icons.X className="h-3 w-3" aria-hidden />
            </button>
          ) : null}
        </span>
      )}
    </li>
  );
}

export function GiftsCard({ view }: { view: TaxesView }) {
  const whole = useUsdWhole();
  const { busy, run } = useTaxAct();
  const [showIn, setShowIn] = useState(false);
  const [showSorted, setShowSorted] = useState(false);
  const [changing, setChanging] = useState<string | null>(null);
  const [allToSort, setAllToSort] = useState(false);
  const { received, sent } = view.gifts;
  const year = view.year;
  if (!received.rows.length && !sent.rows.length) return null;

  const people = knownPeople(sent.rows);
  const toSort = sent.rows.filter((r) => r.gift === null);
  const sorted = sent.rows.filter((r) => r.gift !== null);
  const gift = (r: GiftOut, to: string) =>
    run(`gift-${r.id}`, () => taxesApi.setGiftOut(year, r.id, { gift: true, to })).then(() =>
      setChanging(null),
    );
  const mine = (r: GiftOut) =>
    run(`gift-${r.id}`, () => taxesApi.setGiftOut(year, r.id, { gift: false })).then(() =>
      setChanging(null),
    );

  return (
    <DashboardCard title="Gifts" subtitle={`${year}`}>
      <div className="flex flex-col gap-3 max-md:gap-2">
        {received.rows.length ? (
          <div className="flex flex-col gap-1">
            <BlockHead
              label={`In from abroad, ${received.count} ${received.count === 1 ? "wire" : "wires"}`}
              total={received.total}
              currency={view.currency}
              chip={
                received.over ? (
                  <Chip tone="ask">needs Form 3520</Chip>
                ) : (
                  <Chip tone="plain">under {whole(received.limit)}</Chip>
                )
              }
            />
            {showIn ? (
              <ul className="flex flex-col border-t border-[var(--m-line-soft)]">
                {received.rows.map((r) => (
                  <InRow
                    key={r.id}
                    r={r}
                    busy={!!busy}
                    currency={view.currency}
                    onCount={(on) => run(`in-${r.id}`, () => taxesApi.setGiftIn(year, r.id, on))}
                  />
                ))}
              </ul>
            ) : null}
            <TextButton onClick={() => setShowIn(!showIn)} className="self-start">
              {showIn ? "Hide the wires" : "Show the wires"}
            </TextButton>
          </div>
        ) : null}

        {sent.rows.length ? (
          <div
            className={cn(
              "flex flex-col gap-1",
              received.rows.length > 0 && "border-t border-[var(--m-line-soft)] pt-3 max-md:pt-2",
            )}
          >
            <BlockHead
              label="Gifts you sent"
              total={sent.total}
              currency={view.currency}
              chip={
                sent.over ? (
                  <Chip tone="ask">needs Form 709</Chip>
                ) : toSort.length && sent.matters ? (
                  <Chip tone="ask">{toSort.length} to sort</Chip>
                ) : (
                  <Chip tone="plain">under {whole(sent.limit)} each</Chip>
                )
              }
            />
            {sent.people.length ? (
              <ul className="flex flex-col">
                {sent.people.map((p) => (
                  <Row key={p.name}>
                    <span className="min-w-0 truncate">{p.name}</span>
                    <span className="shrink-0 text-xs text-[var(--m-muted)]">
                      {p.count} {p.count === 1 ? "wire" : "wires"}
                    </span>
                    {p.over ? <Chip tone="ask">over {whole(sent.limit)}</Chip> : null}
                    <Amount value={p.total} currency={view.currency} />
                  </Row>
                ))}
              </ul>
            ) : null}

            {toSort.length && !sent.matters ? (
              <p className="text-xs text-[var(--m-muted)]">
                {toSort.length} {toSort.length === 1 ? "wire" : "wires"} out,{" "}
                <PrivacyAmount value={sent.unsorted.total} currency={view.currency} /> in all: under
                the yearly limit whoever got them.
              </p>
            ) : null}
            {toSort.length && sent.matters ? (
              <PhoneFold
                id="taxes-wires"
                closedLabel={`${toSort.length} ${toSort.length === 1 ? "wire" : "wires"} to sort`}
                openLabel="Hide the wires to sort"
              >
                <div className="mt-1 rounded-[14px] bg-[var(--m-tile)] px-3 py-1.5 max-md:mb-2">
                  <div className="flex items-baseline justify-between gap-2 pb-0.5 pt-1 text-xs text-[var(--m-muted)]">
                    <span>
                      {toSort.length} {toSort.length === 1 ? "wire" : "wires"} out to sort
                    </span>
                    <span className="tabular-nums">
                      <PrivacyAmount value={sent.unsorted.total} currency={view.currency} />
                    </span>
                  </div>
                  <ul className="flex flex-col">
                    {(allToSort ? toSort : toSort.slice(0, SORT_SHOWN)).map((r) => (
                      <SortRow
                        key={r.id}
                        r={r}
                        people={people}
                        busy={!!busy}
                        currency={view.currency}
                        onGift={(to) => gift(r, to)}
                        onMine={() => mine(r)}
                      />
                    ))}
                  </ul>
                  {toSort.length > SORT_SHOWN ? (
                    <TextButton onClick={() => setAllToSort(!allToSort)} className="mb-1.5 mt-0.5">
                      {allToSort ? "Show fewer" : `Show all ${toSort.length}`}
                    </TextButton>
                  ) : null}
                </div>
              </PhoneFold>
            ) : null}

            {sorted.length ? (
              <>
                {showSorted ? (
                  <ul className="flex flex-col border-t border-[var(--m-line-soft)]">
                    {sorted.map((r) =>
                      changing === r.id ? (
                        <SortRow
                          key={r.id}
                          r={r}
                          people={people}
                          busy={!!busy}
                          currency={view.currency}
                          onGift={(to) => gift(r, to)}
                          onMine={() => mine(r)}
                          onClose={() => setChanging(null)}
                        />
                      ) : (
                        <Row key={r.id} muted={!r.gift}>
                          <span className="w-[52px] shrink-0 text-xs text-[var(--m-muted)]">
                            {shortDay(r.date)}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {r.gift ? `Gift to ${r.to || "someone"}` : "Your own money"}
                          </span>
                          <button
                            type="button"
                            onClick={() => setChanging(r.id)}
                            disabled={!!busy}
                            aria-label="Change what this wire was"
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--m-muted)] hover:bg-[var(--m-tile)] disabled:opacity-50"
                          >
                            <Icons.Pencil className="h-3 w-3" aria-hidden />
                          </button>
                          <Amount value={r.amount} currency={view.currency} className="ml-0" />
                        </Row>
                      ),
                    )}
                  </ul>
                ) : null}
                <TextButton onClick={() => setShowSorted(!showSorted)} className="self-start">
                  {showSorted
                    ? "Hide the sorted wires"
                    : `Show the ${sorted.length} sorted ${sorted.length === 1 ? "wire" : "wires"}`}
                </TextButton>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </DashboardCard>
  );
}
