// money-hub patch: the Spending dashboard's theme, one per mode (owner, 10-02: "theme selections for both dark
// mode and light mode. each mode has [the] theme we just created"). Meadow is the dashboard's own look; Bronze
// Titanium is the second one (liquid glass over bronze glows). The app's Light / Dark / System setting still
// picks the mode; this picks what each mode looks like. Kept on the device, like the sidebar's state.
import { usePersistentState } from "@/hooks/use-persistent-state";

export type DashboardSkin = "meadow" | "bronze";

export const DASHBOARD_SKINS: {
  value: DashboardSkin;
  name: string;
  light: string;
  dark: string;
}[] = [
  { value: "meadow", name: "Meadow", light: "Sand, forest", dark: "Charcoal, lime" },
  { value: "bronze", name: "Bronze Titanium", light: "Cream glass", dark: "Espresso glass" },
];

export function useDashboardSkins() {
  const [light, setLight] = usePersistentState<DashboardSkin>("dashboard-skin-light", "meadow");
  const [dark, setDark] = usePersistentState<DashboardSkin>("dashboard-skin-dark", "meadow");
  return { light, dark, setLight, setDark };
}
