import { checkRate } from "@/engine/guards";
import { createShootout, startShootout, validateBrief, validateModels } from "@/engine/shootout";
import { clientIp, fail, json, readJson } from "@/lib/http";
import { store } from "@/store";

export const dynamic = "force-dynamic";

/** Start a shootout. Returns immediately; the run continues server-side. */
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    validateBrief(body.brief);
    validateModels(body.kind === "video" ? "video" : "image", body.models);
    checkRate(clientIp(req)); // only well-formed requests count against the quota
    const s = await createShootout({ brief: body.brief, kind: body.kind, models: body.models });
    startShootout(s.id);
    return json({ id: s.id }, 201);
  } catch (err) {
    return fail(err);
  }
}

/** Recent shootouts, newest first (summaries only). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 12));
  const kind = url.searchParams.get("kind");
  const all = (await store().list()).filter((s) => s.round === 1 && (!kind || s.kind === kind));
  return json({
    shootouts: all.slice(0, limit).map((s) => {
      const winner = s.entries.find((e) => e.id === s.winnerId);
      return {
        id: s.id,
        createdAt: s.createdAt,
        brief: s.brief,
        kind: s.kind,
        category: s.category,
        status: s.status,
        seed: !!s.seed,
        models: s.entries.map((e) => e.model),
        winner: winner ? { model: winner.model, grade: winner.score?.grade, total: winner.score?.total, url: winner.outputUrl } : null,
      };
    }),
  });
}
