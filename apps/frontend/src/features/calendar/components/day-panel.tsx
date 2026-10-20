// money-hub patch: the picked day's whole list (owner, 2026-10-20: "i open it and see everything related to that
// day"), and "Coming up": the next people's days and gift holidays with where each gift stands. A day with a gift to
// plan shows its budget, the person's ideas (tick one once bought), what was given, and last year's gift.
import { Link } from "react-router-dom";
import { useState } from "react";

import { Button, Icons, PrivacyAmount, Checkbox } from "@wealthfolio/ui";

import { Card } from "@/features/upkeep/components/parts";
import { cn } from "@/lib/utils";

import { addDays, daysBetween, inDays, longDay, type CalItem } from "../lib/calendar";
import type { DatesView, Gift, Occurrence, Person } from "../lib/dates";
import { toLunar } from "../lib/lunar";
import { DATE_ICONS, GiftMark, ItemIcon, tint } from "./parts";

export interface GiftActions {
  onLogGift: (occ: Occurrence) => void;
  onEditGift: (gift: Gift) => void;
  onAddIdea: (personId: string, text: string) => Promise<boolean>;
  onToggleIdea: (personId: string, ideaId: string, done: boolean) => void;
  onAddDate: (iso: string) => void;
}

function lunarWords(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const l = toLunar(d, m, y);
  return `Lunar ${l.day}/${l.month}${l.leap ? " (leap)" : ""}`;
}

export function DayPanel({
  iso,
  today,
  items,
  view,
  currency,
  actions,
  phone,
}: {
  iso: string;
  today: string;
  items: CalItem[];
  view: DatesView | undefined;
  currency: string;
  actions: GiftActions;
  phone: boolean;
}) {
  const out = items
    .filter((it) => it.amount && it.layer !== "income" && it.layer !== "returns")
    .reduce((a, it) => a + (it.amount ?? 0), 0);
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-medium">{longDay(iso, today)}</h2>
          <p className="text-[12px] text-[var(--m-muted)]">
            {lunarWords(iso)}
            {iso !== today ? ` · ${inDays(iso, today)}` : " · today"}
          </p>
        </div>
        {out > 0 ? (
          <div className="shrink-0 text-right">
            <div className="text-[15px] tabular-nums">
              <PrivacyAmount value={Math.round(out * 100) / 100} currency={currency} />
            </div>
            <div className="text-[11px] text-[var(--m-muted)]">going out</div>
          </div>
        ) : null}
      </div>
      {items.length ? (
        <ul className="-mx-1 flex flex-col">
          {items.map((it) => (
            <li key={it.id} className="flex flex-col">
              <ItemRow item={it} currency={currency} phone={phone} />
              {it.occ && (it.occ.gift || it.occ.personId) ? (
                <GiftBlock occ={it.occ} view={view} currency={currency} actions={actions} />
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-2 text-[13px] text-[var(--m-muted)]">Nothing on this day.</p>
      )}
      <button
        type="button"
        onClick={() => actions.onAddDate(iso)}
        className="flex h-8 items-center gap-1.5 self-start rounded-full px-1 text-[12.5px] text-[var(--m-ink-2)] hover:text-[var(--m-ink)]"
      >
        <Icons.Plus className="size-3.5" aria-hidden />
        Add a date on this day
      </button>
    </Card>
  );
}

function ItemRow({ item, currency, phone }: { item: CalItem; currency: string; phone: boolean }) {
  return (
    <Link
      to={item.href}
      className={cn(
        "flex min-h-[44px] items-center gap-2.5 rounded-[10px] px-1 py-1 hover:bg-[var(--m-tile)]",
        item.done && "opacity-60",
      )}
    >
      <ItemIcon item={item} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] text-[var(--m-ink)]">{item.title}</span>
          {item.occ?.gift ? <GiftMark /> : null}
        </span>
        {item.sub ? (
          <span
            className={cn(
              "block truncate text-[12px]",
              item.late ? "text-[var(--m-bad)]" : "text-[var(--m-muted)]",
            )}
          >
            {phone ? item.sub.split(" · ")[0] : item.sub}
          </span>
        ) : null}
      </span>
      {item.amount ? (
        <span
          className={cn(
            "shrink-0 text-[13px] tabular-nums",
            item.layer === "income" || item.layer === "returns"
              ? "text-[var(--m-up)]"
              : "text-[var(--m-ink)]",
          )}
        >
          {item.layer === "income" || item.layer === "returns" ? "+" : ""}
          <PrivacyAmount value={item.amount} currency={currency} />
        </span>
      ) : null}
    </Link>
  );
}

/** Under a person's day or a gift holiday: budget, ideas, what was given this time and last time. */
function GiftBlock({
  occ,
  view,
  currency,
  actions,
}: {
  occ: Occurrence;
  view: DatesView | undefined;
  currency: string;
  actions: GiftActions;
}) {
  const person = occ.personId ? view?.people.find((p) => p.id === occ.personId) : undefined;
  const ideas = person?.ideas ?? [];
  const [text, setText] = useState("");
  const add = async () => {
    if (!person || !text.trim()) return;
    if (await actions.onAddIdea(person.id, text.trim())) setText("");
  };
  return (
    <div className="mb-1.5 ml-[2.6rem] flex flex-col gap-1.5 rounded-[12px] bg-[var(--m-tile)] px-3 py-2.5 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <GiftStatus occ={occ} today={view?.today ?? ""} currency={currency} />
        {occ.gift && occ.remind > 0 ? (
          <span className="text-[var(--m-muted)]">Heads-up {longDay(occ.remindOn)}</span>
        ) : null}
      </div>
      {occ.given.length ? (
        <ul className="flex flex-col gap-0.5">
          {occ.given.map((g) => (
            <GiftLine
              key={g.id}
              gift={g}
              currency={currency}
              onEdit={() => actions.onEditGift(g)}
            />
          ))}
        </ul>
      ) : null}
      {occ.lastTime.length ? (
        <p className="text-[var(--m-muted)]">
          Last time:{" "}
          {occ.lastTime.map((g, i) => (
            <span key={g.id}>
              {i ? ", " : ""}
              {g.what}
              {g.amount ? (
                <>
                  {" "}
                  (<PrivacyAmount value={g.amount} currency={currency} />)
                </>
              ) : null}
            </span>
          ))}
        </p>
      ) : null}
      {person ? (
        <div className="flex flex-col gap-1">
          {ideas.length ? (
            <ul className="flex flex-col">
              {ideas.map((i) => (
                <li key={i.id}>
                  <label className="flex min-h-[28px] cursor-pointer items-center gap-2">
                    <Checkbox
                      checked={i.done}
                      onCheckedChange={(v) => actions.onToggleIdea(person.id, i.id, v === true)}
                    />
                    <span className={cn(i.done && "text-[var(--m-muted)] line-through")}>
                      {i.text}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={200}
              placeholder={`Gift idea for ${person.name}…`}
              className="h-8 min-w-0 flex-1 rounded-md border border-[var(--m-line)] bg-[var(--m-surface)] px-2 text-[16px] placeholder:text-[var(--m-muted)] focus:outline-none sm:text-[12.5px]"
            />
            {text.trim() ? (
              <Button type="submit" size="sm" variant="ghost" className="h-8 px-2.5">
                Add
              </Button>
            ) : null}
          </form>
        </div>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 self-start"
        onClick={() => actions.onLogGift(occ)}
      >
        <Icons.Plus className="size-3.5" aria-hidden />
        Log a gift
      </Button>
    </div>
  );
}

/** Where the gift for a day stands, in words: given, budget, or still to plan (amber once its heads-up passed). */
export function GiftStatus({
  occ,
  today,
  currency,
}: {
  occ: Occurrence;
  today: string;
  currency: string;
}) {
  if (occ.given.length) {
    const spent = occ.given.reduce((a, g) => a + (g.amount ?? 0), 0);
    return (
      <span
        className="inline-flex h-[22px] items-center gap-1 rounded-full px-2.5 text-[12px]"
        style={{ background: tint("var(--m-up)", 16), color: "var(--m-up)" }}
      >
        <Icons.Check className="size-3" aria-hidden />
        Gift logged
        {spent ? (
          <>
            {" "}
            <PrivacyAmount value={spent} currency={currency} />
          </>
        ) : null}
      </span>
    );
  }
  if (!occ.gift) return null;
  const due = today && occ.remindOn <= today && occ.date >= today;
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1 rounded-full px-2.5 text-[12px]",
        due
          ? "bg-[var(--m-warn-soft)] text-[var(--m-warn)]"
          : "bg-[var(--m-surface)] text-[var(--m-ink-2)]",
      )}
    >
      <GiftMark className={cn("size-3", due && "text-[var(--m-warn)]")} />
      {occ.budget ? (
        <>
          Budget <PrivacyAmount value={occ.budget} currency={currency} />
        </>
      ) : (
        "Plan a gift"
      )}
    </span>
  );
}

function GiftLine({
  gift,
  currency,
  onEdit,
}: {
  gift: Gift;
  currency: string;
  onEdit: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onEdit}
        className="flex w-full items-center gap-2 rounded-md text-left hover:underline"
      >
        <Icons.Check className="size-3.5 shrink-0 text-[var(--m-up)]" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          {gift.what}
          {gift.charge ? (
            <span className="text-[var(--m-muted)]"> · {gift.charge.merchant}</span>
          ) : null}
        </span>
        {gift.amount ? (
          <span className="shrink-0 tabular-nums">
            <PrivacyAmount value={gift.amount} currency={currency} />
          </span>
        ) : null}
      </button>
    </li>
  );
}

/** The next people's days and holidays with a gift, soonest first: what to plan for. */
export function ComingUp({
  view,
  currency,
  onPick,
  phone,
  days = 75,
}: {
  view: DatesView | undefined;
  currency: string;
  onPick: (iso: string) => void;
  phone: boolean;
  days?: number;
}) {
  if (!view) return null;
  const until = addDays(view.today, days);
  const list = view.occurrences
    .filter((o) => o.date >= view.today && o.date <= until && (o.source === "date" || o.gift))
    .slice(0, phone ? 5 : 8);
  return (
    <Card className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[14px] font-medium">Coming up</h2>
        <span className="text-[11.5px] text-[var(--m-muted)]">
          next {Math.round(days / 30.4)} months
        </span>
      </div>
      {list.length ? (
        <ul className="-mx-1 flex flex-col">
          {list.map((o) => (
            <UpcomingRow
              key={o.key}
              occ={o}
              today={view.today}
              currency={currency}
              person={view.people.find((p) => p.id === o.personId)}
              onPick={onPick}
            />
          ))}
        </ul>
      ) : (
        <p className="py-1.5 text-[13px] text-[var(--m-muted)]">
          No birthday or gift day in the next {Math.round(days / 30.4)} months.
        </p>
      )}
    </Card>
  );
}

function UpcomingRow({
  occ,
  today,
  currency,
  person,
  onPick,
}: {
  occ: Occurrence;
  today: string;
  currency: string;
  person?: Person;
  onPick: (iso: string) => void;
}) {
  const Icon = DATE_ICONS[occ.kind];
  const color = occ.source === "date" ? "var(--m-cat-6)" : "var(--m-cat-1)";
  const left = daysBetween(today, occ.date);
  const ideas = person?.ideas.filter((i) => !i.done).length ?? 0;
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(occ.date)}
        className="flex min-h-[44px] w-full items-center gap-2.5 rounded-[10px] px-1 py-1 text-left hover:bg-[var(--m-tile)]"
      >
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-full"
          style={{ background: tint(color, 20), color }}
          aria-hidden
        >
          <Icon className="size-[15px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px]">{occ.title}</span>
          <span className="block truncate text-[12px] text-[var(--m-muted)]">
            {[
              longDay(occ.date, today),
              occ.source === "date" ? occ.sub : null,
              ideas ? `${ideas} idea${ideas > 1 ? "s" : ""}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span
            className={cn(
              "text-[12px] tabular-nums",
              left <= 7 ? "text-[var(--m-ink)]" : "text-[var(--m-muted)]",
            )}
          >
            {left === 0 ? "Today" : left === 1 ? "Tomorrow" : `${left}d`}
          </span>
          {occ.gift || occ.given.length ? (
            <GiftStatus occ={occ} today={today} currency={currency} />
          ) : null}
        </span>
      </button>
    </li>
  );
}
