/**
 * Pure readers for Livepeer Agent MCP responses. Every tool answers with a
 * JSON-RPC envelope whose `result` carries human text (`content[]`) and, on the
 * raw surface, a machine-readable `structuredContent`. We read the structured
 * field first and fall back to the text, so a surface change degrades rather
 * than breaks.
 */

type Json = Record<string, unknown>;

const asObj = (v: unknown): Json | undefined =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : undefined;

function result(payload: unknown): Json | undefined {
  return asObj(asObj(payload)?.result);
}

function structured(payload: unknown): Json | undefined {
  return asObj(result(payload)?.structuredContent);
}

function contentText(payload: unknown): string {
  const content = result(payload)?.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => (asObj(c)?.text as string | undefined) ?? "")
    .filter(Boolean)
    .join("\n");
}

const MEDIA_EXT = /\.(?:png|jpe?g|webp|gif|mp4|webm|mov|m4v|mp3|wav|m4a)(?:\?|$)/i;

export function extractUrl(payload: unknown): string | undefined {
  const sc = structured(payload);
  if (typeof sc?.url === "string" && sc.url.startsWith("http")) return sc.url;
  // Async submits mention poll URLs in their text; only accept real media there.
  const urls = contentText(payload).match(/https?:\/\/[^"'\s)\\]+/g) ?? [];
  return urls.map((u) => u.replace(/[.,]+$/, "")).find((u) => MEDIA_EXT.test(u));
}

export function extractJobId(payload: unknown): string | undefined {
  const sc = structured(payload);
  if (typeof sc?.job_id === "string" && sc.job_id) return sc.job_id;
  return contentText(payload).match(/mjob_[a-z0-9]+/)?.[0];
}

export function extractStatus(payload: unknown): string {
  const sc = structured(payload);
  if (typeof sc?.status === "string") return sc.status.toLowerCase();
  return "";
}

export function extractCost(payload: unknown): number | undefined {
  const sc = structured(payload);
  for (const key of ["cost_paid_usd", "cost_usd_estimated"]) {
    const v = sc?.[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

/** Provider-side elapsed time for async jobs, when reported. */
export function extractElapsedMs(payload: unknown): number | undefined {
  const v = structured(payload)?.elapsed_ms;
  return typeof v === "number" && v > 0 ? v : undefined;
}

/** The model's own words, for text-output capabilities (LLMs, vision). */
export function extractText(payload: unknown): string {
  const inner = asObj(structured(payload)?.result);
  if (typeof inner?.text === "string") return inner.text;
  const raw = contentText(payload);
  try {
    const parsed = asObj(JSON.parse(raw));
    if (typeof parsed?.text === "string") return parsed.text;
  } catch {
    /* plain text */
  }
  return raw;
}

export function isToolError(payload: unknown): boolean {
  const p = asObj(payload);
  if (p?.error) return true;
  const r = result(payload);
  if (r?.isError === true) return true;
  return structured(payload)?.ok === false;
}

export function extractErrorMessage(payload: unknown): string {
  const rpc = asObj(asObj(payload)?.error);
  if (typeof rpc?.message === "string") return rpc.message;
  const sc = structured(payload);
  if (typeof sc?.error === "string" && sc.error) return sc.error;
  return contentText(payload).slice(0, 400) || "Unknown Livepeer error";
}
