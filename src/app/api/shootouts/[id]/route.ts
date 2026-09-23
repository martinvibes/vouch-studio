import { recoverIfOrphaned } from "@/engine/shootout";
import { json } from "@/lib/http";
import { store } from "@/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await store().get(id);
  if (!found) return json({ error: "Shootout not found." }, 404);
  const s = await recoverIfOrphaned(found);

  // The refine chain, root first, so the Arena can show round-over-round deltas.
  const chain = [];
  let cur: typeof s | undefined = s;
  while (cur?.parentId && chain.length < 12) {
    cur = await store().get(cur.parentId);
    if (cur) chain.unshift({ id: cur.id, round: cur.round, feedback: cur.feedback, entries: cur.entries.map(brief) });
  }
  const children = await Promise.all((s.childIds ?? []).map((c) => store().get(c)));
  return json({
    shootout: s,
    chain,
    children: children.filter(Boolean).map((c) => ({ id: c!.id, round: c!.round, status: c!.status, feedback: c!.feedback, entries: c!.entries.map(brief) })),
  });
}

const brief = (e: { id: string; model: string; outputUrl?: string; score?: { total: number; grade: string } }) => ({
  id: e.id,
  model: e.model,
  outputUrl: e.outputUrl,
  total: e.score?.total,
  grade: e.score?.grade,
});
