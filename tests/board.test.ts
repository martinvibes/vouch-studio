import { describe, expect, it } from "vitest";
import { aggregate, judgeHumanAgreement } from "@/engine/board";
import type { Entry, Shootout } from "@/engine/types";

let seq = 0;
function entry(model: string, total: number | null, extra: Partial<Entry> = {}): Entry {
  const failed = total === null;
  return {
    id: `e${++seq}`,
    model,
    prompt: "p",
    status: failed ? "failed" : "done",
    renderMs: 10_000,
    renderCostUsd: 0.01,
    score: failed
      ? undefined
      : { fidelity: total, craft: 80, aesthetics: 80, quality: total, value: 90, speed: 90, total, grade: total >= 80 ? "A" : "B", caps: [] },
    ...extra,
  };
}

function shootout(entries: Entry[], extra: Partial<Shootout> = {}): Shootout {
  const graded = entries.filter((e) => e.score);
  const winner = graded.sort((a, b) => b.score!.total - a.score!.total)[0];
  return {
    id: `s${++seq}`,
    createdAt: 0,
    updatedAt: 0,
    brief: "b",
    kind: "image",
    category: "product",
    requirements: [],
    entries,
    status: "done",
    winnerId: winner?.id,
    round: 1,
    sessionId: "x",
    ...extra,
  };
}

describe("aggregate", () => {
  const s1 = shootout([entry("flux-dev", 90), entry("gemini-image", 70), entry("ideogram-v4", null)]);
  const s2 = shootout([entry("flux-dev", 80), entry("gemini-image", 84)], { category: "portrait" });
  const s3 = shootout([entry("flux-dev", 60, { status: "ungraded", score: undefined })]);
  const rows = aggregate([s1, s2, s3]);
  const row = (model: string, category: string) => rows.find((r) => r.model === model && r.category === category)!;

  it("builds per-category rows and an 'all' row per model", () => {
    expect(row("flux-dev", "product").n).toBe(1);
    expect(row("flux-dev", "all").n).toBe(2);
    expect(row("flux-dev", "all").meanScore).toBe(85);
  });

  it("counts failed renders against success rate but not the mean", () => {
    const ideo = row("ideogram-v4", "all");
    expect(ideo.attempts).toBe(1);
    expect(ideo.n).toBe(0);
    expect(ideo.successRate).toBe(0);
  });

  it("excludes ungraded entries entirely", () => {
    expect(row("flux-dev", "all").attempts).toBe(2);
  });

  it("computes wins and win rate over multi-entry shootouts", () => {
    expect(row("flux-dev", "all").wins).toBe(1);
    expect(row("flux-dev", "all").shootouts).toBe(2);
    expect(row("gemini-image", "all").winRate).toBe(0.5);
  });

  it("computes $ per usable render (failed renders still cost)", () => {
    expect(row("flux-dev", "all").costPerUsable).toBeCloseTo(0.01, 6);
  });

  it("does not count a single-entry refine round as a win", () => {
    const refine = shootout([entry("krea-2", 95)], { round: 2 });
    const r = aggregate([refine]).find((x) => x.model === "krea-2" && x.category === "all")!;
    expect(r.wins).toBe(0);
    expect(r.shootouts).toBe(0);
    expect(r.n).toBe(1);
  });

  it("ranks by mean score", () => {
    const all = rows.filter((r) => r.category === "all" && r.n > 0);
    expect(all.map((r) => r.model)).toEqual(["flux-dev", "gemini-image"]);
  });
});

describe("judgeHumanAgreement", () => {
  it("is the share of human picks that match the judge", () => {
    const a = shootout([entry("m1", 90), entry("m2", 80)]);
    a.userPickId = a.winnerId;
    const b = shootout([entry("m1", 90), entry("m2", 80)]);
    b.userPickId = b.entries.find((e) => e.id !== b.winnerId)!.id;
    const c = shootout([entry("m1", 90), entry("m2", 80)]);
    expect(judgeHumanAgreement([a, b, c])).toEqual({ picks: 2, agree: 1, rate: 0.5 });
  });
});

describe("reliability", () => {
  it("counts a failed render as 0 in the Vouch score but keeps quality over graded renders", () => {
    const rows = aggregate([shootout([entry("ltx-t2v", 88), entry("pixverse-t2v", 80)]), shootout([entry("ltx-t2v", null), entry("pixverse-t2v", 82)])]);
    const ltx = rows.find((r) => r.model === "ltx-t2v" && r.category === "all")!;
    expect(ltx.meanScore).toBe(44);
    expect(ltx.meanQuality).toBe(88);
    expect(ltx.n).toBe(1);
    expect(ltx.successRate).toBe(0.5);
    expect(rows.filter((r) => r.category === "all")[0].model).toBe("pixverse-t2v");
  });
});
