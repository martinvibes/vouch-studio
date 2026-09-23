import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createRefine,
  createShootout,
  pickEntry,
  recoverIfOrphaned,
  runShootout,
  ShootoutError,
  type Deps,
} from "@/engine/shootout";
import { FileStore } from "@/store";
import type { JudgeResult, Requirement } from "@/engine/types";

const reqs: Requirement[] = [
  { id: "r1", text: "a red kettle" },
  { id: "r2", text: "on a white table" },
  { id: "r3", text: "morning light" },
];

const verdict = (yes: number, craft = 8): JudgeResult => ({
  checks: reqs.map((r, i) => ({ id: r.id, verdict: i < yes ? "yes" : "no", note: "" })),
  craft,
  aesthetics: 8,
  defects: [],
  verdict: "ok",
  judgeModel: "fake",
  costUsd: 0.01,
});

async function fakeDeps(overrides: Partial<Deps> = {}): Promise<Deps & { calls: string[] }> {
  const calls: string[] = [];
  const dir = await mkdtemp(path.join(tmpdir(), "vouch-shootout-"));
  return {
    calls,
    store: new FileStore(dir),
    checklist: async () => ({ category: "product", requirements: reqs }),
    render: async ({ model }) => {
      calls.push(`render:${model}`);
      if (model === "flux-schnell") throw new Error("provider exploded");
      return { url: `https://x.test/${model}.png`, costUsd: 0.02 };
    },
    judgeableUrl: async ({ url }) => url,
    judge: async ({ imageUrl }) => (imageUrl.includes("gemini") ? verdict(3, 9) : verdict(2, 7)),
    feedbackRequirements: async (_f, existing) => [{ id: `r${existing.length + 1}`, text: "a steam plume", fromFeedback: true }],
    rewrite: async ({ previousPrompt, feedback }) => `${previousPrompt} — ${feedback} (rewritten)`,
    ...overrides,
  };
}

describe("shootout orchestration", () => {
  it("renders every contender, scores what lands, fails what does not, and names a winner", async () => {
    const deps = await fakeDeps();
    const s = await createShootout(
      { brief: "A red kettle on a white table in morning light", kind: "image", models: ["flux-dev", "gemini-image", "flux-schnell"] },
      deps,
    );
    expect(s.status).toBe("queued");
    await runShootout(s.id, deps);

    const done = (await deps.store.get(s.id))!;
    expect(done.status).toBe("done");
    expect(done.requirements).toHaveLength(3);
    const byModel = Object.fromEntries(done.entries.map((e) => [e.model, e]));
    expect(byModel["flux-schnell"].status).toBe("failed");
    expect(byModel["flux-schnell"].score?.grade).toBe("F");
    expect(byModel["gemini-image"].status).toBe("done");
    expect(byModel["flux-dev"].status).toBe("done");
    expect(done.winnerId).toBe(byModel["gemini-image"].id);
    expect(byModel["gemini-image"].score!.total).toBeGreaterThan(byModel["flux-dev"].score!.total);
  });

  it("keeps a render whose judge fails as ungraded, never re-rendering it", async () => {
    const deps = await fakeDeps({
      judge: async () => {
        throw new Error("vision model down");
      },
    });
    const s = await createShootout({ brief: "A red kettle on a white table", kind: "image", models: ["flux-dev"] }, deps);
    await runShootout(s.id, deps);
    const done = (await deps.store.get(s.id))!;
    expect(done.status).toBe("done");
    expect(done.entries[0].status).toBe("ungraded");
    expect(done.entries[0].outputUrl).toContain("flux-dev");
    expect(done.winnerId).toBeUndefined();
    expect(deps.calls.filter((c) => c === "render:flux-dev")).toHaveLength(1);
  });

  it("fails the shootout when nothing renders", async () => {
    const deps = await fakeDeps();
    const s = await createShootout({ brief: "A red kettle on a white table", kind: "image", models: ["flux-schnell"] }, deps);
    await runShootout(s.id, deps);
    expect((await deps.store.get(s.id))!.status).toBe("failed");
  });

  it("rejects bad input before spending anything", async () => {
    const deps = await fakeDeps();
    await expect(createShootout({ brief: "hi", kind: "image", models: ["flux-dev"] }, deps)).rejects.toThrow(ShootoutError);
    await expect(
      createShootout({ brief: "A red kettle on a table", kind: "image", models: ["pixverse-t2v"] }, deps),
    ).rejects.toThrow(/video model/);
    await expect(
      createShootout({ brief: "A red kettle on a table", kind: "image", models: ["flux-dev", "flux-dev"] }, deps),
    ).rejects.toThrow(/only enter once/);
    await expect(
      createShootout({ brief: "A red kettle on a table", kind: "image", models: ["a", "b", "c", "d"] }, deps),
    ).rejects.toThrow(/one to three/);
    expect(deps.calls).toHaveLength(0);
  });

  it("refines one render into a child round with the feedback as a new requirement", async () => {
    const deps = await fakeDeps();
    const parent = await createShootout(
      { brief: "A red kettle on a white table in morning light", kind: "image", models: ["flux-dev", "gemini-image"] },
      deps,
    );
    await runShootout(parent.id, deps);
    const child = await createRefine({ parentId: parent.id, entryId: "e1", feedback: "add a plume of steam" }, deps);
    expect(child.round).toBe(2);
    expect((await deps.store.get(parent.id))!.childIds).toEqual([child.id]);

    await runShootout(child.id, deps);
    const done = (await deps.store.get(child.id))!;
    expect(done.status).toBe("done");
    expect(done.entries).toHaveLength(1);
    expect(done.entries[0].model).toBe("flux-dev");
    expect(done.entries[0].prompt).toContain("(rewritten)");
    expect(done.requirements.map((r) => r.text)).toContain("a steam plume");
    expect(done.requirements.at(-1)?.fromFeedback).toBe(true);
  });

  it("records the human pick only on finished renders", async () => {
    const deps = await fakeDeps();
    const s = await createShootout(
      { brief: "A red kettle on a white table", kind: "image", models: ["flux-dev", "flux-schnell"] },
      deps,
    );
    await expect(pickEntry(s.id, "e1", deps)).rejects.toThrow(/Wait/);
    await runShootout(s.id, deps);
    await expect(pickEntry(s.id, "e2", deps)).rejects.toThrow(/finished/);
    expect((await pickEntry(s.id, "e1", deps)).userPickId).toBe("e1");
  });

  it("closes out a run orphaned by a restart without blaming the model", async () => {
    const deps = await fakeDeps();
    const s = await createShootout({ brief: "A red kettle on a white table", kind: "image", models: ["flux-dev"] }, deps);
    s.status = "running";
    s.entries[0].status = "rendering";
    const recovered = await recoverIfOrphaned(s, deps);
    expect(recovered.status).toBe("failed");
    expect(recovered.entries[0].status).toBe("ungraded");
  });
});
