import { json } from "@/lib/http";
import { recommend } from "@/lib/recommend";

export const dynamic = "force-dynamic";

/**
 * For other agents: "which model should I use for this kind of brief, under
 * this budget?" Answered from graded evidence, not vendor claims.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const out = await recommend({ kind: q.get("kind"), category: q.get("category"), maxCostUsd: Number(q.get("maxCostUsd")) });
  return out ? json(out) : json({ error: "No graded model fits that budget yet." }, 404);
}
