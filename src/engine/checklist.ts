import { livepeer } from "@/livepeer/client";
import { extractJsonObject } from "./judgeParse";
import { IMAGE_CATEGORIES, VIDEO_CATEGORIES, type Category, type MediaKind, type Requirement } from "./types";

/**
 * Brief → checklist. A holistic "is this good?" from a small vision model is
 * noise; "is there a blue fox logo on the mug?" is a question it can answer.
 * So before anything renders, the brief is decomposed (by `gemini-text` on
 * Livepeer) into 4-8 atomic, visually verifiable requirements, and every
 * contender is judged against the same list.
 */

export const CHECKLIST_MODEL = "gemini-text";

export function categoriesFor(kind: MediaKind): readonly Category[] {
  return kind === "image" ? IMAGE_CATEGORIES : VIDEO_CATEGORIES;
}

const KEYWORDS: Record<MediaKind, [Category, RegExp][]> = {
  image: [
    ["typography", /"[^"]{2,}"|\b(text|sign|reads|says|lettering|poster|title|typograph\w*|headline|label that)\b/i],
    ["product", /\b(product|packag\w*|bottle|mug|shoe|sneaker|watch|phone|perfume|headphones?|studio shot|e-?commerce)\b/i],
    ["food", /\b(food|dish|burger|pizza|sushi|cake|dessert|plate|meal|ramen|salad|pastry|cocktail)\b/i],
    ["portrait", /\b(portrait|headshot|face|selfie|woman|man|person|girl|boy|elderly)\b/i],
    ["character", /\b(character|creature|robot|dragon|mascot|cartoon|anime|monster|hero|wizard|knight)\b/i],
    ["architecture", /\b(building|interior|architecture|house|room|facade|skyline|bridge|cathedral|kitchen|office)\b/i],
    ["landscape", /\b(landscape|mountain|forest|ocean|beach|desert|lake|valley|sunset|field|waterfall)\b/i],
  ],
  video: [
    ["action", /\b(run\w*|chase|explo\w*|jump\w*|race|racing|fight\w*|sport\w*|skat\w*|surf\w*|crash\w*|drift\w*)\b/i],
    ["product", /\b(product|packag\w*|bottle|mug|shoe|sneaker|watch|phone|perfume|commercial|turntable)\b/i],
    ["character", /\b(person|woman|man|girl|boy|character|robot|creature|dancer|chef)\b/i],
    ["nature", /\b(forest|ocean|wave|river|mountain|sky|cloud|rain|snow|bird|animal|flower|sunset|storm)\b/i],
  ],
};

export function guessCategory(brief: string, kind: MediaKind): Category {
  for (const [cat, re] of KEYWORDS[kind]) if (re.test(brief)) return cat;
  return kind === "image" ? "landscape" : "nature";
}

/** Deterministic fallback: split the brief into clauses. */
export function fallbackRequirements(brief: string): Requirement[] {
  const clauses = brief
    .split(/[,;.\n]|\band\b|\bwith\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
  const list = (clauses.length ? clauses : [brief.trim()]).slice(0, 6);
  return list.map((text, i) => ({ id: `r${i + 1}`, text: text[0].toUpperCase() + text.slice(1) }));
}

export function checklistPrompt(brief: string, kind: MediaKind): string {
  return [
    "You turn a creative brief into a grading checklist for an AI-generated " + kind + ".",
    `BRIEF: "${brief}"`,
    "Rules:",
    "- 4 to 8 requirements. Each is ONE atomic fact a viewer can confirm just by looking: a subject, an attribute (colour, material, count), the setting, the lighting, the style, the framing, or exact text.",
    "- Keep EVERY modifier from the brief as its own checkable fact: size ('small'), count ('exactly three'), colour, material, position ('to the left of'), time of day. Do not merge or drop them.",
    "- Keep any quoted text verbatim, in quotes, and require it to be spelled exactly.",
    kind === "video" ? "- Include exactly one requirement about the motion or camera move." : "",
    "- Never grade subjective taste ('beautiful', 'stunning') or resolution. Under 14 words each.",
    `- category: the single best fit from [${categoriesFor(kind).join(", ")}].`,
    'Reply with ONLY JSON: {"category":"...","requirements":["...","..."]}',
  ]
    .filter(Boolean)
    .join("\n");
}

export function parseChecklist(
  text: string,
  kind: MediaKind,
): { category?: Category; requirements: Requirement[] } | null {
  const obj = extractJsonObject(text);
  if (!obj || !Array.isArray(obj.requirements)) return null;
  const reqs = obj.requirements
    .map((r) => (typeof r === "string" ? r : typeof (r as { text?: unknown })?.text === "string" ? (r as { text: string }).text : ""))
    .map((r) => r.trim().replace(/^\d+[.)]\s*/, ""))
    .filter((r) => r.length > 2)
    .slice(0, 8);
  if (reqs.length < 3) return null;
  const cat = typeof obj.category === "string" ? (obj.category.toLowerCase() as Category) : undefined;
  return {
    category: cat && categoriesFor(kind).includes(cat) ? cat : undefined,
    requirements: reqs.map((text, i) => ({ id: `r${i + 1}`, text })),
  };
}

export async function buildChecklist(
  brief: string,
  kind: MediaKind,
  sessionId: string,
): Promise<{ category: Category; requirements: Requirement[]; source: "llm" | "fallback" }> {
  try {
    const res = await livepeer().runCapability({
      capability: CHECKLIST_MODEL,
      prompt: checklistPrompt(brief, kind),
      timeoutS: 37,
      sessionId,
    });
    const parsed = parseChecklist(res.text ?? "", kind);
    if (parsed) {
      return { category: parsed.category ?? guessCategory(brief, kind), requirements: parsed.requirements, source: "llm" };
    }
  } catch {
    /* fall through to the deterministic checklist */
  }
  return { category: guessCategory(brief, kind), requirements: fallbackRequirements(brief), source: "fallback" };
}

/** Turn free-text refine feedback into extra requirements (same LLM, same rules). */
export async function feedbackRequirements(
  feedback: string,
  existing: Requirement[],
  sessionId: string,
): Promise<Requirement[]> {
  const start = existing.length + 1;
  const toReq = (text: string, i: number): Requirement => ({ id: `r${start + i}`, text, fromFeedback: true });
  try {
    const res = await livepeer().runCapability({
      capability: CHECKLIST_MODEL,
      prompt: [
        "A client reviewed an AI-generated render and gave feedback. Turn the feedback into 1-2 atomic, visually verifiable requirements (under 14 words each) that a viewer could confirm by looking. Do not repeat these existing requirements:",
        ...existing.map((r) => `- ${r.text}`),
        `FEEDBACK: "${feedback}"`,
        'Reply with ONLY JSON: {"requirements":["..."]}',
      ].join("\n"),
      timeoutS: 37,
      sessionId,
    });
    const obj = extractJsonObject(res.text ?? "");
    const list = Array.isArray(obj?.requirements)
      ? (obj!.requirements as unknown[]).filter((r): r is string => typeof r === "string" && r.trim().length > 2)
      : [];
    if (list.length) return list.slice(0, 2).map((t, i) => toReq(t.trim(), i));
  } catch {
    /* fall back to the feedback itself */
  }
  return [toReq(feedback.trim().slice(0, 120), 0)];
}
