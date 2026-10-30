// money-hub patch: Trips, the read-only Google Drive link that lets a pasted Drive link to a private boarding pass
// be fetched (service lib/driveRead.js). A link of its own: it never touches the Drive backup link.
import { useQuery } from "@tanstack/react-query";

const BASE = "/api/money-hub/drive-read";

export interface DriveReadStatus {
  linked: boolean;
  email: string | null;
  linkedAt: string | null;
  error: string | null;
}

export const DRIVE_READ_KEY = ["money-hub", "drive-read", "status"] as const;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `The money app helper said ${res.status}`);
  return data as T;
}

export const driveReadApi = {
  status: () => call<DriveReadStatus>("GET", "/status"),
  unlink: () => call<DriveReadStatus>("DELETE", "/link"),
};

export function useDriveRead() {
  return useQuery({ queryKey: DRIVE_READ_KEY, queryFn: driveReadApi.status, staleTime: 60_000 });
}

/** Google's consent in a small window, opened before any await so no pop-up blocker fires. Resolves once linked. */
export function linkDriveRead(before: string | null): Promise<DriveReadStatus> {
  const win = window.open("about:blank", "money-driveread-link", "width=520,height=680");
  if (!win)
    return Promise.reject(
      new Error("Your browser blocked the Google window. Allow pop-ups for this site and try again."),
    );
  return new Promise((resolve, reject) => {
    let done = false;
    let closedChecks = 0;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      window.removeEventListener("message", onMsg);
      fn();
    };
    const check = async () => {
      try {
        const s = await driveReadApi.status();
        if (s.linked && s.linkedAt !== before) {
          finish(() => resolve(s));
          return true;
        }
      } catch {
        /* keep waiting */
      }
      return false;
    };
    const onMsg = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === "money-driveread-link") void check();
    };
    window.addEventListener("message", onMsg);
    const timer = setInterval(async () => {
      if (await check()) return;
      if (win.closed && ++closedChecks > 2)
        finish(() => reject(new Error("Drive reading was not allowed (the Google window was closed).")));
    }, 1500);
    setTimeout(() => finish(() => reject(new Error("Linking took too long. Try again."))), 10 * 60_000);
    call<{ url: string }>("POST", "/link", {})
      .then((r) => {
        win.location.href = r.url;
      })
      .catch((err) => {
        try {
          win.close();
        } catch {
          /* already gone */
        }
        finish(() => reject(err));
      });
  });
}
