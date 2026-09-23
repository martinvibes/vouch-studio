import { contender } from "@/engine/contenders";
import { boardSnapshot } from "@/lib/boardView";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * For other agents: "which model should I use for this kind of brief, under
 * this budget?" Answered from graded evidence, not vendor claims.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") === "video" ? "video" : "image";
  const category = url.searchParams.get("category") || "all";
  const max = Number(url.searchParams.get("maxCostUsd"));
  const maxCostUsd = Number.isFinite(max) && max > 0 ? max : Infinity;

  const { rows } = await boardSnapshot();
  let pool = rows.filter((r) => r.kind === kind && r.category === category && r.n > 0);
  let scope = category;
  if (!pool.length) {
    pool = rows.filter((r) => r.kind === kind && r.category === "all" && r.n > 0);
    scope = "all";
  }
  const affordable = pool.filter((r) => r.costPerUsable <= maxCostUsd).sort((a, b) => b.meanScore - a.meanScore);
  if (!affordable.length) {
    return json({ error: "No graded model fits that budget yet.", kind, category, maxCostUsd: Number.isFinite(maxCostUsd) ? maxCostUsd : null }, 404);
  }
  const view = (r: (typeof affordable)[number]) => ({
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
  const [best, ...rest] = affordable;
  return json({
    kind,
    category: scope,
    requestedCategory: category,
    maxCostUsd: Number.isFinite(maxCostUsd) ? maxCostUsd : null,
    recommendation: view(best),
    reason: `${contender(best.model)?.label ?? best.model} holds a ${best.grade} (${best.meanScore}) on ${scope === "all" ? "all" : scope} ${kind} briefs over ${best.n} graded render${best.n === 1 ? "" : "s"}, at $${best.costPerUsable.toFixed(4)} per usable render.`,
    alternatives: rest.slice(0, 3).map(view),
  });
}
