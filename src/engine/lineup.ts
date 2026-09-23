import type { BoardRow } from "./board";
import { DEFAULT_LINEUPS, contendersFor, estimateCostUsd } from "./contenders";
import type { Category, MediaKind } from "./types";

/**
 * The router. It proposes three contenders for a brief using what the Board
 * has learned: the proven best, the best value, and a challenger that has been
 * sampled least — so every shootout both serves the user and teaches the
 * Board something new.
 */

export type LineupRole = "top" | "value" | "challenger" | "default";
export type LineupPick = { model: string; role: LineupRole; reason: string };

/** A render must reach this mean quality before it can be the "value" pick. */
const VALUE_MIN_QUALITY = 70;

const money = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`);

export function proposeLineup(args: { rows: BoardRow[]; kind: MediaKind; category: Category }): LineupPick[] {
  const candidates = contendersFor(args.kind);
  const known = new Set(candidates.map((c) => c.id));
  const ofKind = args.rows.filter((r) => r.kind === args.kind && known.has(r.model) && r.n > 0);
  const scoped = ofKind.filter((r) => r.category === args.category);
  const pool = scoped.length ? scoped : ofKind.filter((r) => r.category === "all");
  const where = scoped.length ? `${args.category} briefs` : "all briefs";

  if (pool.length === 0) {
    return DEFAULT_LINEUPS[args.kind].map((model) => ({
      model,
      role: "default" as const,
      reason: "The Board has no graded renders here yet. One contender from each price tier.",
    }));
  }

  const picks: LineupPick[] = [];
  const taken = () => new Set(picks.map((p) => p.model));

  const top = [...pool].sort((a, b) => b.meanScore - a.meanScore || b.n - a.n)[0];
  picks.push({
    model: top.model,
    role: "top",
    reason: `Top of the Board for ${where}: ${top.grade} (${top.meanScore}) over ${top.n} graded render${top.n === 1 ? "" : "s"}.`,
  });

  const value = pool
    .filter((r) => !taken().has(r.model) && r.meanQuality >= VALUE_MIN_QUALITY)
    .sort((a, b) => a.costPerUsable - b.costPerUsable)[0];
  if (value) {
    picks.push({
      model: value.model,
      role: "value",
      reason: `Best value: ${value.meanQuality} quality at ${money(value.costPerUsable)} per usable render.`,
    });
  } else {
    const cheapest = candidates
      .filter((c) => !taken().has(c.id))
      .sort((a, b) => estimateCostUsd(a) - estimateCostUsd(b))[0];
    picks.push({ model: cheapest.id, role: "value", reason: `Cheapest on the rate card at ${money(estimateCostUsd(cheapest))}.` });
  }

  const samples = new Map(scoped.map((r) => [r.model, r.n]));
  const challenger = candidates
    .filter((c) => !taken().has(c.id))
    .sort((a, b) => (samples.get(a.id) ?? 0) - (samples.get(b.id) ?? 0) || estimateCostUsd(a) - estimateCostUsd(b))[0];
  const seen = samples.get(challenger.id) ?? 0;
  picks.push({
    model: challenger.id,
    role: "challenger",
    reason:
      seen === 0
        ? `Challenger: never graded on ${args.category} briefs. This run teaches the Board.`
        : `Challenger: only ${seen} graded ${args.category} render${seen === 1 ? "" : "s"} so far.`,
  });

  return picks;
}
