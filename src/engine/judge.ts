import { livepeer } from "@/livepeer/client";
import { mergeVotes, parseJudgeJson, type ParsedJudge } from "./judgeParse";
import type { JudgeResult, MediaKind, Requirement } from "./types";

/**
 * The blind judge. `nemotron-omni-vision` on Livepeer looks at the render (or,
 * for video, a 3-frame contact sheet) and answers the checklist. It is never
 * told which model made the render. Anchored 0-10 scales keep "craft" and
 * "aesthetics" comparable across shootouts.
 */

export const JUDGE_MODEL = "nemotron-omni-vision";

export function judgePrompt(brief: string, requirements: Requirement[], kind: MediaKind): string {
  const subject =
    kind === "video"
      ? "an AI-generated VIDEO, shown as 3 frames sampled left→right in time (start, middle, end)"
      : "an AI-generated IMAGE";
  return [
    `You are a strict, impartial art director. You are grading ${subject} against a client brief. You do not know which model made it.`,
    `BRIEF: "${brief}"`,
    "REQUIREMENTS:",
    ...requirements.map((r) => `${r.id}. ${r.text}`),
    "",
    'For EACH requirement answer "yes" (clearly satisfied), "partial" (present but wrong, weak or ambiguous) or "no" (absent or contradicted). Be strict: if you cannot clearly see it, it is not "yes". Quoted text must be spelled exactly to be "yes".',
    `craft 0-10: technical execution: anatomy, hands, faces, object geometry, text rendering, artifacts, blur${kind === "video" ? ", and consistency of subjects across the frames" : ""}. 10 flawless · 7 minor flaws · 4 obvious flaws · 1 broken. Scan the whole frame, not just the subject: garbled or pseudo-text on background signs and labels, stray glyphs, melted objects and extra limbs all count against craft.`,
    "aesthetics 0-10: composition, lighting, colour, polish. 10 portfolio-grade · 7 good stock photo · 4 amateur · 1 unusable.",
    "Calibrate: most AI renders have at least one flaw. Reserve 9-10 for work you could not fault on close inspection; a competent render with any visible issue is 6-8.",
    "defects: up to 4 specific visible flaws ([] only if you truly find none). verdict: one sentence.",
    "Reply with ONLY this JSON:",
    `{"checks":[${requirements.map((r) => `{"id":"${r.id}","verdict":"yes|partial|no","note":"short evidence"}`).join(",")}],"craft":0,"aesthetics":0,"defects":[],"verdict":""}`,
  ].join("\n");
}

/** Independent blind passes per render, merged (see mergeVotes). */
export const JUDGE_PASSES = 2;

async function onePass(args: {
  imageUrl: string;
  prompt: string;
  ids: string[];
  sessionId: string;
}): Promise<{ parsed: ParsedJudge | null; costUsd: number; text: string }> {
  let costUsd = 0;
  let text = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await livepeer().runCapability({
      capability: JUDGE_MODEL,
      prompt: attempt === 0 ? args.prompt : `${args.prompt}\n\nIMPORTANT: output the JSON object only, nothing else.`,
      inputs: { image_url: args.imageUrl },
      timeoutS: 45,
      sessionId: args.sessionId,
    });
    costUsd += res.costUsd ?? 0;
    text = res.text ?? "";
    const parsed = parseJudgeJson(text, args.ids);
    if (parsed) return { parsed, costUsd, text };
  }
  return { parsed: null, costUsd, text };
}

export async function judgeRender(args: {
  imageUrl: string;
  brief: string;
  requirements: Requirement[];
  kind: MediaKind;
  sessionId: string;
}): Promise<JudgeResult & { passes: number }> {
  const ids = args.requirements.map((r) => r.id);
  const prompt = judgePrompt(args.brief, args.requirements, args.kind);
  const passes = await Promise.allSettled(
    Array.from({ length: JUDGE_PASSES }, () => onePass({ imageUrl: args.imageUrl, prompt, ids, sessionId: args.sessionId })),
  );
  const ok = passes.flatMap((p) => (p.status === "fulfilled" && p.value.parsed ? [p.value.parsed] : []));
  const costUsd = passes.reduce((s, p) => s + (p.status === "fulfilled" ? p.value.costUsd : 0), 0);
  if (ok.length === 0) {
    const why = passes.map((p) => (p.status === "rejected" ? String(p.reason) : p.value.text.slice(0, 80))).join(" | ");
    throw new Error(`Judge returned no usable verdict: ${why.slice(0, 200)}`);
  }
  return {
    ...mergeVotes(ok),
    judgeModel: JUDGE_MODEL,
    judgedUrl: args.imageUrl,
    costUsd: round4(costUsd),
    passes: ok.length,
  };
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
