import { livepeer } from "@/livepeer/client";
import type { Entry, Requirement } from "./types";

/**
 * Refine: turn the reviewer's feedback plus the judge's evidence (which checks
 * failed, which defects it saw) into a better prompt for the same model. The
 * rewrite runs on `gemini-text` via Livepeer.
 */

export const REWRITE_MODEL = "gemini-text";

export function rewritePromptText(args: {
  brief: string;
  previousPrompt: string;
  requirements: Requirement[];
  entry: Entry;
  feedback: string;
}): string {
  const failed = (args.entry.judge?.checks ?? [])
    .filter((c) => c.verdict !== "yes")
    .map((c) => {
      const req = args.requirements.find((r) => r.id === c.id);
      return `- ${req?.text ?? c.id} → judged "${c.verdict}"${c.note ? `: ${c.note}` : ""}`;
    });
  const defects = (args.entry.judge?.defects ?? []).map((d) => `- ${d}`);
  return [
    "You are a prompt engineer for a text-to-image/video model. Rewrite the prompt so the next render satisfies the brief AND the client's feedback.",
    `ORIGINAL BRIEF: "${args.brief}"`,
    `PREVIOUS PROMPT: "${args.previousPrompt}"`,
    failed.length ? `REQUIREMENTS THE LAST RENDER MISSED:\n${failed.join("\n")}` : "The last render met every requirement.",
    defects.length ? `DEFECTS SEEN:\n${defects.join("\n")}` : "",
    `CLIENT FEEDBACK: "${args.feedback}"`,
    "Rules: keep every requirement of the brief; state counts, colours, positions and any exact quoted text explicitly; be concrete and visual; under 90 words; no preamble.",
    "Reply with ONLY the new prompt.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function cleanRewrite(text: string): string {
  return text
    .replace(/^```[a-z]*\s*|```$/gim, "")
    .replace(/^(new prompt|prompt)\s*:\s*/i, "")
    .trim()
    .replace(/^["“]|["”]$/g, "")
    .trim()
    .slice(0, 900);
}

export async function rewritePrompt(args: Parameters<typeof rewritePromptText>[0] & { sessionId: string }): Promise<string> {
  try {
    const res = await livepeer().runCapability({
      capability: REWRITE_MODEL,
      prompt: rewritePromptText(args),
      timeoutS: 37,
      sessionId: args.sessionId,
    });
    const next = cleanRewrite(res.text ?? "");
    if (next.length > 12) return next;
  } catch {
    /* fall back below */
  }
  return `${args.previousPrompt}. ${args.feedback}`.slice(0, 900);
}
