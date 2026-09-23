import { recoverIfOrphaned } from "@/engine/shootout";
import type { Entry, Shootout } from "@/engine/types";
import { store } from "@/store";

export type RoundSummary = { id: string; round: number; status?: string; feedback?: string; entries: { id: string; model: string; outputUrl?: string; total?: number; grade?: string }[] };
export type ShootoutView = { shootout: Shootout; chain: RoundSummary[]; children: RoundSummary[] };

const brief = (e: Entry) => ({ id: e.id, model: e.model, outputUrl: e.outputUrl, total: e.score?.total, grade: e.score?.grade });
const summary = (s: Shootout): RoundSummary => ({ id: s.id, round: s.round, status: s.status, feedback: s.feedback, entries: s.entries.map(brief) });

export async function shootoutView(id: string): Promise<ShootoutView | undefined> {
  const found = await store().get(id);
  if (!found) return undefined;
  const s = await recoverIfOrphaned(found);
  const chain: RoundSummary[] = [];
  let cur: Shootout | undefined = s;
  while (cur?.parentId && chain.length < 12) {
    cur = await store().get(cur.parentId);
    if (cur) chain.unshift(summary(cur));
  }
  const children = (await Promise.all((s.childIds ?? []).map((c) => store().get(c)))).filter((c): c is Shootout => !!c).map(summary);
  return { shootout: s, chain, children };
}
