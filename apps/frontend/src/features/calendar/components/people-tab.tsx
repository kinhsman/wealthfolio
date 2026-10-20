// money-hub patch: the Calendar's People tab: everyone whose days matter, soonest first, each with their days
// (a lunar one says so), the gift budget, the ideas list and what was given before.
import { useState } from "react";

import { Button, Icons, PrivacyAmount, Checkbox } from "@wealthfolio/ui";

import { Card } from "@/features/upkeep/components/parts";
import { cn } from "@/lib/utils";

import { daysBetween, longDay } from "../lib/calendar";
import { KIND_WORDS, dateWhen, type DatesView, type Person } from "../lib/dates";
import { DATE_ICONS, GiftMark, tint } from "./parts";

export interface PeopleActions {
  onAdd: () => void;
  onEdit: (personId: string) => void;
  onEditDate: (dateId: string) => void;
  onAddIdea: (personId: string, text: string) => Promise<boolean>;
  onToggleIdea: (personId: string, ideaId: string, done: boolean) => void;
  onRemoveIdea: (personId: string, ideaId: string) => void;
  onEditGift: (giftId: string) => void;
}

export function PeopleTab({
  view,
  currency,
  phone,
  focus,
  actions,
}: {
  view: DatesView;
  currency: string;
  phone: boolean;
  focus: string | null;
  actions: PeopleActions;
}) {
  if (!view.people.length)
    return (
      <Card className="flex flex-col items-start gap-2.5 !px-5 !py-5">
        <h2 className="text-[16px] font-medium">Remember the days that matter</h2>
        <p className="max-w-[60ch] text-[13.5px] text-[var(--m-ink-2)]">
          Add the people whose birthdays, anniversaries and giỗ you keep. Lunar dates move to the
          right day each year, a heads-up comes before each one, and you can jot gift ideas and log
          what you gave.
        </p>
        <Button type="button" size="sm" className="h-8 gap-1.5" onClick={actions.onAdd}>
          <Icons.Plus className="size-4" aria-hidden />
          Add a person
        </Button>
      </Card>
    );
  return (
    // Columns, not a grid: a card with a long ideas list leaves no hole beside a short one.
    <div className={phone ? "flex flex-col gap-2" : "gap-3.5 lg:columns-2 2xl:columns-3"}>
      {view.people.map((p) => (
        <div key={p.id} className={phone ? undefined : "mb-3.5 break-inside-avoid"}>
          <PersonCard
            person={p}
            view={view}
            currency={currency}
            focus={focus === p.id}
            actions={actions}
          />
        </div>
      ))}
    </div>
  );
}

function PersonCard({
  person: p,
  view,
  currency,
  focus,
  actions,
}: {
  person: Person;
  view: DatesView;
  currency: string;
  focus: boolean;
  actions: PeopleActions;
}) {
  const dates = view.dates.filter((d) => d.personId === p.id);
  const nextOf = (dateId: string) =>
    view.occurrences.find((o) => o.dateId === dateId && o.date >= view.today);
  const [text, setText] = useState("");
  const open = p.ideas.filter((i) => !i.done);
  const bought = p.ideas.filter((i) => i.done);
  return (
    <Card className={cn("flex flex-col gap-2", focus && "shadow-[0_0_0_2px_var(--m-cat-6)]")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-medium">{p.name}</h3>
          <p className="truncate text-[12px] text-[var(--m-muted)]">
            {[p.relation, p.budget ? null : null].filter(Boolean).join(" · ") || " "}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {p.budget ? (
            <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-[var(--m-tile)] px-2.5 text-[12px] text-[var(--m-ink-2)]">
              <GiftMark className="size-3" />
              <PrivacyAmount value={p.budget} currency={currency} />
            </span>
          ) : null}
          <button
            type="button"
            aria-label={`Change ${p.name}`}
            onClick={() => actions.onEdit(p.id)}
            className="flex size-8 items-center justify-center rounded-full text-[var(--m-muted)] hover:bg-[var(--m-tile)] hover:text-[var(--m-ink)]"
          >
            <Icons.Pencil className="size-3.5" />
          </button>
        </div>
      </div>

      <ul className="-mx-1 flex flex-col">
        {dates.map((d) => {
          const o = nextOf(d.id);
          const Icon = DATE_ICONS[d.kind];
          const left = o ? daysBetween(view.today, o.date) : null;
          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => actions.onEditDate(d.id)}
                className="flex min-h-[40px] w-full items-center gap-2.5 rounded-[10px] px-1 py-1 text-left hover:bg-[var(--m-tile)]"
              >
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-full"
                  style={{ background: tint("var(--m-cat-6)", 20), color: "var(--m-cat-6)" }}
                  aria-hidden
                >
                  <Icon className="size-[15px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[13.5px]">
                    <span className="truncate">{d.title || KIND_WORDS[d.kind]}</span>
                    {d.gift ? <GiftMark /> : null}
                  </span>
                  <span className="block truncate text-[12px] text-[var(--m-muted)]">
                    {[
                      dateWhen(d),
                      o ? (d.lunar ? longDay(o.date, view.today) : null) : null,
                      o?.sub,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {left !== null ? (
                  <span
                    className={cn(
                      "shrink-0 text-[12px] tabular-nums",
                      left <= 14 ? "text-[var(--m-ink)]" : "text-[var(--m-muted)]",
                    )}
                  >
                    {left === 0 ? "Today" : left === 1 ? "Tomorrow" : `in ${left}d`}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-1 rounded-[12px] bg-[var(--m-tile)] px-3 py-2">
        <span className="text-[11.5px] text-[var(--m-muted)]">Gift ideas</span>
        {open.length ? (
          <ul className="flex flex-col">
            {open.map((i) => (
              <IdeaRow
                key={i.id}
                text={i.text}
                done={false}
                onToggle={(v) => actions.onToggleIdea(p.id, i.id, v)}
                onRemove={() => actions.onRemoveIdea(p.id, i.id)}
              />
            ))}
          </ul>
        ) : null}
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim())
              void actions.onAddIdea(p.id, text.trim()).then((ok) => ok && setText(""));
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={200}
            placeholder="Jot an idea…"
            className="h-8 min-w-0 flex-1 rounded-md border border-[var(--m-line)] bg-[var(--m-surface)] px-2 text-[16px] placeholder:text-[var(--m-muted)] focus:outline-none sm:text-[12.5px]"
          />
          {text.trim() ? (
            <Button type="submit" size="sm" variant="ghost" className="h-8 px-2.5">
              Add
            </Button>
          ) : null}
        </form>
        {bought.length ? (
          <ul className="flex flex-col">
            {bought.map((i) => (
              <IdeaRow
                key={i.id}
                text={i.text}
                done
                onToggle={(v) => actions.onToggleIdea(p.id, i.id, v)}
                onRemove={() => actions.onRemoveIdea(p.id, i.id)}
              />
            ))}
          </ul>
        ) : null}
      </div>

      {p.given.length ? (
        <div className="flex flex-col gap-0.5">
          <span className="text-[11.5px] text-[var(--m-muted)]">Given</span>
          <ul className="flex flex-col">
            {p.given.slice(0, 4).map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => actions.onEditGift(g.id)}
                  className="flex min-h-[30px] w-full items-center gap-2 rounded-md text-left text-[13px] hover:bg-[var(--m-tile)]"
                >
                  <span className="min-w-[3.25rem] shrink-0 whitespace-nowrap text-[12px] tabular-nums text-[var(--m-muted)]">
                    {givenDay(g.date, view.today)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {g.what}
                    <span className="text-[var(--m-muted)]">
                      {" "}
                      · {g.title.replace(`${p.name}'s `, "")}
                    </span>
                  </span>
                  {g.amount ? (
                    <span className="shrink-0 tabular-nums">
                      <PrivacyAmount value={g.amount} currency={currency} />
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {p.note ? <p className="text-[12px] text-[var(--m-muted)]">{p.note}</p> : null}
    </Card>
  );
}

function IdeaRow({
  text,
  done,
  onToggle,
  onRemove,
}: {
  text: string;
  done: boolean;
  onToggle: (v: boolean) => void;
  onRemove: () => void;
}) {
  return (
    <li className="group flex min-h-[28px] items-center gap-2 text-[13px]">
      <Checkbox
        checked={done}
        onCheckedChange={(v) => onToggle(v === true)}
        aria-label={done ? "Not bought" : "Bought"}
      />
      <span className={cn("min-w-0 flex-1 truncate", done && "text-[var(--m-muted)] line-through")}>
        {text}
      </span>
      <button
        type="button"
        aria-label="Take the idea off"
        onClick={onRemove}
        className="flex size-6 items-center justify-center rounded-full text-[var(--m-muted)] opacity-0 hover:bg-[var(--m-surface)] group-hover:opacity-100 max-md:opacity-60"
      >
        <Icons.Close className="size-3" />
      </button>
    </li>
  );
}

/** "Oct 19" this year, "Oct 2025" before. */
function givenDay(iso: string, today: string) {
  const d = new Date(`${iso}T12:00:00`);
  return iso.slice(0, 4) === today.slice(0, 4)
    ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
