// money-hub patch: the Calendar's Holidays tab: the built-in US and Vietnam lists (each switched on or off), and per
// holiday whether it shows, whether a gift is planned for it, and its gift budget.
import { useState } from "react";

import { Switch, Checkbox } from "@wealthfolio/ui";

import { Card } from "@/features/upkeep/components/parts";
import { cn } from "@/lib/utils";

import { longDay } from "../lib/calendar";
import type { DatesView, Holiday } from "../lib/dates";
import { GiftMark } from "./parts";

export interface HolidayActions {
  onSet: (sets: Partial<Record<"us" | "vn", boolean>>) => void;
  onHoliday: (h: {
    id: string;
    on?: boolean;
    gift?: boolean;
    budget?: number | string | null;
  }) => Promise<boolean>;
}

export function HolidaysTab({
  view,
  phone,
  actions,
}: {
  view: DatesView;
  phone: boolean;
  actions: HolidayActions;
}) {
  return (
    <div className={cn("grid items-start gap-3.5 max-md:gap-2", !phone && "lg:grid-cols-2")}>
      {(["vn", "us"] as const).map((set) => {
        // Soonest first: the next one at the top, then round the year.
        const nextOf = (id: string) =>
          view.occurrences.find((o) => o.holidayId === id && o.date >= view.today)?.date ?? "9999";
        const list = view.holidays.list
          .filter((h) => h.set === set)
          .sort((a, b) => nextOf(a.id).localeCompare(nextOf(b.id)));
        const on = view.holidays.sets[set];
        return (
          <Card key={set} bleed className="overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-[18px] py-3 max-md:px-3">
              <div>
                <h2 className="text-[15px] font-medium">{view.holidays.names[set]}</h2>
                <p className="text-[12px] text-[var(--m-muted)]">
                  {on ? `${list.filter((h) => h.on).length} on the calendar` : "Off"}
                </p>
              </div>
              <Switch
                checked={on}
                onCheckedChange={(v) => actions.onSet({ [set]: v })}
                aria-label={`${view.holidays.names[set]} holidays`}
              />
            </div>
            {on ? (
              <ul className="border-t border-[var(--m-line)]">
                <li className="grid grid-cols-[minmax(0,1fr)_auto_auto_5.5rem] items-center gap-3 px-[18px] py-1.5 text-[11px] text-[var(--m-muted)] max-md:grid-cols-[minmax(0,1fr)_auto_auto_4.5rem] max-md:gap-2 max-md:px-3">
                  <span>Holiday</span>
                  <span className="w-8 text-center">Show</span>
                  <span className="w-8 text-center">Gift</span>
                  <span className="text-right">Budget</span>
                </li>
                {list.map((h) => (
                  <HolidayRow key={h.id} h={h} view={view} actions={actions} />
                ))}
              </ul>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

function HolidayRow({
  h,
  view,
  actions,
}: {
  h: Holiday;
  view: DatesView;
  actions: HolidayActions;
}) {
  const next = view.occurrences.find((o) => o.holidayId === h.id && o.date >= view.today);
  const [budget, setBudget] = useState(h.budget != null ? String(h.budget) : "");
  const save = () => {
    const now = h.budget != null ? String(h.budget) : "";
    if (budget !== now) void actions.onHoliday({ id: h.id, budget: budget === "" ? null : budget });
  };
  return (
    <li
      className={cn(
        "grid min-h-[44px] grid-cols-[minmax(0,1fr)_auto_auto_5.5rem] items-center gap-3 border-t border-[var(--m-line-soft,var(--m-line))] px-[18px] py-1 max-md:grid-cols-[minmax(0,1fr)_auto_auto_4.5rem] max-md:gap-2 max-md:px-3",
        !h.on && "opacity-55",
      )}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[13.5px]">
          <span className="truncate">{h.name}</span>
          {h.gift ? <GiftMark /> : null}
        </span>
        <span className="block truncate text-[12px] text-[var(--m-muted)]">
          {[h.en, next ? longDay(next.date, view.today) : h.when].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="flex w-8 justify-center">
        <Checkbox
          checked={h.on}
          onCheckedChange={(v) => void actions.onHoliday({ id: h.id, on: v === true })}
          aria-label={`Show ${h.name}`}
        />
      </span>
      <span className="flex w-8 justify-center">
        <Checkbox
          checked={h.gift}
          disabled={!h.on}
          onCheckedChange={(v) => void actions.onHoliday({ id: h.id, gift: v === true })}
          aria-label={`Plan a gift for ${h.name}`}
        />
      </span>
      <span className="flex justify-end">
        {h.gift && h.on ? (
          <span className="relative w-full">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[13px] text-[var(--m-muted)]">$</span>
          <input
            type="text"
            inputMode="decimal"
            value={budget}
            onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ""))}
            onBlur={save}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            placeholder=""
            aria-label={`Budget for ${h.name}`}
            className="h-8 w-full rounded-md border border-[var(--m-line)] bg-[var(--m-surface)] pl-5 pr-2 text-right text-[16px] tabular-nums placeholder:text-[var(--m-muted)] focus:outline-none sm:text-[13px]"
          />
          </span>
        ) : null}
      </span>
    </li>
  );
}
