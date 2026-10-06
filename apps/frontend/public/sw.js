// money-hub patch: the money app's service worker, for phone notifications ONLY (Settings, Alerts, Phone app).
// No fetch handler on purpose, so it never caches or serves any page or asset. It is only registered when
// the owner presses Turn on there, so nobody else runs it.
// Same worker as WheelTradr's public/sw.js, without its tap trace and page watcher.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  // Apple's own format (declarative web push, iOS 18.4+): the browser hands us the notification it is about
  // to show as event.notification and opens the message's page itself on a tap. Showing our own here would
  // REPLACE it and send the tap back through notificationclick below, the path an iOS home screen app
  // ignores while it is open. Only event.notification proves the browser will show it; the payload alone
  // does not (an older iOS would show nothing, and iOS takes permission away for that).
  if (event.notification) return;
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  // iOS takes push permission away from a site whose pushes show nothing, so every push shows a
  // notification, even a malformed one.
  event.waitUntil(
    self.registration.showNotification(data.title || "Money app", {
      body: data.body || "",
      icon: "/apple-touch-icon.png",
      badge: "/apple-touch-icon.png",
      tag: data.tag || undefined,
      data: { url: data.url || "/" },
    }),
  );
});

// Run a step that may throw or reject: a failed one must never stop the next.
function attempt(step) {
  try {
    return Promise.resolve(step()).catch(() => null);
  } catch (e) {
    return Promise.resolve(null);
  }
}

// The older route (iOS before 18.4, Chrome, Android, Windows): bring the app forward on the alert's page.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // One the browser showed itself (declarative) has no data of ours, only its own `navigate`: the same
  // address. A notification with neither is left alone (never a move to "/").
  const target = (event.notification.data && event.notification.data.url) || event.notification.navigate;
  if (!target) return;
  const url = new URL(target, self.location.origin).href;
  event.waitUntil(
    (async () => {
      // Another site cannot load inside the app window: it opens on its own.
      if (new URL(url).origin !== self.location.origin) {
        await attempt(() => self.clients.openWindow(url));
        return;
      }
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const win = windows.find((c) => c.focused) || windows.find((c) => c.visibilityState === "visible") || windows[0];
      if (!win) {
        await attempt(() => self.clients.openWindow(url));
        return;
      }
      // navigate() first and focus() beside it, the order iOS is known to honour.
      await Promise.all([attempt(() => win.focus()), win.url === url ? null : attempt(() => win.navigate(url))]);
    })(),
  );
});
