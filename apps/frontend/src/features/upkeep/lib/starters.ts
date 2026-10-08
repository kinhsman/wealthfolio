// money-hub patch: Home & Car, the starter lists. A new plan starts from the jobs most people need for that
// kind of asset (the owner ticks what applies and can change every number): "a thing goes in only if it costs
// money or has a due date". A job added from here has no last-done day yet: the page asks for it.
import type { JobInput } from "./upkeep";

export interface Starter {
  name: string;
  months?: number;
  miles?: number;
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
});
