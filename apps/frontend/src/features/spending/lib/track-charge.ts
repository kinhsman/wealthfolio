// money-hub patch: filing a charge as a subscription or a bill asks which one it is (owner,
// 2026-10-01: "when i change something to s subscription category, the app must prompt me to link
// to an existing subscription for create one", then "subscriptions as well as bills too"). The
// window (components/track-charge-dialog.tsx, mounted once in App.tsx) links the charge to one on
// Subscriptions & bills, or starts a new one from it; the money-hub service keeps the link
// (server/drive-backup/lib/subscriptions.js `links`).
import { cachedCategoryGroup } from "./category-groups";
import type { StreamGroup } from "./subscriptions";

/** Categories whose charges are subscriptions. */
const SUBSCRIPTION_KEYS = new Set(["bills_subscriptions", "bills_software", "entertainment_streaming"]);
/** Categories whose charges are bills; any other category under Bills & Utilities is one too. */
const BILL_KEYS = new Set([
  "bills",
  "bills_phone",
  "bills_internet",
  "housing_utilities",
  "housing_rent",
  "housing_insurance",
  "transport_insurance",
  "health_insurance",
]);

interface CategoryLike {
  id: string;
  key: string;
  parentId?: string | null;
}

/** Subscriptions or Bills when this category asks which one a charge is; null when it does not. */
export function trackGroupFor(categoryId: string, categories: CategoryLike[]): StreamGroup | null {
  // The owner's choice per category, from the money-hub service (lib/category-groups.ts); the lists
  // here only until it has answered once.
  const chosen = cachedCategoryGroup(categoryId);
  if (chosen !== undefined) return chosen;
  const c = categories.find((x) => x.id === categoryId);
  if (!c) return null;
  if (SUBSCRIPTION_KEYS.has(c.key)) return "subscriptions";
  if (BILL_KEYS.has(c.key)) return "bills";
  const parent = c.parentId ? categories.find((x) => x.id === c.parentId) : undefined;
  if (parent && SUBSCRIPTION_KEYS.has(parent.key)) return "subscriptions";
  if (parent?.key === "bills") return "bills";
  return null;
}

export interface TrackCharge {
  id: string;
  notes: string;
  /** Money out, as a positive number. */
  amount: number;
  /** YYYY-MM-DD. */
  date: string;
  accountId: string;
  activityType?: string | null;
  group: StreamGroup;
  categoryName: string;
  /** Runs when the window closes, whatever was picked (the rule offer waits for it). */
  after?: () => void;
}

// The one open window, for its host (a tiny store, like the rule offer's).
let current: TrackCharge | null = null;
const listeners = new Set<() => void>();
export const trackChargeStore = {
  get: () => current,
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  open: (charge: TrackCharge) => {
    current = charge;
    listeners.forEach((fn) => fn());
  },
  close: () => {
    const done = current?.after;
    current = null;
    listeners.forEach((fn) => fn());
    done?.();
  },
};

/**
 * Opens the window when a money-out charge was just filed under a subscription or bill category;
 * false when it does not apply (then the caller carries on as before).
 */
export function askWhichOne({
  activity,
  categoryId,
  categories,
  categoryName,
  after,
}: {
  activity: { id: string; notes?: string | null; amount?: string | number | null; activityDate: string | Date; accountId: string; activityType?: string | null } | undefined;
  categoryId: string;
  categories: CategoryLike[];
  categoryName: string;
  after?: () => void;
}): boolean {
  if (activity?.activityType !== "WITHDRAWAL") return false;
  const group = trackGroupFor(categoryId, categories);
  if (!group) return false;
  const date = activity.activityDate instanceof Date ? activity.activityDate.toISOString() : String(activity.activityDate);
  const charge: TrackCharge = {
    id: activity.id,
    notes: activity.notes ?? "",
    amount: Math.abs(Number(activity.amount) || 0),
    date: date.slice(0, 10),
    accountId: activity.accountId,
    activityType: activity.activityType,
    group,
    categoryName,
    after,
  };
  // After the picker or the edit window that raised it has closed, so the two never overlap.
  setTimeout(() => trackChargeStore.open(charge), 0);
  return true;
}
