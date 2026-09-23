import { describe, expect, it } from "vitest";
import { mergeVotes } from "@/engine/judgeParse";

describe("mergeVotes (two blind passes → one verdict)", () => {
  const base = { craft: 8, aesthetics: 7, defects: [] as string[], verdict: "first" };
  it("averages scores and resolves split verdicts to partial", () => {
    const m = mergeVotes([
      { ...base, checks: [{ id: "r1", verdict: "yes", note: "a" }, { id: "r2", verdict: "yes", note: "" }] },
      { ...base, craft: 6, aesthetics: 9, checks: [{ id: "r1", verdict: "no", note: "b" }, { id: "r2", verdict: "yes", note: "" }] },
    ]);
    expect(m.checks.map((c) => c.verdict)).toEqual(["partial", "yes"]);
    expect(m.craft).toBe(7);
    expect(m.aesthetics).toBe(8);
  });
  it("keeps the dissenting note, merges defects without duplicates", () => {
    const m = mergeVotes([
      { ...base, defects: ["Extra finger"], checks: [{ id: "r1", verdict: "yes", note: "logo visible" }] },
      { ...base, defects: ["extra finger", "blurry text"], checks: [{ id: "r1", verdict: "no", note: "no logo" }] },
    ]);
    expect(m.checks[0].note).toBe("no logo");
    expect(m.defects).toEqual(["Extra finger", "blurry text"]);
  });
  it("partial + no stays below yes (0.25 → partial), no + no is no", () => {
    const m = mergeVotes([
      { ...base, checks: [{ id: "r1", verdict: "partial", note: "" }, { id: "r2", verdict: "no", note: "" }] },
      { ...base, checks: [{ id: "r1", verdict: "no", note: "" }, { id: "r2", verdict: "no", note: "" }] },
    ]);
    expect(m.checks.map((c) => c.verdict)).toEqual(["partial", "no"]);
  });
  it("passes a single vote through unchanged", () => {
    const v = { ...base, checks: [{ id: "r1", verdict: "yes" as const, note: "x" }] };
    expect(mergeVotes([v])).toEqual(v);
  });
});
