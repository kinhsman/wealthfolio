// money-hub patch: the whole app wears the theme picked for each mode on Settings, Appearance (owner, 10-03,
// after the theme check: "proceed"). <html> carries both picks and the `mh-skin` mark, so every page and every
// pop-up (they open straight under <body>, outside the page) takes the theme's colours; globals.css does the
// rest. Mounted once, inside the profile, where the picks are read; the last picks are also kept outside the
// profile ("mh-skin-last") for index.html, so the sign-in screen wears them too.
import { useEffect } from "react";

import { useDashboardSkins } from "@/features/spending/lib/dashboard-skin";

export function AppSkin() {
  const { light, dark } = useDashboardSkins();
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("mh-skin");
    html.dataset.lightSkin = light;
    html.dataset.darkSkin = dark;
    try {
      localStorage.setItem("mh-skin-last", JSON.stringify({ light, dark }));
    } catch {
      // Browser storage can be unavailable: the sign-in screen then keeps the stock look.
    }
  }, [light, dark]);
  return null;
}
