import { toGrade } from "./score";
import type { Category, GradeLetter, MediaKind, Shootout } from "./types";

/**
 * The Board: every judged render, aggregated per model — overall ("all") and
 * per category. Nothing here is self-reported by a model or a vendor; each
 * number traces back to a render Vouch paid for and a verdict it can show.
 */

export type BoardRow = {
  model: string;
  kind: MediaKind;
  category: Category | "all";
  /** Graded renders (the sample the mean is over). */
  n: number;
  /** Graded + failed renders. */
  attempts: number;
  meanScore: number;
  grade: GradeLetter;
  meanFidelity: number;
  meanQuality: number;
  /** Everything spent on this model ÷ renders that were usable. */
  costPerUsable: number;
  p50Ms: number;
  wins: number;
  /** Head-to-head shootouts entered (2+ contenders). */
  shootouts: number;
  winRate: number;
  seals: number;
  successRate: number;
};

type Acc = {
  scores: number[];
  /** Every attempt's total, failures as 0: what you get when you call the model. */
  outcomes: number[];
  fidelity: number[];
  quality: number[];
  ms: number[];
  cost: number;
  attempts: number;
  wins: number;
  shootouts: number;
  seals: number;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function aggregate(shootouts: Shootout[]): BoardRow[] {
  const accs = new Map<string, { model: string; kind: MediaKind; category: Category | "all"; acc: Acc }>();
  const get = (model: string, kind: MediaKind, category: Category | "all") => {
    const key = `${kind}|${category}|${model}`;
    let v = accs.get(key);
    if (!v) {
      v = {
        model,
        kind,
        category,
        acc: { scores: [], outcomes: [], fidelity: [], quality: [], ms: [], cost: 0, attempts: 0, wins: 0, shootouts: 0, seals: 0 },
      };
      accs.set(key, v);
    }
    return v.acc;
  };

  for (const s of shootouts) {
    if (s.status !== "done") continue;
    const headToHead = s.entries.filter((e) => e.status === "done" || e.status === "failed").length >= 2;
    for (const e of s.entries) {
      if (e.status !== "done" && e.status !== "failed") continue; // ungraded / in-flight: no evidence
      for (const cat of [s.category, "all"] as const) {
        const a = get(e.model, s.kind, cat);
        a.attempts++;
        a.cost += e.renderCostUsd ?? 0;
        if (headToHead) a.shootouts++;
        a.outcomes.push(e.status === "done" && e.score ? e.score.total : 0);
        if (e.status === "done" && e.score) {
          a.scores.push(e.score.total);
          a.fidelity.push(e.score.fidelity);
          a.quality.push(e.score.quality);
          if (e.renderMs) a.ms.push(e.renderMs);
          if (headToHead && s.winnerId === e.id) {
            a.wins++;
            if (e.score.total >= 80) a.seals++;
          }
        }
      }
    }
  }

  const rows: BoardRow[] = [...accs.values()].map(({ model, kind, category, acc }) => {
    const n = acc.scores.length;
    const meanScore = r1(mean(acc.outcomes));
    return {
      model,
      kind,
      category,
      n,
      attempts: acc.attempts,
      meanScore,
      grade: toGrade(meanScore),
      meanFidelity: r1(mean(acc.fidelity)),
      meanQuality: r1(mean(acc.quality)),
      costPerUsable: n ? Math.round((acc.cost / n) * 10_000) / 10_000 : 0,
      p50Ms: Math.round(median(acc.ms)),
      wins: acc.wins,
      shootouts: acc.shootouts,
      winRate: acc.shootouts ? Math.round((acc.wins / acc.shootouts) * 1000) / 1000 : 0,
      seals: acc.seals,
      successRate: acc.attempts ? Math.round((n / acc.attempts) * 1000) / 1000 : 0,
    };
  });

  return rows.sort((a, b) => b.meanScore - a.meanScore || b.n - a.n);
}

/** How often a human's pick matched the judge's winner. */
export function judgeHumanAgreement(shootouts: Shootout[]): { picks: number; agree: number; rate: number } {
  const picked = shootouts.filter((s) => s.userPickId && s.winnerId);
  const agree = picked.filter((s) => s.userPickId === s.winnerId).length;
  return { picks: picked.length, agree, rate: picked.length ? Math.round((agree / picked.length) * 1000) / 1000 : 0 };
}
