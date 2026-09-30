// money-hub patch: WheelTradr accounts held in the money app.
//
// Each WheelTradr account the owner switches on (Settings, Connections, WheelTradr) is a
// holdings-mode account holding ONE share of a manual asset priced at the account's value
// (the money-hub service, server/drive-backup/lib/wheeltradr.js). The share count and
// price mean nothing to the owner, and WheelTradr's own today P/L and unrealized P/L
// ($ and %) are what he wants to see. The service writes them into the asset's notes on a
// `wheeltradr:{...}` line; these helpers read that line for the Holdings table and the
// dashboard's top holdings, and keep it out of the notes shown on the asset page.

export interface WheelTradrStats {
  todayPnl: number;
  todayPct: number; // percent, e.g. 1.67
  unrealizedPnl: number;
  unrealizedPct: number; // percent, e.g. -11.8
  asOf?: string | null;
}

const MARK = "wheeltradr:";

export function wheeltradrStats(notes?: string | null): WheelTradrStats | null {
  if (!notes) return null;
  const line = notes.split("\n").find((l) => l.startsWith(MARK));
  if (!line) return null;
  try {
    const s = JSON.parse(line.slice(MARK.length)) as Partial<WheelTradrStats>;
    const nums = [s.todayPnl, s.todayPct, s.unrealizedPnl, s.unrealizedPct];
    if (nums.some((n) => typeof n !== "number" || !Number.isFinite(n))) return null;
    return s as WheelTradrStats;
  } catch {
    return null;
  }
}

/** Notes as the owner reads them: without the machine line. */
export function notesForDisplay(notes?: string | null): string | null {
  if (!notes) return notes ?? null;
  const kept = notes
    .split("\n")
    .filter((l) => !l.startsWith(MARK))
    .join("\n")
    .trim();
  return kept || null;
}
