import { describe, expect, it } from "vitest";

import type { Stream } from "@/features/spending/lib/subscriptions";
import type { UpkeepView } from "@/features/upkeep/lib/upkeep";

import {
  billItems,
  byDay,
  dateItems,
  inDays,
  monthOf,
  tripItems,
  upkeepItems,
  LAYERS,
  type CalItem,
} from "./calendar";
import type { Occurrence } from "./dates";
import { lunarInYear, toLunar } from "./lunar";

const stream = (name: string, extra: Partial<Stream> = {}): Stream =>
  ({
    key: name,
    name,
    every: "month",
    status: "active",
    usual: 100,
    next: "2026-10-10",
    charges: [],
    ...extra,
  }) as unknown as Stream;

const occ = (extra: Partial<Occurrence>): Occurrence => ({
  key: "date:d1:2026",
  date: "2026-11-03",
  source: "date",
  kind: "birthday",
  title: "Mom's birthday",
  sub: "turns 62",
  personId: "p1",
  dateId: "d1",
  holidayId: null,
  set: null,
  lunar: null,
  gift: true,
  budget: 100,
  remind: 14,
  remindOn: "2026-10-20",
  given: [],
  lastTime: [],
  ...extra,
});

describe("calendar days", () => {
  it("a month: its days, where the 1st sits, its name", () => {
    expect(monthOf("2026-10-20", 0)).toMatchObject({
      start: "2026-10-01",
      end: "2026-10-31",
      days: 31,
      firstWeekday: 4,
      label: "October",
    });
    expect(monthOf("2026-10-20", 4)).toMatchObject({
      start: "2027-02-01",
      end: "2027-02-28",
      label: "February 2027",
    });
    expect(inDays("2026-11-03", "2026-10-20")).toBe("in 14 days");
    expect(inDays("2026-10-21", "2026-10-20")).toBe("tomorrow");
  });

  it("bills land where the bill calendar puts them, paid and coming, over two months", () => {
    const items = [
      stream("ComEd", {
        usual: 157,
        next: "2026-10-23",
        charges: [{ id: "c1", date: "2026-09-23", amount: 150 }] as never,
      }),
      stream("Netflix", { usual: 15.49, next: "2026-11-02" }),
    ];
    const out = billItems(items, "2026-10-20", "2026-09-20", "2026-11-30");
    expect(out.map((i) => `${i.date} ${i.title} ${i.done ? "paid" : i.sub}`)).toEqual([
      "2026-09-23 ComEd paid",
      "2026-10-23 ComEd Due",
      "2026-11-02 Netflix Due",
      "2026-11-23 ComEd Due",
    ]);
    expect(out[1].stream?.name).toBe("ComEd");
  });

  it("people's days and holidays, each day in the layers' order", () => {
    const items: CalItem[] = [
      ...dateItems(
        [
          occ({}),
          occ({
            key: "hol:us-halloween:2026",
            date: "2026-10-31",
            source: "holiday",
            kind: "holiday",
            title: "Halloween",
            sub: "",
            personId: null,
            holidayId: "us-halloween",
            gift: false,
          }),
        ],
        "2026-10-01",
        "2026-11-30",
      ),
      ...billItems(
        [stream("Phone", { next: "2026-11-03", usual: 45 })],
        "2026-10-20",
        "2026-11-01",
        "2026-11-30",
      ),
    ];
    const days = byDay(items, new Set(LAYERS.map((l) => l.key)));
    expect(days.get("2026-11-03")?.map((i) => i.layer)).toEqual(["people", "bills"]);
    expect(days.get("2026-11-03")?.[0].sub).toBe("turns 62");
    expect(days.get("2026-10-31")?.[0].layer).toBe("holidays");
    // A layer switched off is left out.
    expect(
      byDay(items, new Set(["bills"]))
        .get("2026-11-03")
        ?.map((i) => i.title),
    ).toEqual(["Phone"]);
  });

  it("a trip's bookings by day and the trip as a band", () => {
    const { items, spans } = tripItems(
      [
        {
          id: "b1",
          eventId: "e1",
          kind: "stay",
          title: "Tru by Hilton",
          sub: "",
          start: "2026-10-30",
          end: "2026-11-01",
          legs: [],
        } as never,
      ],
      [
        {
          id: "e1",
          name: "Dallas",
          eventTypeId: "t-travel",
          startDate: "2026-10-30",
          endDate: "2026-11-01",
        } as never,
      ],
      new Set(["t-travel"]),
      "2026-10-01",
      "2026-11-30",
    );
    expect(items.map((i) => `${i.date} ${i.sub.split(" · ")[0]}`)).toEqual([
      "2026-10-30 Check in",
      "2026-11-01 Check out",
    ]);
    expect(spans).toEqual([
      { id: "e1", start: "2026-10-30", end: "2026-11-01", title: "Dallas", href: "/trips?tab=e1" },
    ]);
  });

  it("maintenance jobs on their due day, new ones (no last-done day) left out", () => {
    const view = {
      plans: [
        {
          assetId: "a1",
          name: "Honda CRV",
          label: "",
          kind: "vehicle",
          jobs: [
            {
              id: "j1",
              name: "Oil change",
              status: { kind: "warn", dueOn: "2026-11-05", chip: "in 16d", by: "d" },
            },
            {
              id: "j2",
              name: "Tires",
              status: { kind: "new", dueOn: null, chip: "Set last done", by: null },
            },
          ],
        },
      ],
    } as unknown as UpkeepView;
    expect(
      upkeepItems(view, "2026-10-01", "2026-11-30").map((i) => `${i.date} ${i.title}`),
    ).toEqual(["2026-11-05 Oil change"]);
  });
});

describe("lunar calendar (same as the service's)", () => {
  it("Tết, Trung Thu, and today's lunar day", () => {
    expect(lunarInYear(1, 1, 2027)).toEqual({ day: 6, month: 2, year: 2027 });
    expect(lunarInYear(15, 8, 2026)).toEqual({ day: 25, month: 9, year: 2026 });
    expect(toLunar(20, 10, 2026)).toEqual({ day: 11, month: 9, year: 2026, leap: false });
  });
});
