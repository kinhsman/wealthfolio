// money-hub patch: Trips, Google's file picker for a boarding pass. The picker runs in its own window served by the
// backup service (Wealthfolio's pages do not allow Google's scripts) and hands the pick back by postMessage. The
// same window the Drive backup settings use, in its `pass` kind (PDF, pictures, Google Docs).

/** Safari and every iPhone browser cannot run Google's picker window; they paste a link instead. */
export function pickerSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = /^((?!chrome|chromium|crios|fxios|edg|android).)*safari/i.test(ua);
  return !ios && !safari;
}

/** Opens the picker (call it straight from a click, before any await). Null when the window is closed without a pick. */
export function pickPassFromDrive(): Promise<{ id: string; name: string } | null> {
  const win = window.open("/api/drive-backup/picker?kind=pass", "money-drive-picker", "width=1000,height=720");
  if (!win)
    return Promise.reject(
      new Error("Your browser blocked the Google window. Allow pop-ups for this site and try again."),
    );
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearInterval(timer);
      window.removeEventListener("message", onMsg);
    };
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== "money-drive-pick") return;
      cleanup();
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.pick ?? null);
    };
    const timer = setInterval(() => {
      if (win.closed) {
        cleanup();
        resolve(null);
      }
    }, 800);
    window.addEventListener("message", onMsg);
  });
}
