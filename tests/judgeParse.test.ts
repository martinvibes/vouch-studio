import { describe, expect, it } from "vitest";
import { extractJsonObject, parseJudgeJson } from "@/engine/judgeParse";

const ids = ["r1", "r2", "r3"];

describe("extractJsonObject", () => {
  it("finds a fenced object", () => {
    expect(extractJsonObject('```json\n{"ok": true}\n```')).toEqual({ ok: true });
  });
  it("finds an object wrapped in prose, with braces inside strings", () => {
    expect(extractJsonObject('Sure! Here it is: {"a": "x}y", "b": {"c": 1}} Hope that helps.')).toEqual({
      a: "x}y",
      b: { c: 1 },
    });
  });
  it("returns null for garbage", () => {
    expect(extractJsonObject("no json here at all")).toBeNull();
  });
});

describe("parseJudgeJson", () => {
  it("reads the canonical shape", () => {
    const r = parseJudgeJson(
      JSON.stringify({
        checks: [
          { id: "r1", verdict: "yes", note: "mug present" },
          { id: "r2", verdict: "partial", note: "logo is small" },
          { id: "r3", verdict: "no", note: "no desk" },
        ],
        craft: 8,
        aesthetics: 7,
        defects: ["warped handle"],
        verdict: "Good mug, wrong surface.",
      }),
      ids,
    );
    expect(r).not.toBeNull();
    expect(r!.checks.map((c) => c.verdict)).toEqual(["yes", "partial", "no"]);
    expect(r!.checks[1].note).toBe("logo is small");
    expect(r!.craft).toBe(8);
    expect(r!.aesthetics).toBe(7);
    expect(r!.defects).toEqual(["warped handle"]);
    expect(r!.verdict).toBe("Good mug, wrong surface.");
  });

  it("accepts numeric ids, boolean and loose verdict words", () => {
    const r = parseJudgeJson(
      '```json\n{"checks":[{"id":1,"verdict":true},{"id":"2","verdict":"Partially"},{"id":"R3","verdict":"Not met"}],"craft":"9","aesthetics":6}\n```',
      ids,
    );
    expect(r!.checks.map((c) => [c.id, c.verdict])).toEqual([
      ["r1", "yes"],
      ["r2", "partial"],
      ["r3", "no"],
    ]);
    expect(r!.craft).toBe(9);
  });

  it("accepts checks given as an id → verdict map", () => {
    const r = parseJudgeJson('{"checks":{"r1":"yes","r2":"no","r3":{"verdict":"yes","note":"ok"}},"craft":7,"aesthetics":7}', ids);
    expect(r!.checks.map((c) => c.verdict)).toEqual(["yes", "no", "yes"]);
    expect(r!.checks[2].note).toBe("ok");
  });

  it("clamps out-of-range scores and rescales a 0-100 answer", () => {
    const r = parseJudgeJson('{"checks":[],"craft":85,"aesthetics":-3}', ids);
    expect(r!.craft).toBe(8.5);
    expect(r!.aesthetics).toBe(0);
  });

  it("marks requirements the judge skipped as no, in requirement order", () => {
    const r = parseJudgeJson('{"checks":[{"id":"r2","verdict":"yes"}],"craft":7,"aesthetics":7}', ids);
    expect(r!.checks).toEqual([
      { id: "r1", verdict: "no", note: "Not assessed by the judge." },
      { id: "r2", verdict: "yes", note: "" },
      { id: "r3", verdict: "no", note: "Not assessed by the judge." },
    ]);
  });

  it("drops 'none' placeholder defects and ignores unknown ids", () => {
    const r = parseJudgeJson(
      '{"checks":[{"id":"r9","verdict":"yes"}],"craft":7,"aesthetics":7,"defects":["None visible","none","  ","extra finger"]}',
      ids,
    );
    expect(r!.defects).toEqual(["extra finger"]);
    expect(r!.checks.every((c) => c.verdict === "no")).toBe(true);
  });

  it("returns null when there is nothing usable", () => {
    expect(parseJudgeJson("I cannot evaluate this image.", ids)).toBeNull();
    expect(parseJudgeJson('{"hello":"world"}', ids)).toBeNull();
  });
});

describe("trailing commas", () => {
  it("recovers a verdict with a trailing comma in the checks array (seen live from the video judge)", () => {
    const text =
      '{"checks":[{"id":"r1","verdict":"yes","note":"bottle visible"},{"id":"r2","verdict":"partial","note":"slow turn"},],"craft":9,"aesthetics":8,"defects":[],"verdict":"good",}';
    const out = parseJudgeJson(text, ["r1", "r2"]);
    expect(out?.checks.map((c) => c.verdict)).toEqual(["yes", "partial"]);
    expect(out?.craft).toBe(9);
  });
});
