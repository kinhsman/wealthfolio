// money-hub patch: the whole app wears the theme picked for each mode on Settings, Appearance (owner, 10-03,
// after the theme check: "proceed"). <html> carries both picks and the `mh-skin` mark, so every page and every
// pop-up (they open straight under <body>, outside the page) takes the theme's colours; globals.css does the
// rest. Mounted once, inside the profile, where the picks are read; the last picks are also kept outside the
// profile ("mh-skin-last"), and main.tsx puts them on <html> before the first render (applyLastSkin), so the
// sign-in screen wears them too. Not in index.html's inline script: its fingerprint is in the server's
// security policy, and changing it would need a server build.
import { useEffect } from "react";

import { useDashboardSkins, type DashboardSkin } from "@/features/spending/lib/dashboard-skin";

const LAST = "mh-skin-last";
const isSkin = (v: unknown): v is DashboardSkin => v === "meadow" || v === "bronze";

/** The last picks on <html> before the profile opens (the sign-in screen). */
export function applyLastSkin() {
  try {
    const last = JSON.parse(localStorage.getItem(LAST) ?? "null") as {
      light?: unknown;
      dark?: unknown;
    } | null;
    if (last && isSkin(last.light) && isSkin(last.dark)) {
      const html = document.documentElement;
      html.classList.add("mh-skin");
      html.dataset.lightSkin = last.light;
      html.dataset.darkSkin = last.dark;
    }
  } catch {
    // Browser storage can be unavailable: the sign-in screen then keeps the stock look.
  }
}

export function AppSkin() {
  const { light, dark } = useDashboardSkins();
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("mh-skin");
    html.dataset.lightSkin = light;
    html.dataset.darkSkin = dark;
    try {
      localStorage.setItem(LAST, JSON.stringify({ light, dark }));
    } catch {
      // Browser storage can be unavailable: the sign-in screen then keeps the stock look.
    }
  }, [light, dark]);
  return null;
}
