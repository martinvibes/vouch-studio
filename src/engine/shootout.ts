import { livepeer } from "@/livepeer/client";
import { store, type Store } from "@/store";
import { buildChecklist, feedbackRequirements, guessCategory } from "./checklist";
import { contender, estimateCostUsd } from "./contenders";
import { contactSheetUrl } from "./frames";
import { checkBudget, withSlot } from "./guards";
import { judgeRender } from "./judge";
import { rewritePrompt } from "./refine";
import { scoreEntry } from "./score";
import type { Category, Entry, JudgeResult, MediaKind, Requirement, Shootout } from "./types";

/**
 * The shootout: one brief, up to three contenders, rendered in parallel on
 * Livepeer and judged blind as each one lands. Every state transition is
 * persisted, so the Arena page can poll a single document and replay the run.
 */

export class ShootoutError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ShootoutError";
  }
}

/** The Livepeer-facing steps, injectable so the orchestration is testable offline. */
export type Deps = {
  store: Store;
  checklist(brief: string, kind: MediaKind, sessionId: string): Promise<{ category: Category; requirements: Requirement[] }>;
  render(args: { model: string; prompt: string; sessionId: string }): Promise<{ url: string; costUsd?: number }>;
  judgeableUrl(args: { url: string; kind: MediaKind; name: string }): Promise<string>;
  judge(args: { imageUrl: string; brief: string; requirements: Requirement[]; kind: MediaKind; sessionId: string }): Promise<JudgeResult>;
  feedbackRequirements(feedback: string, existing: Requirement[], sessionId: string): Promise<Requirement[]>;
  rewrite(args: { brief: string; previousPrompt: string; requirements: Requirement[]; entry: Entry; feedback: string; sessionId: string }): Promise<string>;
};

export const liveDeps = (): Deps => ({
  store: store(),
  checklist: buildChecklist,
  async render({ model, prompt, sessionId }) {
    const c = contender(model);
    if (!c) throw new Error(`Unknown contender ${model}`);
    const res = await livepeer().runCapability({ capability: model, prompt, inputs: c.inputs, timeoutS: c.timeoutS, sessionId });
    if (!res.url) throw new Error("The network returned no media URL");
    return { url: res.url, costUsd: res.costUsd };
  },
  judgeableUrl: ({ url, kind, name }) => (kind === "video" ? contactSheetUrl(url, name) : Promise.resolve(url)),
  judge: judgeRender,
  feedbackRequirements,
  rewrite: rewritePrompt,
});

/** Estimated judge spend per entry (two vision passes), for the budget check. */
const JUDGE_ESTIMATE_USD = 0.012;
export const BRIEF_MIN = 8;
export const BRIEF_MAX = 600;

const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);
const errText = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300);

export function validateModels(kind: MediaKind, models: unknown): string[] {
  if (!Array.isArray(models) || models.length < 1 || models.length > 3) {
    throw new ShootoutError("Pick one to three contenders.");
  }
  const ids = [...new Set(models.map(String))];
  if (ids.length !== models.length) throw new ShootoutError("Each contender can only enter once.");
  for (const id of ids) {
    const c = contender(id);
    if (!c) throw new ShootoutError(`Unknown contender "${id}".`);
    if (c.kind !== kind) throw new ShootoutError(`"${id}" is a ${c.kind} model, not ${kind}.`);
  }
  return ids;
}

export function validateBrief(brief: unknown): string {
  const b = typeof brief === "string" ? brief.replace(/\s+/g, " ").trim() : "";
  if (b.length < BRIEF_MIN) throw new ShootoutError(`Write a brief of at least ${BRIEF_MIN} characters.`);
  if (b.length > BRIEF_MAX) throw new ShootoutError(`Keep the brief under ${BRIEF_MAX} characters.`);
  return b;
}

export function estimateShootoutUsd(models: string[]): number {
  return models.reduce((sum, m) => sum + estimateCostUsd(contender(m)!) + JUDGE_ESTIMATE_USD, 0);
}

export async function createShootout(
  input: { brief: unknown; kind: unknown; models: unknown },
  deps: Deps = liveDeps(),
): Promise<Shootout> {
  const kind: MediaKind = input.kind === "video" ? "video" : "image";
  const brief = validateBrief(input.brief);
  const models = validateModels(kind, input.models);
  checkBudget(await deps.store.list(), estimateShootoutUsd(models));

  const id = newId();
  const now = Date.now();
  const s: Shootout = {
    id,
    createdAt: now,
    updatedAt: now,
    brief,
    kind,
    category: guessCategory(brief, kind), // refined by the checklist model during planning
    requirements: [],
    entries: models.map((model, i) => ({ id: `e${i + 1}`, model, prompt: brief, status: "queued" })),
    status: "queued",
    round: 1,
    sessionId: `vouch_${id}`,
  };
  await deps.store.save(s);
  return s;
}

/** Start a refine round: same model, the reviewer's feedback, a rewritten prompt. */
export async function createRefine(
  input: { parentId: string; entryId: unknown; feedback: unknown },
  deps: Deps = liveDeps(),
): Promise<Shootout> {
  const parent = await deps.store.get(input.parentId);
  if (!parent) throw new ShootoutError("Shootout not found.", 404);
  if (parent.status !== "done") throw new ShootoutError("Wait for the shootout to finish before refining.", 409);
  const entry = parent.entries.find((e) => e.id === input.entryId);
  if (!entry?.outputUrl) throw new ShootoutError("Pick a render that finished to refine.");
  const feedback = typeof input.feedback === "string" ? input.feedback.replace(/\s+/g, " ").trim() : "";
  if (feedback.length < 3 || feedback.length > 400) throw new ShootoutError("Feedback should be 3 to 400 characters.");
  checkBudget(await deps.store.list(), estimateShootoutUsd([entry.model]));

  const id = newId();
  const now = Date.now();
  const child: Shootout = {
    id,
    createdAt: now,
    updatedAt: now,
    brief: parent.brief,
    kind: parent.kind,
    category: parent.category,
    requirements: parent.requirements.map((r) => ({ ...r })),
    entries: [{ id: "e1", model: entry.model, prompt: entry.prompt, status: "queued" }],
    status: "queued",
    parentId: parent.id,
    parentEntryId: entry.id,
    round: parent.round + 1,
    feedback,
    sessionId: `vouch_${id}`,
  };
  await deps.store.save(child);
  parent.childIds = [...(parent.childIds ?? []), id];
  await deps.store.save(parent);
  return child;
}

async function runEntry(s: Shootout, e: Entry, deps: Deps): Promise<void> {
  const save = () => deps.store.save(s);
  e.status = "rendering";
  e.startedAt = Date.now();
  await save();
  try {
    const out = await deps.render({ model: e.model, prompt: e.prompt, sessionId: s.sessionId });
    e.renderMs = Date.now() - e.startedAt;
    e.outputUrl = out.url;
    e.renderCostUsd = out.costUsd ?? estimateCostUsd(contender(e.model)!);
  } catch (err) {
    e.renderMs = Date.now() - e.startedAt;
    e.status = "failed";
    e.error = errText(err);
    e.score = scoreEntry({ kind: s.kind, requirements: s.requirements, failed: true });
    await save();
    return;
  }

  e.status = "judging";
  await save();
  try {
    const judgedUrl = await deps.judgeableUrl({ url: e.outputUrl, kind: s.kind, name: `${s.id}-${e.id}` });
    e.judge = await deps.judge({
      imageUrl: judgedUrl,
      brief: s.brief,
      requirements: s.requirements,
      kind: s.kind,
      sessionId: s.sessionId,
    });
    e.score = scoreEntry({
      kind: s.kind,
      requirements: s.requirements,
      judge: e.judge,
      costUsd: e.renderCostUsd,
      renderMs: e.renderMs,
    });
    e.status = "done";
  } catch (err) {
    // The render is real and paid for; only the verdict is missing. Keep it
    // visible but out of the Board. Never re-render to get a second chance.
    e.status = "ungraded";
    e.error = `Judge unavailable: ${errText(err)}`;
  }
  await save();
}

/** Pick the judge's winner and close the shootout. Idempotent. */
export function finalize(s: Shootout): void {
  const graded = s.entries.filter((e) => e.status === "done" && e.score);
  const best = [...graded].sort(
    (a, b) => b.score!.total - a.score!.total || (a.renderCostUsd ?? 0) - (b.renderCostUsd ?? 0),
  )[0];
  s.winnerId = best?.id;
  const anyOutput = s.entries.some((e) => e.outputUrl);
  s.status = anyOutput ? "done" : "failed";
  if (!anyOutput) s.error ??= "No contender produced a render.";
}

export async function runShootout(id: string, deps: Deps = liveDeps()): Promise<void> {
  const s = await deps.store.get(id);
  if (!s || s.status === "done" || s.status === "failed") return;
  await withSlot(async () => {
    try {
      s.status = "planning";
      await deps.store.save(s);

      if (s.round === 1) {
        const plan = await deps.checklist(s.brief, s.kind, s.sessionId);
        s.category = plan.category;
        s.requirements = plan.requirements;
      } else if (s.feedback) {
        const parent = s.parentId ? await deps.store.get(s.parentId) : undefined;
        const parentEntry = parent?.entries.find((e) => e.id === s.parentEntryId);
        const extra = await deps.feedbackRequirements(s.feedback, s.requirements, s.sessionId);
        s.requirements = [...s.requirements, ...extra];
        if (parentEntry) {
          s.entries[0].prompt = await deps.rewrite({
            brief: s.brief,
            previousPrompt: parentEntry.prompt,
            requirements: s.requirements,
            entry: parentEntry,
            feedback: s.feedback,
            sessionId: s.sessionId,
          });
        }
      }

      s.status = "running";
      await deps.store.save(s);
      await Promise.all(s.entries.map((e) => runEntry(s, e, deps)));
      finalize(s);
    } catch (err) {
      s.status = "failed";
      s.error = errText(err);
    }
    await deps.store.save(s);
  });
}

// ── In-flight registry ──────────────────────────────────────────────────
// Runs are fire-and-forget from the POST handler. The registry lets readers
// tell a live run from one orphaned by a server restart.
const g = globalThis as unknown as { __vouchRuns?: Map<string, Promise<void>> };
const runs = () => (g.__vouchRuns ??= new Map());

export function startShootout(id: string, deps?: Deps): void {
  if (runs().has(id)) return;
  const p = runShootout(id, deps)
    .catch((err) => console.error(`[vouch] shootout ${id} crashed:`, err))
    .finally(() => runs().delete(id));
  runs().set(id, p);
}

export function isRunning(id: string): boolean {
  return runs().has(id);
}

/**
 * A shootout left mid-flight by a restart can never finish. Close it out:
 * finished renders keep their verdicts; anything unfinished is marked
 * ungraded (not failed — a restart says nothing about the model).
 */
export async function recoverIfOrphaned(s: Shootout, deps: Pick<Deps, "store"> = { store: store() }): Promise<Shootout> {
  if (s.status === "done" || s.status === "failed" || isRunning(s.id)) return s;
  for (const e of s.entries) {
    if (e.status === "queued" || e.status === "rendering" || e.status === "judging") {
      e.status = "ungraded";
      e.error = "Interrupted by a server restart.";
    }
  }
  finalize(s);
  if (!s.entries.some((e) => e.outputUrl)) s.error = "Interrupted by a server restart.";
  await deps.store.save(s);
  return s;
}

/** The human's call. Stored next to the judge's so the Board can report agreement. */
export async function pickEntry(id: string, entryId: unknown, deps: Pick<Deps, "store"> = { store: store() }): Promise<Shootout> {
  const s = await deps.store.get(id);
  if (!s) throw new ShootoutError("Shootout not found.", 404);
  if (s.status !== "done") throw new ShootoutError("Wait for the verdict before picking.", 409);
  const entry = s.entries.find((e) => e.id === entryId);
  if (!entry?.outputUrl) throw new ShootoutError("You can only pick a render that finished.");
  s.userPickId = entry.id;
  await deps.store.save(s);
  return s;
}
