import { describe, expect, it } from "vitest";
import { proposeLineup } from "@/engine/lineup";
import type { BoardRow } from "@/engine/board";

function row(model: string, meanScore: number, n: number, costPerUsable: number, meanQuality = meanScore): BoardRow {
  return {
    model,
    kind: "image",
    category: "product",
    n,
    attempts: n,
    meanScore,
    grade: "A",
    meanFidelity: meanScore,
    meanQuality,
    costPerUsable,
    p50Ms: 10_000,
    wins: 0,
    shootouts: n,
    winRate: 0,
    seals: 0,
    successRate: 1,
  };
}

describe("proposeLineup", () => {
  it("falls back to the default lineup when the Board is empty", () => {
    const l = proposeLineup({ rows: [], kind: "image", category: "product" });
    expect(l.map((x) => x.model)).toEqual(["flux-dev", "ideogram-v4", "gemini-image"]);
    expect(l.every((x) => x.role === "default")).toBe(true);
  });

  it("picks the top scorer, the best value, then the least-sampled challenger", () => {
    const rows = [
      row("flux-pro", 93, 4, 0.063),
      row("flux-dev", 88, 5, 0.026),
      row("gemini-image", 86, 6, 0.0041),
      row("flux-schnell", 70, 6, 0.0032, 60),
    ];
    const l = proposeLineup({ rows, kind: "image", category: "product" });
    expect(l[0]).toMatchObject({ model: "flux-pro", role: "top" });
    expect(l[1]).toMatchObject({ model: "gemini-image", role: "value" });
    expect(l[2].role).toBe("challenger");
    // never sampled in this category → the most to learn
    expect(["krea-2-turbo", "ideogram-v4", "krea-2", "seedream-5-lite", "uni-1-t2i", "grok-imagine-quality"]).toContain(l[2].model);
  });

  it("never returns duplicates and always returns three", () => {
    const rows = [row("flux-dev", 90, 3, 0.026)];
    const l = proposeLineup({ rows, kind: "image", category: "product" });
    expect(new Set(l.map((x) => x.model)).size).toBe(3);
  });

  it("only proposes contenders of the requested kind", () => {
    const l = proposeLineup({ rows: [row("flux-dev", 99, 9, 0.02)], kind: "video", category: "nature" });
    expect(l.map((x) => x.model)).not.toContain("flux-dev");
    expect(l).toHaveLength(3);
  });
});
