import { contender } from "@/engine/contenders";
import type { BoardRow } from "@/engine/board";
import { boardSnapshot } from "./boardView";

export type Recommendation = {
  kind: "image" | "video";
  category: string;
  requestedCategory: string;
  maxCostUsd: number | null;
  recommendation: ReturnType<typeof view>;
  reason: string;
  alternatives: ReturnType<typeof view>[];
};

const view = (r: BoardRow) => ({
  model: r.model,
  label: contender(r.model)?.label ?? r.model,
  grade: r.grade,
  vouchScore: r.meanScore,
  quality: r.meanQuality,
  fidelity: r.meanFidelity,
  costPerUsableUsd: r.costPerUsable,
  p50Ms: r.p50Ms,
  successRate: r.successRate,
  winRate: r.winRate,
  gradedRenders: r.n,
});

/** Best graded model for a kind of shot under a budget, or null if nothing fits. */
export async function recommend(args: { kind?: string | null; category?: string | null; maxCostUsd?: number | null }): Promise<Recommendation | null> {
  const kind = args.kind === "video" ? "video" : "image";
  const category = args.category || "all";
  const max = Number(args.maxCostUsd);
  const maxCostUsd = Number.isFinite(max) && max > 0 ? max : Infinity;

  const { rows } = await boardSnapshot();
  let pool = rows.filter((r) => r.kind === kind && r.category === category && r.n > 0);
  let scope = category;
  if (!pool.length) {
    pool = rows.filter((r) => r.kind === kind && r.category === "all" && r.n > 0);
    scope = "all";
  }
  const affordable = pool.filter((r) => r.costPerUsable <= maxCostUsd).sort((a, b) => b.meanScore - a.meanScore);
  if (!affordable.length) return null;
  const [best, ...rest] = affordable;
  return {
    kind,
    category: scope,
    requestedCategory: category,
    maxCostUsd: Number.isFinite(maxCostUsd) ? maxCostUsd : null,
    recommendation: view(best),
    reason: `${contender(best.model)?.label ?? best.model} holds a ${best.grade} (${best.meanScore}) on ${scope === "all" ? "all" : scope} ${kind} briefs over ${best.n} graded render${best.n === 1 ? "" : "s"}, at $${best.costPerUsable.toFixed(4)} per usable render.`,
    alternatives: rest.slice(0, 3).map(view),
  };
}
