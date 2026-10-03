// money-hub patch: Settings, Appearance: the Spending dashboard's theme for each mode (owner, 10-02).
// Two rows, Light mode and Dark mode, each a choice of Meadow or Bronze Titanium shown as a small picture
// of that look. The app's Theme setting above still decides which mode is showing.
import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";
import { Icons } from "@wealthfolio/ui";

import { DASHBOARD_SKINS, useDashboardSkins, type DashboardSkin } from "../lib/dashboard-skin";

interface Look {
  page: string;
  frame: string;
  hero: string;
  heroLine: string;
  heroInk: string;
  card: string;
  cardLine: string;
  accent: string;
  heroRadius: number;
}

const LOOKS: Record<"light" | "dark", Record<DashboardSkin, Look>> = {
  light: {
    meadow: {
      page: "#f5f0ec",
      frame: "#e4dccf",
      hero: "#dcefd3",
      heroLine: "#dcefd3",
      heroInk: "#12361a",
      card: "#ffffff",
      cardLine: "#e4dccf",
      accent: "#054e04",
      heroRadius: 8,
    },
    bronze: {
      page: "radial-gradient(140px 90px at 10% 0%, rgba(214,164,108,0.55), transparent 70%), #efe8e0",
      frame: "rgba(91,60,32,0.12)",
      hero: "radial-gradient(140% 120% at 0% 0%, rgba(205,160,110,0.9) 0%, rgba(226,198,165,0.75) 45%, rgba(244,232,218,0.65) 100%)",
      heroLine: "rgba(255,255,255,0.8)",
      heroInk: "#2a1f16",
      card: "rgba(255,252,248,0.8)",
      cardLine: "#ffffff",
      accent: "#5b3c20",
      heroRadius: 11,
    },
  },
  dark: {
    meadow: {
      page: "#121110",
      frame: "#2a2825",
      hero: "#1f2721",
      heroLine: "#1f2721",
      heroInk: "#f2efea",
      card: "#1b1a18",
      cardLine: "#36332e",
      accent: "#cff6ac",
      heroRadius: 8,
    },
    bronze: {
      page: "radial-gradient(140px 90px at 10% 0%, rgba(176,116,60,0.25), transparent 70%), #12100f",
      frame: "rgba(237,226,214,0.1)",
      hero: "radial-gradient(140% 120% at 0% 0%, rgba(116,76,42,0.75) 0%, rgba(66,44,26,0.7) 45%, rgba(30,24,20,0.85) 100%)",
      heroLine: "rgba(236,208,172,0.24)",
      heroInk: "#f3ece4",
      card: "rgba(30,26,24,0.9)",
      cardLine: "rgba(237,226,214,0.11)",
      accent: "#c9a27a",
      heroRadius: 11,
    },
  },
};

export function DashboardSkinPicker() {
  const { light, dark, setLight, setDark } = useDashboardSkins();
  return (
    <div className="space-y-4">
      <Row mode="light" title="Light mode" value={light} onChange={setLight} />
      <Row mode="dark" title="Dark mode" value={dark} onChange={setDark} />
    </div>
  );
}

function Row({
  mode,
  title,
  value,
  onChange,
}: {
  mode: "light" | "dark";
  title: string;
  value: DashboardSkin;
  onChange: (v: DashboardSkin) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        {mode === "light" ? (
          <Icons.Sun className="h-3.5 w-3.5" />
        ) : (
          <Icons.Moon className="h-3.5 w-3.5" />
        )}
        {title}
      </p>
      <div
        role="radiogroup"
        aria-label={`${title} theme`}
        className="grid max-w-md grid-cols-2 gap-2.5"
      >
        {DASHBOARD_SKINS.map((s) => {
          const on = s.value === value;
          const look = LOOKS[mode][s.value];
          return (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(s.value)}
              className={cn(
                "bg-muted/30 flex min-w-0 flex-col gap-1.5 rounded-xl border-2 p-1.5 text-left transition-colors",
                on ? "border-primary" : "border-border hover:border-muted-foreground/40",
              )}
            >
              <Thumb look={look} on={on} />
              <span className="px-0.5 pb-0.5 leading-tight">
                <span className="block truncate text-[13px] font-medium">{s.name}</span>
                <span className="text-muted-foreground block truncate text-[11.5px]">
                  {mode === "light" ? s.light : s.dark}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Thumb({ look, on }: { look: Look; on: boolean }) {
  const hero: CSSProperties = {
    background: look.hero,
    border: `1px solid ${look.heroLine}`,
    borderRadius: look.heroRadius,
  };
  return (
    <span
      aria-hidden
      className="relative block h-[68px] overflow-hidden rounded-[9px]"
      style={{ background: look.page, border: `1px solid ${look.frame}` }}
    >
      <span
        className="absolute inset-x-[7px] top-[7px] flex h-[34px] items-center justify-between px-2"
        style={hero}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: look.heroInk,
            lineHeight: 1,
          }}
        >
          $1,586
        </span>
        <span className="h-2 w-[18px] rounded-full" style={{ background: look.accent }} />
      </span>
      <span
        className="absolute inset-x-[7px] top-[46px] h-[15px] rounded-[5px]"
        style={{ background: look.card, border: `1px solid ${look.cardLine}` }}
      />
      {on ? (
        <span className="bg-primary text-primary-foreground absolute right-[5px] top-[5px] flex h-[18px] w-[18px] items-center justify-center rounded-full">
          <Icons.Check className="h-3 w-3" />
        </span>
      ) : null}
    </span>
  );
}
