// money-hub patch: Trips, the clock of a stamp the airline printed ("2026-10-30T20:42" -> "8:42 PM"), for the delay lines.
export function clockOf(stamp: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(stamp);
  if (!m) return stamp;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}
