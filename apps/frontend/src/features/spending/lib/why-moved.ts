import { SAVINGS_ROW_ID, type WhereItWentRow } from "./category-rollup";

export interface Mover {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  delta: number;
  amount: number;
}

/**
 * money-hub patch (owner, 10-18): why spending moved against the prior period. The categories that moved the
 * same way as the total (up when spending rose, down when it fell), biggest change first; `restDelta` is what
 * the smaller ones add up to, and `againstDelta` what moved the other way.
 */
export function topMovers(
  rows: WhereItWentRow[],
  totalDelta: number,
  limit = 4,
): { movers: Mover[]; restDelta: number; restCount: number; againstDelta: number } {
  const sign = totalDelta >= 0 ? 1 : -1;
  const spend = rows.filter((r) => r.id !== SAVINGS_ROW_ID && Math.abs(r.delta) >= 0.5);
  const same = spend.filter((r) => Math.sign(r.delta) === sign).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const against = spend.filter((r) => Math.sign(r.delta) !== sign);
  const shown = same.slice(0, limit);
  const rest = same.slice(limit);
  return {
    movers: shown.map((r) => ({ id: r.id, name: r.name, color: r.color, icon: r.icon, delta: r.delta, amount: r.amount })),
    restDelta: rest.reduce((s, r) => s + r.delta, 0),
    restCount: rest.length,
    againstDelta: against.reduce((s, r) => s + r.delta, 0),
  };
}
