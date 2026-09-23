import { aggregate, judgeHumanAgreement, type BoardRow } from "@/engine/board";
import { contender } from "@/engine/contenders";
import { store } from "@/store";
import type { Shootout } from "@/engine/types";

export type BoardSnapshot = {
  rows: BoardRow[];
  agreement: { picks: number; agree: number; rate: number };
  totals: { shootouts: number; renders: number; spendUsd: number; models: number };
};

// Aggregation is cheap, but the Board is read on every page; cache it per store revision.
let cached: { rev: number; snap: BoardSnapshot } | undefined;

export async function boardSnapshot(): Promise<BoardSnapshot> {
  const st = store();
  const all = await st.list();
  if (cached && cached.rev === st.version() && st.version() > 0) return cached.snap;
  const snap = summarize(all);
  cached = { rev: st.version(), snap };
  return snap;
}

export function summarize(all: Shootout[]): BoardSnapshot {
  const rows = aggregate(all).filter((r) => contender(r.model));
  let renders = 0;
  let spendUsd = 0;
  for (const s of all) {
    for (const e of s.entries) {
      if (e.outputUrl) renders++;
      spendUsd += (e.renderCostUsd ?? 0) + (e.judge?.costUsd ?? 0);
    }
  }
  return {
    rows,
    agreement: judgeHumanAgreement(all),
    totals: {
      shootouts: all.filter((s) => s.status === "done").length,
      renders,
      spendUsd: Math.round(spendUsd * 100) / 100,
      models: new Set(rows.map((r) => r.model)).size,
    },
  };
}
