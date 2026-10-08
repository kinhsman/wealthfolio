// money-hub patch: Maintenance, the starter lists. A new plan starts from the jobs most people need for that
// kind of asset (the owner ticks what applies and can change every number): "a thing goes in only if it costs
// money or has a due date". A job added from here has no last-done day yet: the page asks for it.
import type { JobInput, YearDay } from "./upkeep";

export interface Starter {
  name: string;
  months?: number;
  miles?: number;
  /** A job on the same day each year (instead of months or miles). */
  yearly?: YearDay;
  /** A line of why or how, shown when the pointer rests on the row. */
  tip?: string;
  /** Ticked when the list opens. */
  on: boolean;
}

export const PROPERTY_STARTERS: Starter[] = [
  { name: "Furnace service", months: 12, on: true },
  { name: "Furnace filter", months: 3, on: true },
  { name: "Smoke and CO detectors", months: 6, on: true },
  { name: "Gutters", months: 12, on: true },
  { name: "Water heater flush", months: 12, on: true },
  { name: "AC check", months: 12, on: true },
  { name: "Sump pump test", months: 6, on: false },
  { name: "Dryer vent", months: 12, on: false },
  { name: "Fire extinguisher check", months: 12, on: false },
  { name: "Chimney sweep", months: 12, on: false },
  { name: "Roof check", months: 12, on: false },
  { name: "Pest control", months: 3, on: false },
  { name: "Septic pump", months: 36, on: false },
];

export const VEHICLE_STARTERS: Starter[] = [
  { name: "Oil change", months: 6, miles: 5000, on: true },
  { name: "Tire rotation", miles: 7500, on: true },
  { name: "Brake check", months: 12, on: true },
  { name: "Engine and cabin filters", months: 24, miles: 15000, on: true },
  { name: "Registration sticker", months: 12, on: true },
  { name: "Insurance renewal", months: 6, on: true },
  { name: "Battery check", months: 12, on: false },
  { name: "Coolant", months: 60, miles: 60000, on: false },
  { name: "Transmission fluid", months: 48, miles: 60000, on: false },
  { name: "Wiper blades", months: 12, on: false },
  { name: "Alignment", months: 24, on: false },
  { name: "Car wash and wax", months: 3, on: false },
];

export const OTHER_STARTERS: Starter[] = [
  { name: "Service", months: 12, on: true },
  { name: "Insurance", months: 12, on: false },
];

/**
 * The lawn through a Chicago year (owner, 2026-10-08: "regular lawn maintenance steps through the year, specifically
 * for Chicago weather"). Cool-season grass (bluegrass, fescue, rye), USDA zone 6a: the last hard freeze is about the
 * end of April, the first in mid to late October. The day is the usual one; each job stays due for a month after it,
 * and the owner can move any day to match the year.
 */
export const LAWN_STARTERS: Starter[] = [
  {
    name: "Mower tune-up",
    yearly: { month: 3, day: 20 },
    tip: "Sharpen the blade, change the oil and the spark plug before the first mow.",
    on: false,
  },
  {
    name: "Spring cleanup",
    yearly: { month: 4, day: 5 },
    tip: "Rake out matted leaves and winter debris once the lawn has dried.",
    on: false,
  },
  {
    name: "Crabgrass preventer",
    yearly: { month: 4, day: 15 },
    tip: "Down when the soil reaches about 55°F, around when the forsythia bloom. Water it in.",
    on: true,
  },
  {
    name: "Sprinkler start-up",
    yearly: { month: 4, day: 30 },
    tip: "Turn the system on after the last hard freeze and check the heads.",
    on: false,
  },
  {
    name: "Spring feed",
    yearly: { month: 5, day: 20 },
    tip: "A light feed once the grass is growing strongly.",
    on: true,
  },
  {
    name: "Spot-treat weeds",
    yearly: { month: 6, day: 5 },
    tip: "Dandelions and clover, on a calm day.",
    on: false,
  },
  {
    name: "Grub preventer",
    yearly: { month: 6, day: 25 },
    tip: "Goes down from June to mid July, before the grubs hatch.",
    on: true,
  },
  {
    name: "Aerate and overseed",
    yearly: { month: 9, day: 10 },
    tip: "The best window in Chicago is late August to late September.",
    on: true,
  },
  {
    name: "Fall feed",
    yearly: { month: 10, day: 1 },
    tip: "The feed that matters most: it builds roots for next spring.",
    on: true,
  },
  {
    name: "Sprinkler blow-out",
    yearly: { month: 10, day: 15 },
    tip: "Blow the lines out before the first hard freeze.",
    on: false,
  },
  {
    name: "Leaf cleanup",
    yearly: { month: 10, day: 25 },
    tip: "A thick mat of leaves smothers the grass over winter.",
    on: true,
  },
  {
    name: "Winterizer feed",
    yearly: { month: 11, day: 5 },
    tip: "The last feed, before the ground freezes.",
    on: true,
  },
  {
    name: "Last mow",
    yearly: { month: 11, day: 10 },
    tip: "Drop the blade a notch for the final mow.",
    on: false,
  },
];

/** The kits an asset can add on top of its starter list. */
export type KitId = "lawn";
export const KITS: Record<KitId, { title: string; blurb: string; list: Starter[] }> = {
  lawn: {
    title: "Lawn care, Chicago",
    blurb:
      "Cool-season grass, Chicago weather. Each job comes up on its usual day every year; change any day after.",
    list: LAWN_STARTERS,
  },
};

export function startersFor(kind: string): Starter[] {
  if (kind === "property") return PROPERTY_STARTERS;
  if (kind === "vehicle") return VEHICLE_STARTERS;
  return OTHER_STARTERS;
}

/** What the service takes for a ticked starter. */
export const starterJob = (s: Starter): JobInput => ({
  name: s.name,
  months: s.months ?? null,
  miles: s.miles ?? null,
  ...(s.yearly ? { on: s.yearly } : {}),
});
