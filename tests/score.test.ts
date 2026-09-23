import { describe, expect, it } from "vitest";
import { scoreEntry, toGrade, valueScore, speedScore } from "@/engine/score";
import type { Check, JudgeResult, Requirement } from "@/engine/types";

const reqs: Requirement[] = [
  { id: "r1", text: "a" },
  { id: "r2", text: "b" },
  { id: "r3", text: "c" },
  { id: "r4", text: "d" },
];

function judge(verdicts: Check["verdict"][], craft = 9, aesthetics = 9): JudgeResult {
  return {
    checks: verdicts.map((v, i) => ({ id: `r${i + 1}`, verdict: v, note: "" })),
    craft,
    aesthetics,
    defects: [],
    verdict: "",
    judgeModel: "test",
  };
}

describe("scoreEntry", () => {
  it("scores a perfect cheap fast image as S", () => {
    const s = scoreEntry({
      kind: "image",
      requirements: reqs,
      judge: judge(["yes", "yes", "yes", "yes"]),
      costUsd: 0.003,
      renderMs: 8000,
    });
    expect(s.fidelity).toBe(100);
    expect(s.quality).toBe(96); // 0.6*100 + 0.25*90 + 0.15*90
    expect(s.value).toBe(100);
    expect(s.speed).toBe(100);
    expect(s.total).toBeCloseTo(97.2, 1); // 0.7*96 + 20 + 10
    expect(s.grade).toBe("S");
    expect(s.caps).toEqual([]);
  });

  it("gives partial credit and counts a missing check as no", () => {
    const j = judge(["yes", "partial"]); // r3, r4 missing
    const s = scoreEntry({ kind: "image", requirements: reqs, judge: j, costUsd: 0.003, renderMs: 8000 });
    expect(s.fidelity).toBe(37.5); // (1 + .5 + 0 + 0) / 4
  });

  it("caps an entry that misses the brief at 58 (C) however cheap it is", () => {
    const s = scoreEntry({
      kind: "image",
      requirements: reqs,
      judge: judge(["yes", "no", "no", "partial"], 10, 10),
      costUsd: 0.003,
      renderMs: 8000,
    });
    expect(s.fidelity).toBe(37.5);
    expect(s.total).toBe(58);
    expect(s.grade).toBe("C");
    expect(s.caps).toContain("Misses the brief (fidelity below 50)");
  });

  it("scores a failed render 0 / F", () => {
    const s = scoreEntry({ kind: "video", requirements: reqs, failed: true });
    expect(s.total).toBe(0);
    expect(s.grade).toBe("F");
    expect(s.caps).toContain("Render failed");
  });

  it("uses video floors for value and speed", () => {
    expect(valueScore("video", 0.05)).toBe(100);
    expect(valueScore("video", 0.5)).toBe(60);
    expect(speedScore("video", 40_000)).toBe(100);
    expect(speedScore("video", 400_000)).toBe(55);
    expect(speedScore("image", 80_000)).toBe(55);
    expect(speedScore("image", 3_000)).toBe(100);
  });

  it("value at 10x the floor is 60, at 100x is 20, never negative", () => {
    expect(valueScore("image", 0.03)).toBe(60);
    expect(valueScore("image", 0.3)).toBe(20);
    expect(valueScore("image", 30)).toBe(0);
    expect(valueScore("image", 0.0001)).toBe(100);
  });
});

describe("toGrade", () => {
  it("applies the published thresholds at their edges", () => {
    expect(toGrade(92)).toBe("S");
    expect(toGrade(91.99)).toBe("A");
    expect(toGrade(80)).toBe("A");
    expect(toGrade(66)).toBe("B");
    expect(toGrade(52)).toBe("C");
    expect(toGrade(38)).toBe("D");
    expect(toGrade(37.9)).toBe("F");
  });
});
