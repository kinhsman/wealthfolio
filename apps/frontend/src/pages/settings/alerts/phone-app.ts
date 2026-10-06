// money-hub patch: Settings, Alerts, Phone app (owner, 2026-10-06: "enable ios home screen web app
// notification for money app just like how wheeltradr does it"). Real notifications from the money app
// itself through the browser's own push service (Web Push). An iPhone allows it only for a site saved to
// the home screen and opened from that icon (iOS 16.4+), so the card says which step the owner is on
// instead of showing a button that cannot work. The service (money-hub lib/webPush.js) keeps the
// devices and sends; public/sw.js shows them. Same steps as WheelTradr's PhoneNotificationsSettings.

import { useCallback, useEffect, useState } from "react";

export const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export type PhoneStep = "home-screen" | "unsupported" | "ready";

/** What the card offers: the home screen steps (an iPhone in a Safari tab), nothing (a browser that
 *  cannot receive), or the buttons. The home screen comes first: an iPhone tab has no PushManager yet. */
export function phoneStep({ ios, standalone, supported }: { ios: boolean; standalone: boolean; supported: boolean }): PhoneStep {
  if (ios && !standalone) return "home-screen";
  return supported ? "ready" : "unsupported";
}

/** The service's public key (base64url) as the bytes the browser subscribes against. */
export function keyBytes(b64u: string): Uint8Array<ArrayBuffer> {
  const b64 = (b64u + "=".repeat((4 - (b64u.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a);
  return x.every((v, i) => v === b[i]);
}

const WORKER = "/sw.js";

/** Does this browser hold a push subscription for the money app? */
async function mySubscription() {
  const reg = await navigator.serviceWorker.getRegistration(WORKER);
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Sign this device up: ask permission, start the worker, subscribe, tell the service. Throws a sentence. */
export async function turnOnHere(publicKey: string, tell: (sub: PushSubscriptionJSON) => Promise<unknown>) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notifications are blocked for the money app. Allow them in your phone settings, then try again.");
  }
  const reg = await navigator.serviceWorker.register(WORKER);
  await navigator.serviceWorker.ready;
  const key = keyBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  // A subscription made against another key (the service's key pair was made again) can never receive:
  // start over, or subscribe() refuses.
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await tell(sub.toJSON());
}

/** Sign this device off: tell the service, then drop the subscription. */
export async function turnOffHere(tell: (endpoint: string) => Promise<unknown>) {
  const sub = await mySubscription();
  if (!sub) return;
  await tell(sub.endpoint);
  await sub.unsubscribe();
}

/** Is this device signed up? `look` again after turning it on or off. */
export function useThisDevice() {
  const [onHere, setOnHere] = useState(false);
  const look = useCallback(async () => {
    try {
      setOnHere(pushSupported() && !!(await mySubscription()));
    } catch {
      setOnHere(false);
    }
  }, []);
  useEffect(() => {
    void look();
  }, [look]);
  return { onHere, look };
}
