// money-hub patch: the bell (owner, 2026-10-02, with a picture of Monarch's notification panel: "monarch has
// this notification panel which users can clear manually"). Every alert the money-hub service sends to
// Discord and the phone is kept for the app too (server/drive-backup/lib/inbox.js).
import { useQuery } from "@tanstack/react-query";

export interface InboxItem {
  id: string;
  /** When it was sent (ISO). */
  at: string;
  title: string;
  text: string;
  /** Where it points in the app ("/spending/returns"), or null. */
  link: string | null;
  /** The store's or the bank's logo, or the app's icon (a public https address). */
  icon: string | null;
  read: boolean;
}

export interface InboxView {
  items: InboxItem[];
  unread: number;
}

const BASE = "/api/money-hub/inbox";
export const INBOX_KEY = ["money-hub", "inbox"] as const;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error((data as { error?: string }).error || `The money app helper said ${res.status}`);
  return data as T;
}

export const inboxApi = {
  get: () => call<InboxView>("GET", ""),
  /** Read: the ids given, or every alert up to `upTo` (the newest one the panel showed). */
  read: (body: { ids?: string[]; upTo?: string }) => call<InboxView>("POST", "/read", body),
  remove: (id: string) => call<InboxView>("DELETE", `/${encodeURIComponent(id)}`),
  /** Clear all: every alert the panel showed (`upTo`), so one arriving meanwhile stays. */
  clear: (upTo?: string) =>
    call<InboxView>("DELETE", upTo ? `?upTo=${encodeURIComponent(upTo)}` : ""),
};

/** The bell's list, checked every minute and when the app comes back to the front. */
export function useInbox() {
  return useQuery({
    queryKey: INBOX_KEY,
    queryFn: inboxApi.get,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

/** "now", "16m", "6h", "3d", then the day ("Sep 21"). */
export function timeAgo(at: string, now = Date.now()): string {
  const ms = now - Date.parse(at);
  if (!Number.isFinite(ms)) return "";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** The count on the bell: up to 9, then "9+". */
export const badgeText = (n: number) => (n > 9 ? "9+" : String(n));
