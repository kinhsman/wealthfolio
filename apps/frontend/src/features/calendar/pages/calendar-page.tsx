// money-hub patch: Calendar (owner, 2026-10-20: "a feature to track important dates like calendars, the money app has
// many things attached to a date ... important birthdays, holidays, so i can plan buying gift ... just calendar, i
// open it and see everything related to that day"). One month with everything the app knows by date (bills, paydays,
// card payments, trips, maintenance, returns, taxes) plus people's days and holidays; the picked day's whole list
// beside it, and what is coming up with where each gift stands. People and Holidays are their own tabs.
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { SwipablePage, type SwipablePageView } from "@/components/page";
import { Hero, MeadowTab } from "@/features/meadow-dash/parts";
import { useEventTypes, useSpendingEvents } from "@/features/spending/hooks/use-spending-events";
import { useCashForecast } from "@/features/spending/lib/cash-forecast";
import { useCreditCards } from "@/features/spending/lib/credit-cards";
import { useReturns } from "@/features/spending/lib/returns";
import { useSubscriptions } from "@/features/spending/lib/subscriptions";
import { useTaxes } from "@/features/taxes/lib/taxes";
import { isTravelType, useBookings } from "@/features/trips/lib/trips";
import { Card } from "@/features/upkeep/components/parts";
import { useUpkeep } from "@/features/upkeep/lib/upkeep";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { cn } from "@/lib/utils";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icons,
  Skeleton,
} from "@wealthfolio/ui";

import { ComingUp, DayPanel, type GiftActions } from "../components/day-panel";
import {
  DateDialog,
  GiftDialog,
  PersonDialog,
  type DateStart,
  type GiftStart,
  type PersonStart,
} from "../components/dialogs";
import { HolidaysTab } from "../components/holidays-tab";
import { LayerKey, MonthGrid, MonthHeader } from "../components/month-grid";
import { PeopleTab } from "../components/people-tab";
import {
  LAYERS,
  addDays,
  billItems,
  byDay,
  cardItems,
  dateItems,
  daysBetween,
  incomeItems,
  isoOf,
  monthOf,
  returnItems,
  taxItems,
  tripItems,
  upkeepItems,
  type Layer,
} from "../lib/calendar";
import { datesApi, useDates, useDatesAct, useDatesRange, type DatesView } from "../lib/dates";

const ALL_LAYERS = LAYERS.map((l) => l.key);

function AddMenu({
  phone,
  onPerson,
  onDate,
}: {
  phone: boolean;
  onPerson: () => void;
  onDate: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          className={cn("h-8 gap-1.5", phone && "w-8 px-0")}
          aria-label="Add"
        >
          <Icons.Plus className="size-4" aria-hidden />
          {phone ? null : (
            <>
              Add
              <Icons.ChevronDown className="size-3.5 opacity-80" aria-hidden />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem className="h-8" onSelect={onPerson}>
          <Icons.Users className="mr-2 size-4" aria-hidden />A person
        </DropdownMenuItem>
        <DropdownMenuItem className="h-8" onSelect={onDate}>
          <Icons.Calendar className="mr-2 size-4" aria-hidden />A date
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The answer on top: the next person's day or gift holiday, and how many gifts are still to plan this month. */
function NextHero({ view, phone }: { view: DatesView; phone: boolean }) {
  const ahead = view.occurrences.filter(
    (o) => o.date >= view.today && (o.source === "date" || o.gift),
  );
  const next = ahead[0];
  const toPlan = ahead.filter(
    (o) => o.gift && !o.given.length && daysBetween(view.today, o.date) <= 30,
  ).length;
  const left = next ? daysBetween(view.today, next.date) : null;
  return (
    <Hero
      label="Next important day"
      className="flex-row flex-wrap items-end justify-between gap-x-6"
    >
      <div className="min-w-0">
        <div className="text-[12.5px] opacity-75">{phone ? "Next" : "Next important day"}</div>
        <div
          className="truncate text-[22px] font-medium leading-tight max-md:text-[18px]"
          data-m-num
        >
          {next ? next.title : "Nothing in the next year"}
        </div>
        {next ? (
          <div className="text-[13px] opacity-80">
            {left === 0 ? "Today" : left === 1 ? "Tomorrow" : `In ${left} days`}
            {phone
              ? ""
              : `, ${new Date(`${next.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`}
            {next.sub && next.source === "date" ? ` · ${next.sub}` : ""}
          </div>
        ) : null}
      </div>
      <div className="text-right">
        <div
          className="text-[22px] font-medium tabular-nums leading-tight max-md:text-[18px]"
          data-m-num
        >
          {toPlan}
        </div>
        <div className="text-[12.5px] opacity-75">
          {phone ? "gifts to plan" : "gifts to plan, next 30 days"}
        </div>
      </div>
    </Hero>
  );
}

export default function CalendarPage() {
  const phone = useIsMobileViewport();
  const [params, setParams] = useSearchParams();
  const dates = useDates();
  const { run } = useDatesAct();
  const view = dates.data;
  const today = view?.today ?? isoOf(new Date());

  // The picked day (?day=) and the month shown with it; the arrows move the month and keep the day when it is in it.
  const asked = params.get("day");
  const [picked, setPicked] = useState<string>(
    asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : today,
  );
  const [offset, setOffset] = useState(() => {
    const [py, pm] = picked.split("-").map(Number);
    const [ty, tm] = today.split("-").map(Number);
    return (py - ty) * 12 + (pm - tm);
  });
  const m = monthOf(today, offset);
  const from = addDays(m.start, -7);
  const to = addDays(m.end, 7);
  const covered = !!view && from >= view.from && to <= view.to;
  const far = useDatesRange(view && !covered ? { from, to } : null);
  const monthDates = covered ? view : far.data;

  const [hidden, setHidden] = usePersistentState<Layer[]>("calendar-hidden-layers", []);
  const shown = useMemo(() => new Set(ALL_LAYERS.filter((l) => !hidden.includes(l))), [hidden]);

  const subs = useSubscriptions();
  const forecast = useCashForecast(90);
  const cards = useCreditCards();
  const bookings = useBookings();
  const events = useSpendingEvents();
  const types = useEventTypes();
  const upkeep = useUpkeep();
  const returns = useReturns();
  const taxes = useTaxes(null);
  const currency = subs.data?.currency ?? "USD";

  const travel = useMemo(
    () => new Set((types.data ?? []).filter(isTravelType).map((t) => t.id)),
    [types.data],
  );
  const { items, spans } = useMemo(() => {
    const trips = tripItems(bookings.data, events.data, travel, from, to);
    return {
      items: [
        ...dateItems(monthDates?.occurrences, from, to),
        ...billItems(subs.data?.items, today, from, to),
        ...incomeItems(forecast.data, from, to),
        ...cardItems(cards.data, today, from, to),
        ...trips.items,
        ...upkeepItems(upkeep.data, from, to),
        ...returnItems(returns.data, today, from, to),
        ...taxItems(taxes.data, from, to),
      ],
      spans: shown.has("trips") ? trips.spans : [],
    };
  }, [
    monthDates,
    subs.data,
    forecast.data,
    cards.data,
    bookings.data,
    events.data,
    travel,
    upkeep.data,
    returns.data,
    taxes.data,
    today,
    from,
    to,
    shown,
  ]);
  const days = useMemo(() => byDay(items, shown), [items, shown]);
  const counts = useMemo(() => {
    const c = new Map<Layer, number>();
    for (const it of items)
      if (it.date >= m.start && it.date <= m.end) c.set(it.layer, (c.get(it.layer) ?? 0) + 1);
    return c;
  }, [items, m.start, m.end]);

  const [person, setPerson] = useState<PersonStart | null>(null);
  const [date, setDate] = useState<DateStart | null>(null);
  const [gift, setGift] = useState<GiftStart | null>(null);

  const pick = (iso: string) => {
    setPicked(iso);
    const next = new URLSearchParams(params);
    next.set("day", iso);
    setParams(next, { replace: true });
  };
  const move = (n: number) => {
    setOffset(n);
    const mm = monthOf(today, n);
    if (!(picked >= mm.start && picked <= mm.end)) pick(n === 0 ? today : mm.start);
  };
  const toggle = (l: Layer) =>
    setHidden(hidden.includes(l) ? hidden.filter((x) => x !== l) : [...hidden, l]);
  const save = (fn: () => Promise<DatesView>, done: string) => run("save", fn, done);

  const giftActions: GiftActions = {
    onLogGift: (occ) => setGift({ occ }),
    onEditGift: (g) => setGift({ gift: g }),
    onAddIdea: (pid, text) => run("idea", () => datesApi.addIdea(pid, text)),
    onToggleIdea: (pid, iid, done) =>
      void run("idea", () => datesApi.updateIdea(pid, iid, { done })),
    onAddDate: (iso) => setDate({ dateId: null, on: iso }),
  };

  const addMenu = (
    <AddMenu
      phone={phone}
      onPerson={() => setPerson({ personId: null })}
      onDate={() => setDate({ dateId: null, on: picked })}
    />
  );

  const loading = (
    <div className="flex flex-col gap-3.5" aria-busy>
      <Skeleton className="h-20 w-full rounded-[20px]" />
      <Skeleton className="h-[32rem] w-full rounded-[20px]" />
    </div>
  );
  const failed = (
    <Card>
      <p className="text-[13.5px]">{dates.error?.message ?? "The calendar could not be loaded."}</p>
      <button
        type="button"
        onClick={() => void dates.refetch()}
        className="mt-1 text-[12.5px] underline underline-offset-4 hover:no-underline"
      >
        Try again
      </button>
    </Card>
  );

  const monthCard = (
    <Card className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthHeader label={m.label} offset={offset} onOffset={move} phone={phone} />
        {!phone ? (
          <span className="text-[12px] text-[var(--m-muted)]">
            {[
              counts.get("people")
                ? `${counts.get("people")} ${counts.get("people") === 1 ? "birthday or date" : "birthdays and dates"}`
                : null,
              counts.get("holidays")
                ? `${counts.get("holidays")} holiday${counts.get("holidays") === 1 ? "" : "s"}`
                : null,
              counts.get("bills") ? `${counts.get("bills")} bills` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        ) : null}
      </div>
      <MonthGrid
        today={today}
        offset={offset}
        days={days}
        spans={spans}
        picked={picked}
        onPick={pick}
        phone={phone}
      />
      <LayerKey shown={shown} counts={counts} onToggle={toggle} phone={phone} />
    </Card>
  );

  const dayPanel = (
    <DayPanel
      iso={picked}
      today={today}
      items={days.get(picked) ?? []}
      view={monthDates ?? view}
      currency={currency}
      actions={giftActions}
      phone={phone}
    />
  );

  const views: SwipablePageView[] = [
    {
      value: "calendar",
      label: "Calendar",
      icon: Icons.CalendarDots,
      actions: addMenu,
      content: (
        <MeadowTab>
          {view ? (
            <>
              <NextHero view={view} phone={phone} />
              {phone ? (
                <>
                  {monthCard}
                  {dayPanel}
                  <ComingUp
                    view={view}
                    currency={currency}
                    onPick={(iso) => {
                      move(monthsFrom(today, iso));
                      pick(iso);
                    }}
                    phone
                  />
                </>
              ) : (
                <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
                  {monthCard}
                  <div className="flex flex-col gap-3.5">
                    {dayPanel}
                    <ComingUp
                      view={view}
                      currency={currency}
                      onPick={(iso) => {
                        move(monthsFrom(today, iso));
                        pick(iso);
                      }}
                      phone={false}
                    />
                  </div>
                </div>
              )}
            </>
          ) : dates.isLoading ? (
            loading
          ) : (
            failed
          )}
        </MeadowTab>
      ),
    },
    {
      value: "people",
      label: "People",
      icon: Icons.Users,
      actions: addMenu,
      content: (
        <MeadowTab>
          {view ? (
            <PeopleTab
              view={view}
              currency={currency}
              phone={phone}
              focus={params.get("person")}
              actions={{
                onAdd: () => setPerson({ personId: null }),
                onEdit: (id) => setPerson({ personId: id }),
                onEditDate: (id) => setDate({ dateId: id }),
                onAddIdea: (pid, text) => run("idea", () => datesApi.addIdea(pid, text)),
                onToggleIdea: (pid, iid, done) =>
                  void run("idea", () => datesApi.updateIdea(pid, iid, { done })),
                onRemoveIdea: (pid, iid) => void run("idea", () => datesApi.removeIdea(pid, iid)),
                onEditGift: (gid) => {
                  const g = view.people.flatMap((p) => p.given).find((x) => x.id === gid);
                  if (g) setGift({ gift: g });
                },
              }}
            />
          ) : dates.isLoading ? (
            loading
          ) : (
            failed
          )}
        </MeadowTab>
      ),
    },
    {
      value: "holidays",
      label: "Holidays",
      icon: Icons.Star,
      content: (
        <MeadowTab>
          {view ? (
            <HolidaysTab
              view={view}
              phone={phone}
              actions={{
                onSet: (sets) => void run("set", () => datesApi.settings({ sets })),
                onHoliday: (h) => run("holiday", () => datesApi.settings({ holiday: h })),
              }}
            />
          ) : dates.isLoading ? (
            loading
          ) : (
            failed
          )}
        </MeadowTab>
      ),
    },
  ];

  return (
    <>
      <SwipablePage
        className="pt-0"
        views={views}
        defaultView="calendar"
        withPadding={false}
        withMobileNavOffset={false}
        mobileActionsPlacement="header"
      />
      <PersonDialog
        view={view}
        start={person}
        onClose={() => setPerson(null)}
        onSave={save}
        onRemove={(id) => run("remove", () => datesApi.removePerson(id), "Deleted")}
      />
      <DateDialog view={view} start={date} onClose={() => setDate(null)} onSave={save} />
      <GiftDialog
        view={view}
        start={gift}
        currency={currency}
        onClose={() => setGift(null)}
        onSave={save}
      />
    </>
  );
}

/** How many months from `today`'s month to `iso`'s (the arrows' offset). */
function monthsFrom(today: string, iso: string) {
  const [ty, tm] = today.split("-").map(Number);
  const [y, mo] = iso.split("-").map(Number);
  return (y - ty) * 12 + (mo - tm);
}
